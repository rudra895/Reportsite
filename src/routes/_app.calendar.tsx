import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

type DayInfo = {
  hasUpload: boolean;
  isHoliday: boolean;
  note: string | null;
  rowCount: number;
};

function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0..11
  const [data, setData] = useState<Record<string, DayInfo>>({});

  const load = async () => {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = new Date(year, month + 1, 0);
    const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    const [uploads, cal] = await Promise.all([
      supabase.from("daily_uploads").select("*").gte("date", start).lte("date", end),
      supabase.from("calendar_days").select("*").gte("date", start).lte("date", end),
    ]);
    const m: Record<string, DayInfo> = {};
    for (const u of uploads.data ?? []) {
      m[u.date] = { hasUpload: true, isHoliday: false, note: null, rowCount: u.row_count };
    }
    for (const c of cal.data ?? []) {
      m[c.date] = {
        hasUpload: m[c.date]?.hasUpload ?? false,
        isHoliday: c.is_holiday,
        note: c.note,
        rowCount: m[c.date]?.rowCount ?? 0,
      };
    }
    setData(m);
  };

  useEffect(() => {
    load();
  }, [year, month]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [firstDow, daysInMonth]);

  const toggleHoliday = async (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cur = data[dateStr];
    const next = !cur?.isHoliday;
    const { error } = await supabase
      .from("calendar_days")
      .upsert({ date: dateStr, is_holiday: next });
    if (error) return toast.error(error.message);
    setData((prev) => ({
      ...prev,
      [dateStr]: {
        hasUpload: cur?.hasUpload ?? false,
        isHoliday: next,
        note: cur?.note ?? null,
        rowCount: cur?.rowCount ?? 0,
      },
    }));
  };

  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" });

  const stats = useMemo(() => {
    const days = Object.values(data);
    return {
      uploaded: days.filter((d) => d.hasUpload).length,
      holidays: days.filter((d) => d.isHoliday).length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{monthName}</CardTitle>
              <CardDescription>
                Green = Excel uploaded · Red = Holiday · Click any day to mark/unmark as holiday.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (month === 0) {
                    setMonth(11);
                    setYear(year - 1);
                  } else setMonth(month - 1);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (month === 11) {
                    setMonth(0);
                    setYear(year + 1);
                  } else setMonth(month + 1);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-4 text-sm">
            <span className="text-muted-foreground">Uploaded: <strong className="text-foreground">{stats.uploaded}</strong></span>
            <span className="text-muted-foreground">Holidays: <strong className="text-foreground">{stats.holidays}</strong></span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const info = data[dateStr];
              return (
                <button
                  key={i}
                  onClick={() => toggleHoliday(day)}
                  className={cn(
                    "relative aspect-square rounded-md border bg-card p-2 text-left text-sm transition-colors hover:bg-accent",
                    info?.isHoliday && "border-destructive/40 bg-destructive/10",
                    info?.hasUpload && !info?.isHoliday && "border-emerald-500/40 bg-emerald-500/10",
                  )}
                >
                  <div className="font-medium">{day}</div>
                  {info?.hasUpload && (
                    <div className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500" />
                  )}
                  {info?.isHoliday && (
                    <div className="mt-1 text-[10px] uppercase text-destructive">Holiday</div>
                  )}
                  {info?.rowCount > 0 && (
                    <div className="mt-1 text-[10px] text-muted-foreground">{info.rowCount} rows</div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
