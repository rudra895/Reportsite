import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
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
} from "recharts";
import {
  computeEmployeeRollup,
  fmt,
  type BrokerRow,
  type Employee,
  type EmployeeRollup,
  type SubBroker,
} from "@/lib/brokerage";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "oklch(0.7 0.15 30)",
];

function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [subs, setSubs] = useState<SubBroker[]>([]);
  const [brokerage, setBrokerage] = useState<
    { date: string; code: string; name: string | null; gross: number; share: number; net: number }[]
  >([]);

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

  // Net per day timeline
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of brokerage) m.set(r.date, (m.get(r.date) ?? 0) + r.net);
    return Array.from(m.entries())
      .sort()
      .map(([date, net]) => ({ date, net }));
  }, [brokerage]);

  const grandEmployeeTotal = useMemo(() => {
    return rollup.reduce((sum, r) => sum + r.total, 0);
  }, [rollup]);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (brokerage.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No data yet</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Upload your first brokerage Excel from the <strong>Upload</strong> tab to populate the
          dashboard.
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="show">
      <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total Gross" value={totals.gross} />
        <Kpi label="Total Share" value={totals.share} />
        <Kpi label="Total Net (SSJ part)" value={totals.net} />
        <Kpi label="Grand Total (Employees)" value={grandEmployeeTotal} />
        <Kpi label="Days loaded" value={new Set(brokerage.map((b) => b.date)).size} raw />
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <Card className="h-full shadow-md transition-shadow hover:shadow-lg">
            <CardHeader>
              <CardTitle>Employee Brokerage (Net total = 100% own + 50% mapped)</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer>
                <BarChart data={rollup}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis
                    dataKey="employee_name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.2 }}
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: "10px" }} />
                  <Bar
                    dataKey="own_net"
                    name="Own 100%"
                    stackId="a"
                    fill="var(--chart-1)"
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    radius={[0, 0, 4, 4]}
                  />
                  <Bar
                    dataKey="shared_net"
                    name="Mapped 50%"
                    stackId="a"
                    fill="var(--chart-2)"
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="h-full shadow-md transition-shadow hover:shadow-lg">
            <CardHeader>
              <CardTitle>Share by Employee</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={rollup}
                    dataKey="total"
                    nameKey="employee_name"
                    outerRadius={100}
                    label={(d) => d.employee_name}
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                  >
                    {rollup.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PALETTE[i % PALETTE.length]}
                        className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={itemVariants}>
        <Card className="shadow-md transition-shadow hover:shadow-lg">
          <CardHeader>
            <CardTitle>Daily Net Brokerage</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <LineChart data={perDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 2 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  isAnimationActive={true}
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card className="shadow-md transition-shadow hover:shadow-lg">
          <CardHeader>
            <CardTitle>Employee Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Employee</th>
                    <th>Own code</th>
                    <th className="text-right">Own 100%</th>
                    <th className="text-right">Mapped 50%</th>
                    <th className="text-right px-4">Total</th>
                    <th className="text-right px-4">Mapped brokers</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.map((r) => (
                    <motion.tr
                      key={r.employee_id}
                      className="border-b transition-colors hover:bg-muted/50"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                    >
                      <td className="py-3 font-medium">{r.employee_name}</td>
                      <td className="py-3">{r.own_code ?? "—"}</td>
                      <td className="py-3 text-right">{fmt(r.own_net)}</td>
                      <td className="py-3 text-right">{fmt(r.shared_net)}</td>
                      <td className="py-3 text-right font-semibold px-4">
                        {fmt(r.total)}
                      </td>
                      <td className="py-3 text-right text-xs text-muted-foreground px-4">
                        {r.mapped_codes.length}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function Kpi({ label, value, raw }: { label: string; value: number; raw?: boolean }) {
  return (
    <Card className="shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1 bg-gradient-to-br from-card to-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <motion.div
          className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {raw ? value : fmt(value)}
        </motion.div>
      </CardContent>
    </Card>
  );
}
