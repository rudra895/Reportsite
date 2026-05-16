import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
} from "@/lib/brokerage";
import { OWNER_NAME } from "@/constants";
import type { 
  BrokerRow, 
  Employee, 
  EmployeeRollup, 
  SubBroker 
} from "@/types/brokerage";
import { Upload, FileSpreadsheet, Save, Crown } from "lucide-react";

export const Route = createFileRoute("/_app/upload")({
  component: UploadPage,
});

/* ---------- FadeUp animation ---------- */
function FadeUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className={`transition-all duration-700 ease-out ${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}>
      {children}
    </div>
  );
}

function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState<string>("");
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [rollup, setRollup] = useState<EmployeeRollup[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const onPick = async (f: File | null) => {
    setFile(f);
    setRows([]);
    setRollup([]);
    if (!f) return;
    const buf = await f.arrayBuffer();
    const parsed = parseBrokerageWorkbook(buf);
    setRows(parsed.rows);
    if (parsed.date) setDate(parsed.date);
    toast.success(`Parsed ${parsed.rows.length} brokers${parsed.date ? ` for ${parsed.date}` : ""}`);

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
      await supabase
        .from("calendar_days")
        .upsert({ date, is_holiday: false });

      toast.success("Saved to database");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const ganpatTotal = computeGanpatTotal(rollup);

  return (
    <div className="space-y-6">
      <FadeUp>
        <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                <Upload className="h-4 w-4 text-white" />
              </div>
              Upload Brokerage Excel
            </CardTitle>
            <CardDescription>
              Drop the daily SSJ Brokerage Analysis Report. Date is auto-detected from the file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drag & Drop zone */}
            <div
              className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
                dragActive
                  ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 scale-[1.01]"
                  : "border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const f = e.dataTransfer.files[0];
                if (f) onPick(f);
              }}
            >
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag & drop your Excel file here, or click to browse
              </p>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                className="max-w-xs mx-auto cursor-pointer"
              />
              {file && (
                <p className="mt-3 text-xs text-blue-600 dark:text-blue-400 font-medium animate-fade-in">
                  📄 {file.name}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
              </div>
              <Button
                onClick={save}
                disabled={busy || rows.length === 0}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving…
                  </span>
                ) : (
                  <>
                    <Save className="mr-1 h-4 w-4" /> Save to database
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </FadeUp>

      {rollup.length > 0 && (
        <FadeUp delay={200}>
          <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Preview — Employee Totals</CardTitle>
              <CardDescription>Employees: 100% own + 50% mapped · {OWNER_NAME}: 100% own + 100% unmapped + 50% all mapped</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-left text-muted-foreground">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Employee</th>
                      <th className="px-2 font-semibold">Own code</th>
                      <th className="text-right px-4 font-semibold">Own 100%</th>
                      <th className="text-right px-4 font-semibold">Sub-broker Share</th>
                      <th className="text-right px-4 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollup.map((r) => {
                      const isGanpat = r.ganpat_net === 0 && r.shared_net > 0;
                      return (
                        <tr key={r.employee_id} className={`border-b hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${isGanpat ? "bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-l-amber-400" : ""}`}>
                          <td className={`py-3 px-4 font-medium ${isGanpat ? "text-amber-700 dark:text-amber-400" : ""}`}>
                            <div className="flex items-center gap-2">
                              {isGanpat && <Crown className="h-4 w-4 text-amber-500" />}
                              {r.employee_name}
                            </div>
                          </td>
                          <td className="px-2 font-mono text-xs text-muted-foreground">{r.own_code ?? "—"}</td>
                          <td className="text-right px-4">{fmt(r.own_net)}</td>
                          <td className={`text-right px-4 font-medium ${isGanpat ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {fmt(r.shared_net)}
                            {isGanpat && <div className="text-[10px] text-amber-500/70 mt-0.5">100% unmapped + 50% mapped</div>}
                          </td>
                          <td className={`text-right px-4 font-bold ${isGanpat ? "text-amber-700 dark:text-amber-400 text-lg" : ""}`}>{fmt(r.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </FadeUp>
      )}

      {rows.length > 0 && (
        <FadeUp delay={400}>
          <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Parsed Brokers ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 px-3 font-semibold">Code</th>
                      <th className="px-2 font-semibold">Name</th>
                      <th className="text-right px-3 font-semibold">Gross</th>
                      <th className="text-right px-3 font-semibold">Share</th>
                      <th className="text-right px-3 font-semibold">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code} className="border-b hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-1.5 px-3 font-mono text-xs">{r.code}</td>
                        <td className="px-2 text-xs">{r.name}</td>
                        <td className="text-right px-3">{fmt(r.gross)}</td>
                        <td className="text-right px-3">{fmt(r.share)}</td>
                        <td className="text-right px-3 font-medium">{fmt(r.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </FadeUp>
      )}
    </div>
  );
}
