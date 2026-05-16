import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import {
  computeEmployeeRollup,
  downloadCsv,
  downloadXlsx,
  fmt,
  type BrokerRow,
  type Employee,
  type SubBroker,
} from "@/lib/brokerage";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

type Range = { from: string; to: string };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthBounds(d = new Date()): Range {
  const f = new Date(d.getFullYear(), d.getMonth(), 1);
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
}
function yearBounds(d = new Date()): Range {
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
}

function ReportsPage() {
  const [tab, setTab] = useState("day");
  const [day, setDay] = useState(todayStr());
  const [monthRange, setMonthRange] = useState(monthBounds());
  const [yearRange, setYearRange] = useState(yearBounds());
  const [custom, setCustom] = useState<Range>(monthBounds());

  const range: Range =
    tab === "day"
      ? { from: day, to: day }
      : tab === "month"
        ? monthRange
        : tab === "year"
          ? yearRange
          : custom;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>
            Generate downloadable employee brokerage reports with 100% own + 50% mapped split.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
            <TabsContent value="day" className="pt-4">
              <div className="max-w-xs space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </div>
            </TabsContent>
            <TabsContent value="month" className="pt-4">
              <div className="flex gap-3">
                <div className="space-y-1.5">
                  <Label>Month</Label>
                  <Input
                    type="month"
                    value={monthRange.from.slice(0, 7)}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split("-").map(Number);
                      setMonthRange(monthBounds(new Date(y, m - 1, 1)));
                    }}
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="year" className="pt-4">
              <div className="max-w-xs space-y-1.5">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={yearRange.from.slice(0, 4)}
                  onChange={(e) => setYearRange(yearBounds(new Date(Number(e.target.value), 0, 1)))}
                />
              </div>
            </TabsContent>
            <TabsContent value="custom" className="pt-4">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={custom.from}
                    onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={custom.to}
                    onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ReportPanel from={range.from} to={range.to} />
    </div>
  );
}

