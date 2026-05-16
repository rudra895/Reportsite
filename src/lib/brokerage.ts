import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export type BrokerRow = {
  code: string;
  name: string;
  gross: number;
  share: number;
  net: number;
};

export type Employee = {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
};

export type SubBroker = {
  id: string;
  code: string;
  name: string | null;
  tag: string | null;
  employee_id: string | null;
};

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Parse the SSJ Brokerage Analysis Report. Returns { date, rows }.
export function parseBrokerageWorkbook(buf: ArrayBuffer): {
  date: string | null;
  rows: BrokerRow[];
} {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  // Find date line: "DD/MM/YYYY To DD/MM/YYYY"
  let date: string | null = null;
  for (const row of aoa.slice(0, 10)) {
    for (const cell of row) {
      const s = String(cell ?? "");
      const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        date = `${m[3]}-${m[2]}-${m[1]}`;
        break;
      }
    }
    if (date) break;
  }

  // Find header row "Code" col
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    if (
      String(aoa[i]?.[0] ?? "")
        .trim()
        .toLowerCase() === "code"
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { date, rows: [] };

  // Data starts 2 rows after header (header + Gross/Share/Net subhead)
  const startRow = headerIdx + 2;
  const rows: BrokerRow[] = [];
  for (let i = startRow; i < aoa.length; i++) {
    const r = aoa[i];
    const code = String(r?.[0] ?? "").trim();
    if (!code) continue;
    if (code.toLowerCase() === "total" || code.toLowerCase().startsWith("grand")) continue;
    const name = String(r?.[1] ?? "").trim();
    // Last 3 columns are total Gross / Share / Net. Excel may have empty trailing cells.
    // Walk back from end to find last 3 numerics.
    const last = r.length;
    const gross = num(r[last - 3]);
    const share = num(r[last - 2]);
    const net = num(r[last - 1]);
    rows.push({ code, name, gross, share, net });
  }
  return { date, rows };
}

export function tagFromCode(code: string): string | null {
  if (code.endsWith("_AP")) return "AP";
  if (code.endsWith("_SUB")) return "SUB";
  return null;
}

export type EmployeeRollup = {
  employee_id: string;
  employee_name: string;
  own_code: string | null;
  own_net: number; // 100%
  shared_net: number; // 50% of mapped sub-brokers
  total: number;
  mapped_codes: string[];
};

export function computeEmployeeRollup(
  brokers: BrokerRow[],
  employees: Employee[],
  subs: SubBroker[],
): EmployeeRollup[] {
  const byCode = new Map<string, BrokerRow>();
  for (const r of brokers) byCode.set(r.code.trim().toUpperCase(), r);

  const subByCode = new Map<string, SubBroker>();
  for (const s of subs) subByCode.set(s.code.trim().toUpperCase(), s);

  const defaultEmp = employees.find((e) => e.is_default) ?? null;

  // Build emp -> sub list (explicit mappings)
  const empSubs = new Map<string, string[]>();
  for (const s of subs) {
    if (s.employee_id) {
      const arr = empSubs.get(s.employee_id) ?? [];
      arr.push(s.code);
      empSubs.set(s.employee_id, arr);
    }
  }

  // Codes assigned to employees as own codes (exclude from default catch-all)
  const ownCodes = new Set(
    employees.filter((e) => e.code).map((e) => e.code!.trim().toUpperCase()),
  );

  // Catch-all: all brokers not mapped to anyone and not an employee's own code
  const unmappedForDefault: string[] = [];
  if (defaultEmp) {
    for (const r of brokers) {
      const c = r.code.trim().toUpperCase();
      if (ownCodes.has(c)) continue;
      const sb = subByCode.get(c);
      if (sb && sb.employee_id) continue; // already mapped
      unmappedForDefault.push(r.code);
    }
  }

  const out: EmployeeRollup[] = employees.map((e) => {
    const ownRow = e.code ? byCode.get(e.code.trim().toUpperCase()) : undefined;
    const own_net = ownRow?.net ?? 0;
    const mapped = empSubs.get(e.id) ?? [];
    let shared_net = 0;

    if (e.is_default) {
      // 100% of his own mapped codes
      shared_net += mapped.reduce((sum, c) => {
        const row = byCode.get(c.trim().toUpperCase());
        return sum + (row ? row.net : 0);
      }, 0);

      // 100% of unmapped codes
      shared_net += unmappedForDefault.reduce((sum, c) => {
        const row = byCode.get(c.trim().toUpperCase());
        return sum + (row ? row.net : 0);
      }, 0);

      // 50% of other employees' mapped codes
      for (const [empId, codes] of empSubs.entries()) {
        if (empId !== e.id) {
          shared_net += codes.reduce((sum, c) => {
            const row = byCode.get(c.trim().toUpperCase());
            return sum + (row ? row.net * 0.5 : 0);
          }, 0);
        }
      }
    } else {
      // Normal employee gets 50% of their mapped codes
      shared_net += mapped.reduce((sum, c) => {
        const row = byCode.get(c.trim().toUpperCase());
        return sum + (row ? row.net * 0.5 : 0);
      }, 0);
    }

    return {
      employee_id: e.id,
      employee_name: e.name,
      own_code: e.code,
      own_net,
      shared_net,
      total: own_net + shared_net,
      mapped_codes: e.is_default ? mapped.concat(unmappedForDefault) : mapped,
    };
  });

  return out.sort((a, b) => b.total - a.total);
}

export function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// CSV/XLSX downloads
export function downloadXlsx(
  filename: string,
  sheets: { name: string; rows: Record<string, unknown>[] }[],
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  saveAs(new Blob([out], { type: "application/octet-stream" }), filename);
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}
