import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parseBrokerageWorkbook,
  tagFromCode,
  computeEmployeeRollup,
  fmt,
  type BrokerRow,
  type Employee,
  type EmployeeRollup,
  type SubBroker,
} from "@/lib/brokerage";

export const Route = createFileRoute("/_app/upload")({
  component: UploadPage,
});

function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState<string>("");
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [rollup, setRollup] = useState<EmployeeRollup[]>([]);
  const [busy, setBusy] = useState(false);

  const onPick = async (f: File | null) => {
    setFile(f);
    setRows([]);
    setRollup([]);
    if (!f) return;
    const buf = await f.arrayBuffer();
    const parsed = parseBrokerageWorkbook(buf);
    setRows(parsed.rows);
    if (parsed.date) setDate(parsed.date);
    toast.success(
      `Parsed ${parsed.rows.length} brokers${parsed.date ? ` for ${parsed.date}` : ""}`,
    );

    const [e, s] = await Promise.all([
      supabase.from("employees").select("*"),
      supabase.from("sub_brokers").select("*"),
    ]);
    const employees = (e.data ?? []) as Employee[];
    const subs = (s.data ?? []) as SubBroker[];
    setRollup(computeEmployeeRollup(parsed.rows, employees, subs));
  };

  const save = async () => {
    if (!date) return toast.error("Pick a date for this upload");
    if (rows.length === 0) return toast.error("Nothing to save");
    setBusy(true);
    try {
      // Upsert sub_brokers (auto-discover new codes, leave employee_id null)
      const existing = await supabase.from("sub_brokers").select("code");
      const have = new Set((existing.data ?? []).map((r) => r.code));
      const employeeCodes = new Set(
        ((await supabase.from("employees").select("code")).data ?? [])
          .map((r) => r.code)
          .filter(Boolean) as string[],
      );
      const newSubs = rows
        .filter((r) => !have.has(r.code) && !employeeCodes.has(r.code))
        .map((r) => ({ code: r.code, name: r.name, tag: tagFromCode(r.code) }));
      if (newSubs.length) {
        await supabase.from("sub_brokers").insert(newSubs);
      }

      // Wipe + insert daily_brokerage for that date
      await supabase.from("daily_brokerage").delete().eq("date", date);
      const payload = rows.map((r) => ({
        date,
        code: r.code,
        name: r.name,
        gross: r.gross,
        share: r.share,
        net: r.net,
      }));
      // chunk
      const chunks = [];
      for (let i = 0; i < payload.length; i += 500) chunks.push(payload.slice(i, i + 500));
      for (const c of chunks) {
        const { error } = await supabase.from("daily_brokerage").insert(c);
        if (error) throw error;
      }

      await supabase.from("daily_uploads").upsert({
        date,
        filename: file?.name ?? null,
        row_count: rows.length,
      });
      // mark calendar
      await supabase.from("calendar_days").upsert({ date, is_holiday: false });

      toast.success("Saved to database");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Brokerage Excel</CardTitle>
          <CardDescription>
            Drop the daily SSJ Brokerage Analysis Report. Date is auto-detected from the file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_220px_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="file">Excel file (.xlsx)</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={save} disabled={busy || rows.length === 0}>
                {busy ? "Saving…" : "Save to database"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {rollup.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview — Employee totals</CardTitle>
            <CardDescription>100% of own + 50% of mapped sub-brokers</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Employee</th>
                  <th>Own code</th>
                  <th className="text-right">Own 100%</th>
                  <th className="text-right">Mapped 50%</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rollup.map((r) => (
                  <tr key={r.employee_id} className="border-b">
                    <td className="py-2 font-medium">{r.employee_name}</td>
                    <td>{r.own_code ?? "—"}</td>
                    <td className="text-right">{fmt(r.own_net)}</td>
                    <td className="text-right">{fmt(r.shared_net)}</td>
                    <td className="text-right font-semibold">{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Parsed brokers ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2">Code</th>
                    <th>Name</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right">Share</th>
                    <th className="text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code} className="border-b">
                      <td className="py-1.5 font-mono text-xs">{r.code}</td>
                      <td className="text-xs">{r.name}</td>
                      <td className="text-right">{fmt(r.gross)}</td>
                      <td className="text-right">{fmt(r.share)}</td>
                      <td className="text-right">{fmt(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