function ReportPanel({ from, to }: { from: string; to: string }) {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [subs, setSubs] = useState<SubBroker[]>([]);
  const [brokerage, setBrokerage] = useState<
    { date: string; code: string; name: string | null; gross: number; share: number; net: number }[]
  >([]);

  useEffect(() => {
    (async () => {
      if (!from || !to) return;
      setLoading(true);
      const [e, s, b] = await Promise.all([
        supabase.from("employees").select("*"),
        supabase.from("sub_brokers").select("*"),
        supabase
          .from("daily_brokerage")
          .select("*")
          .gte("date", from)
          .lte("date", to)
          .order("date"),
      ]);
      setEmployees((e.data ?? []) as Employee[]);
      setSubs((s.data ?? []) as SubBroker[]);
      setBrokerage(
        (b.data ?? []).map((r) => ({
          ...r,
          gross: Number(r.gross),
          share: Number(r.share),
          net: Number(r.net),
        })),
      );
      setLoading(false);
    })();
  }, [from, to]);

  const aggregated = useMemo<BrokerRow[]>(() => {
    const m = new Map<string, BrokerRow>();
    for (const r of brokerage) {
      const k = r.code.trim().toUpperCase();
      const prev = m.get(k);
      if (prev) {
        prev.gross += r.gross;
        prev.share += r.share;
        prev.net += r.net;
      } else {
        m.set(k, { code: r.code, name: r.name ?? "", gross: r.gross, share: r.share, net: r.net });
      }
    }
    return Array.from(m.values()).sort((a, b) => b.net - a.net);
  }, [brokerage]);

  const rollup = useMemo(
    () => computeEmployeeRollup(aggregated, employees, subs),
    [aggregated, employees, subs],
  );

  // Per-broker detail rows enriched with employee tag
  const detail = useMemo(() => {
    const empById = new Map(employees.map((e) => [e.id, e.name]));
    const empByOwn = new Map(
      employees.filter((e) => e.code).map((e) => [e.code!.toUpperCase(), e]),
    );
    const subByCode = new Map(subs.map((s) => [s.code.toUpperCase(), s]));
    const defaultEmp = employees.find((e) => e.is_default);
    return aggregated.map((r) => {
      const c = r.code.trim().toUpperCase();
      let owner: string | null = null;
      let role: "OWN" | "AP" | "SUB" | "—" = "—";
      let employeeShare = 0;
      let subShare = 0;
      if (empByOwn.has(c)) {
        owner = empByOwn.get(c)!.name;
        role = "OWN";
        employeeShare = r.net; // 100%
      } else {
        const sb = subByCode.get(c);
        const empId = sb?.employee_id ?? defaultEmp?.id ?? null;
        owner = empId ? (empById.get(empId) ?? null) : null;
        role = (sb?.tag as "AP" | "SUB" | null) ?? "—";
        subShare = r.net * 0.5;
      }
      return {
        Employee: owner ?? "—",
        Code: r.code,
        Name: r.name,
        Tag: role,
        "Total Brokerage (Gross)": r.gross,
        Share: r.share,
        "Net SSJ Part": r.net,
        "Employee 100% (own)": employeeShare,
        "Sub-broker 50% share": subShare,
        Total: employeeShare + subShare,
      };
    });
  }, [aggregated, employees, subs]);

  const empSummary = rollup.map((r) => ({
    Employee: r.employee_name,
    "Own code": r.own_code ?? "",
    "Own Net (100%)": r.own_net,
    "Mapped Net (50%)": r.shared_net,
    Total: r.total,
    "Mapped count": r.mapped_codes.length,
  }));

  const filename = `brokerage_${from}_to_${to}`;

  const downloadAll = () => {
    if (detail.length === 0) return toast.error("No data in range");
    downloadXlsx(`${filename}.xlsx`, [
      { name: "Employee Summary", rows: empSummary },
      { name: "Broker Detail", rows: detail },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>
              Report: {from} → {to}
            </CardTitle>
            <CardDescription>
              {loading ? "Loading…" : `${brokerage.length} rows · ${rollup.length} employees`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => downloadCsv(`${filename}_employees.csv`, empSummary)}
              disabled={!empSummary.length}
            >
              <Download className="mr-1 h-4 w-4" /> CSV (Employees)
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCsv(`${filename}_detail.csv`, detail)}
              disabled={!detail.length}
            >
              <Download className="mr-1 h-4 w-4" /> CSV (Detail)
            </Button>
            <Button onClick={downloadAll} disabled={!detail.length}>
              <Download className="mr-1 h-4 w-4" /> Download XLSX
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Employee Summary</h3>
          <div className="overflow-x-auto">
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
                    <td className="font-mono text-xs">{r.own_code ?? "—"}</td>
                    <td className="text-right">{fmt(r.own_net)}</td>
                    <td className="text-right">{fmt(r.shared_net)}</td>
                    <td className="text-right font-semibold">{fmt(r.total)}</td>
                  </tr>
                ))}
                {rollup.length > 0 && (
                  <tr>
                    <td colSpan={4} className="py-2 text-right font-semibold">
                      Grand total
                    </td>
                    <td className="text-right font-bold">
                      {fmt(rollup.reduce((s, r) => s + r.total, 0))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Broker Detail ({detail.length})</h3>
          <div className="max-h-[60vh] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2">Employee</th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Tag</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Share</th>
                  <th className="text-right">Net</th>
                  <th className="text-right">Emp 100%</th>
                  <th className="text-right">Sub 50%</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-2 py-1.5 text-xs">{r.Employee}</td>
                    <td className="font-mono text-xs">{r.Code}</td>
                    <td className="text-xs">{r.Name}</td>
                    <td className="text-xs">{r.Tag}</td>
                    <td className="text-right text-xs">{fmt(r["Total Brokerage (Gross)"])}</td>
                    <td className="text-right text-xs">{fmt(r.Share)}</td>
                    <td className="text-right text-xs">{fmt(r["Net SSJ Part"])}</td>
                    <td className="text-right text-xs">{fmt(r["Employee 100% (own)"])}</td>
                    <td className="text-right text-xs">{fmt(r["Sub-broker 50% share"])}</td>
                    <td className="text-right text-xs font-semibold">{fmt(r.Total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
