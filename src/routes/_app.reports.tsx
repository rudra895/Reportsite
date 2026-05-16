import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, FileBarChart, Crown } from "lucide-react";
import {
  computeEmployeeRollup,
  downloadCsv,
  downloadXlsx,
  fmt,
} from "@/lib/brokerage";
import { OWNER_NAME } from "@/constants";
import type { 
  BrokerRow, 
  Employee, 
  SubBroker 
} from "@/types/brokerage";
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
      <FadeUp>
        <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5 text-blue-500" />
              Reports
            </CardTitle>
            <CardDescription>
              Generate downloadable employee brokerage reports with 100% own + 50% mapped split.
              <br />
              <span className="text-amber-600 dark:text-amber-400 font-medium">Remaining 50% of mapped → {OWNER_NAME}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-100/80 dark:bg-slate-800/50">
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
                    <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>To</Label>
                    <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={200}>
        <ReportPanel from={range.from} to={range.to} />
      </FadeUp>
    </div>
  );
}

function ReportPanel({ from, to }: { from: string; to: string }) {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [subs, setSubs] = useState<SubBroker[]>([]);
  const [brokerage, setBrokerage] = useState<{ date: string; code: string; name: string | null; gross: number; share: number; net: number }[]>([]);

  useEffect(() => {
    (async () => {
      if (!from || !to) return;
      setLoading(true);
      const [e, s, b] = await Promise.all([
        supabase.from("employees").select("*"),
        supabase.from("sub_brokers").select("*"),
        supabase.from("daily_brokerage").select("*").gte("date", from).lte("date", to).order("date"),
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

  const ganpatTotal = useMemo(() => computeGanpatTotal(rollup), [rollup]);

  // Per-broker detail rows enriched with employee tag
  const detail = useMemo(() => {
    const empById = new Map(employees.map((e) => [e.id, e.name]));
    const empByOwn = new Map(employees.filter((e) => e.code).map((e) => [e.code!.toUpperCase(), e]));
    const subByCode = new Map(subs.map((s) => [s.code.toUpperCase(), s]));
    const defaultEmp = employees.find((e) => e.is_default);
    return aggregated.map((r) => {
      const c = r.code.trim().toUpperCase();
      let owner: string | null = null;
      let role: "OWN" | "AP" | "SUB" | "UNMAPPED" | "—" = "—";
      let employeeShare = 0;
      let ganpatShare = 0;
      if (empByOwn.has(c)) {
        const emp = empByOwn.get(c)!;
        owner = emp.name;
        role = "OWN";
        employeeShare = r.net; // 100% to the employee
      } else {
        const sb = subByCode.get(c);
        if (sb && sb.employee_id) {
          // Mapped sub-broker: 50% employee, 50% Ganpat
          owner = empById.get(sb.employee_id) ?? null;
          role = (sb.tag as "AP" | "SUB" | null) ?? "—";
          employeeShare = r.net * 0.5;
          ganpatShare = r.net * 0.5;
        } else {
          // Unmapped: 100% to Ganpat Bedawala
          owner = defaultEmp ? defaultEmp.name : "—";
          role = "UNMAPPED";
          employeeShare = 0;
          ganpatShare = r.net; // 100% to Ganpat
        }
      }
      return {
        Employee: owner ?? "—",
        Code: r.code,
        Name: r.name,
        Tag: role,
        "Total Brokerage (Gross)": r.gross,
        Share: r.share,
        "Net SSJ Part": r.net,
        "Employee Share": employeeShare,
        [`${OWNER_NAME} Share`]: ganpatShare,
        Total: employeeShare + ganpatShare,
      };
    });
  }, [aggregated, employees, subs]);

  const empSummary = rollup.map((r) => ({
    Employee: r.employee_name,
    "Own code": r.own_code ?? "",
    "Own Net (100%)": r.own_net,
    "Sub-broker Share": r.shared_net,
    Total: r.total,
    "Codes count": r.mapped_codes.length,
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
    <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">
              Report: {from} → {to}
            </CardTitle>
            <CardDescription>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading…
                </span>
              ) : (
                `${brokerage.length} rows · ${rollup.length} employees`
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`${filename}_employees.csv`, empSummary)} disabled={!empSummary.length} className="transition-all hover:scale-105 active:scale-95">
              <Download className="mr-1 h-4 w-4" /> CSV (Employees)
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`${filename}_detail.csv`, detail)} disabled={!detail.length} className="transition-all hover:scale-105 active:scale-95">
              <Download className="mr-1 h-4 w-4" /> CSV (Detail)
            </Button>
            <Button size="sm" onClick={downloadAll} disabled={!detail.length} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95">
              <Download className="mr-1 h-4 w-4" /> Download XLSX
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Employee Summary */}
        <div>
          <h3 className="mb-3 text-sm font-bold text-foreground flex items-center gap-2">
            Employee Summary
          </h3>
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
                {rollup.length > 0 && (
                  <tr className="border-t-2">
                    <td colSpan={4} className="py-2 text-right font-semibold px-4">Grand Total</td>
                    <td className="text-right font-bold px-4">{fmt(rollup.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Broker Detail */}
        <div>
          <h3 className="mb-3 text-sm font-bold text-foreground">Broker Detail ({detail.length})</h3>
          <div className="max-h-[60vh] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-3 font-semibold">Employee</th>
                  <th className="px-2 font-semibold">Code</th>
                  <th className="px-2 font-semibold">Name</th>
                  <th className="px-2 font-semibold">Tag</th>
                  <th className="text-right px-3 font-semibold">Gross</th>
                  <th className="text-right px-3 font-semibold">Share</th>
                  <th className="text-right px-3 font-semibold">Net</th>
                  <th className="text-right px-3 font-semibold">Employee Share</th>
                  <th className="text-right px-3 font-semibold">{OWNER_NAME} Share</th>
                  <th className="text-right px-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((r, i) => {
                  const isUnmapped = r.Tag === "UNMAPPED";
                  return (
                    <tr key={i} className={`border-b hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${isUnmapped ? "bg-amber-50/20 dark:bg-amber-950/10" : ""}`}>
                      <td className="px-3 py-2 text-xs font-medium">{r.Employee}</td>
                      <td className="px-2 font-mono text-xs">{r.Code}</td>
                      <td className="px-2 text-xs">{r.Name}</td>
                      <td className="px-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          r.Tag === "OWN" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" :
                          r.Tag === "AP" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" :
                          r.Tag === "SUB" ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" :
                          r.Tag === "UNMAPPED" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" :
                          "bg-slate-50 text-slate-500"
                        }`}>{r.Tag}</span>
                      </td>
                      <td className="text-right px-3 text-xs">{fmt(r["Total Brokerage (Gross)"])}</td>
                      <td className="text-right px-3 text-xs">{fmt(r.Share)}</td>
                      <td className="text-right px-3 text-xs">{fmt(r["Net SSJ Part"])}</td>
                      <td className="text-right px-3 text-xs text-emerald-600 dark:text-emerald-400">{fmt(r["Employee Share"])}</td>
                      <td className="text-right px-3 text-xs text-amber-600 dark:text-amber-400">{fmt(r[`${OWNER_NAME} Share`])}</td>
                      <td className="text-right px-3 text-xs font-semibold">{fmt(r.Total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
