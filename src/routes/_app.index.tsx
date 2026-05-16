import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
} from "recharts";
import {
  computeEmployeeRollup,
  computeGanpatTotal,
  fmt,
} from "@/lib/brokerage";
import { OWNER_NAME } from "@/constants";
import type { 
  BrokerRow, 
  Employee, 
  EmployeeRollup, 
  SubBroker 
} from "@/types/brokerage";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Users, Calendar, Crown } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

const PALETTE = [
  "oklch(0.65 0.2 250)",   // vibrant blue
  "oklch(0.65 0.2 160)",   // emerald
  "oklch(0.7 0.18 30)",    // warm orange
  "oklch(0.65 0.2 300)",   // purple
  "oklch(0.75 0.2 80)",    // gold
  "oklch(0.6 0.15 200)",   // teal
];

/* ---------- Animated number counter ---------- */
function AnimatedNumber({ value, prefix = "", suffix = "", duration = 1200 }: { value: number; prefix?: string; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const step = Math.max(1, Math.ceil(value / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [value, duration]);

  return <span>{prefix}{typeof value === "number" && value > 999 ? fmt(display) : display}{suffix}</span>;
}

/* ---------- Stagger animation wrapper ---------- */
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

function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [subs, setSubs] = useState<SubBroker[]>([]);
  const [brokerage, setBrokerage] = useState<{ date: string; code: string; name: string | null; gross: number; share: number; net: number }[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth() - 2, 1)
        .toISOString()
        .slice(0, 10);
      const [e, s, b] = await Promise.all([
        supabase.from("employees").select("*").order("name"),
        supabase.from("sub_brokers").select("*"),
        supabase.from("daily_brokerage").select("*").gte("date", start).order("date"),
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
  }, []);

  // Total brokerage across loaded period
  const totals = useMemo(() => {
    const gross = brokerage.reduce((s, r) => s + r.gross, 0);
    const share = brokerage.reduce((s, r) => s + r.share, 0);
    const net = brokerage.reduce((s, r) => s + r.net, 0);
    return { gross, share, net };
  }, [brokerage]);

  // Aggregate per code across period to feed rollup
  const aggregatedByCode = useMemo<BrokerRow[]>(() => {
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
    return Array.from(m.values());
  }, [brokerage]);

  const rollup: EmployeeRollup[] = useMemo(
    () => computeEmployeeRollup(aggregatedByCode, employees, subs),
    [aggregatedByCode, employees, subs],
  );

  const ganpatTotal = useMemo(() => computeGanpatTotal(rollup), [rollup]);

  // Net per day timeline
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of brokerage) m.set(r.date, (m.get(r.date) ?? 0) + r.net);
    return Array.from(m.entries())
      .sort()
      .map(([date, net]) => ({ date, net }));
  }, [brokerage]);

  // Pie data — Ganpat is already in the rollup as the default employee
  const pieData = useMemo(() => {
    return rollup.map(r => ({ name: r.employee_name, value: r.total })).sort((a, b) => b.value - a.value);
  }, [rollup]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (brokerage.length === 0) {
    return (
      <FadeUp>
        <Card className="border-dashed border-2 bg-gradient-to-br from-blue-50/50 to-indigo-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-500" />
              No data yet
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Upload your first brokerage Excel from the <strong className="text-foreground">Upload</strong> tab to populate the dashboard.
          </CardContent>
        </Card>
      </FadeUp>
    );
  }

  const daysLoaded = new Set(brokerage.map((b) => b.date)).size;

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <FadeUp delay={0}>
          <KpiCard
            label="Total Gross"
            value={totals.gross}
            icon={<DollarSign className="h-5 w-5" />}
            gradient="from-emerald-500 to-teal-600"
            iconBg="bg-emerald-500/10"
            iconColor="text-emerald-600"
          />
        </FadeUp>
        <FadeUp delay={80}>
          <KpiCard
            label="Total Share"
            value={totals.share}
            icon={<TrendingUp className="h-5 w-5" />}
            gradient="from-blue-500 to-indigo-600"
            iconBg="bg-blue-500/10"
            iconColor="text-blue-600"
          />
        </FadeUp>
        <FadeUp delay={160}>
          <KpiCard
            label="Net (SSJ Part)"
            value={totals.net}
            icon={<DollarSign className="h-5 w-5" />}
            gradient="from-violet-500 to-purple-600"
            iconBg="bg-violet-500/10"
            iconColor="text-violet-600"
          />
        </FadeUp>
        <FadeUp delay={240}>
          <KpiCard
            label={`${OWNER_NAME} Share`}
            value={ganpatTotal}
            icon={<Crown className="h-5 w-5" />}
            gradient="from-amber-500 to-orange-600"
            iconBg="bg-amber-500/10"
            iconColor="text-amber-600"
          />
        </FadeUp>
        <FadeUp delay={320}>
          <KpiCard
            label="Days Loaded"
            value={daysLoaded}
            icon={<Calendar className="h-5 w-5" />}
            gradient="from-rose-500 to-pink-600"
            iconBg="bg-rose-500/10"
            iconColor="text-rose-600"
            raw
          />
        </FadeUp>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <FadeUp delay={400}>
          <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                Employee Brokerage Split
              </CardTitle>
              <p className="text-xs text-muted-foreground">100% own + 50% mapped · Other 50% → {OWNER_NAME}</p>
            </CardHeader>
            <CardContent className="h-80 pt-2">
              <ResponsiveContainer>
                <BarChart data={rollup} barCategoryGap="20%">
                  <defs>
                    <linearGradient id="ownGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.65 0.2 250)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="oklch(0.55 0.2 250)" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="sharedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.65 0.2 160)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="oklch(0.55 0.2 160)" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="employee_name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
                      padding: "12px 16px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="own_net" name="Own 100%" stackId="a" fill="url(#ownGrad)" radius={[0, 0, 0, 0]} animationDuration={1500} animationEasing="ease-out" />
                  <Bar dataKey="shared_net" name="Employee 50%" stackId="a" fill="url(#sharedGrad)" radius={[4, 4, 0, 0]} animationDuration={1500} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </FadeUp>

        <FadeUp delay={500}>
          <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Brokerage Distribution
              </CardTitle>
              <p className="text-xs text-muted-foreground">Including {OWNER_NAME}'s 50% share from all mapped sub-brokers</p>
            </CardHeader>
            <CardContent className="h-80 pt-2">
              <ResponsiveContainer>
                <PieChart>
                  <defs>
                    {pieData.map((_, i) => (
                      <linearGradient key={i} id={`pieGrad${i}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={1} />
                        <stop offset="100%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.7} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={100}
                    innerRadius={40}
                    paddingAngle={3}
                    label={(d) => d.name}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    animationBegin={300}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={`url(#pieGrad${i})`} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </FadeUp>
      </div>

      {/* Daily Net Timeline with Area Chart */}
      <FadeUp delay={600}>
        <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
              Daily Net Brokerage Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72 pt-2">
            <ResponsiveContainer>
              <AreaChart data={perDay}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.65 0.2 250)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="oklch(0.65 0.2 250)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  stroke="oklch(0.65 0.2 250)"
                  strokeWidth={2.5}
                  fill="url(#areaGrad)"
                  animationDuration={2000}
                  animationEasing="ease-out"
                  dot={false}
                  activeDot={{ r: 6, fill: "oklch(0.65 0.2 250)", stroke: "white", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </FadeUp>

      {/* Employee Breakdown Table */}
      <FadeUp delay={700}>
        <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Employee Breakdown
            </CardTitle>
            <p className="text-xs text-muted-foreground">50% of mapped sub-brokers + 100% of unmapped → <strong>{OWNER_NAME}</strong></p>
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
                    <th className="px-4 font-semibold">Codes</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.map((r, idx) => {
                    const isGanpat = r.ganpat_net === 0 && r.shared_net > 0;
                    return (
                      <tr key={r.employee_id} className={`border-b transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${
                        isGanpat ? "bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-l-amber-400" : idx % 2 === 0 ? "" : "bg-slate-25"
                      }`}>
                        <td className={`py-3 px-4 font-semibold ${isGanpat ? "text-amber-700 dark:text-amber-400" : ""}`}>
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
                        <td className={`text-right px-4 font-bold ${isGanpat ? "text-amber-700 dark:text-amber-400 text-lg" : ""}`}>
                          {fmt(r.total)}
                        </td>
                        <td className="px-4">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            isGanpat ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" : "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                          }`}>
                            {r.mapped_codes.length}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}

/* ---------- Premium KPI Card ---------- */
function KpiCard({
  label,
  value,
  icon,
  gradient,
  iconBg,
  iconColor,
  raw,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  iconColor: string;
  raw?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900 group hover:shadow-xl transition-all duration-500 hover:-translate-y-1">
      {/* Top gradient stripe */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <div className="text-2xl font-bold tracking-tight">
              {raw ? value : <AnimatedNumber value={Math.round(value)} prefix="₹" />}
            </div>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg} ${iconColor} transition-transform group-hover:scale-110 group-hover:rotate-6`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Upload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}
