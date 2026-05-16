import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { OWNER_NAME } from "@/constants";
import type { 
  BrokerRow, 
  Employee, 
  SubBroker, 
  EmployeeRollup 
} from "@/types/brokerage";

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Parse the SSJ Brokerage Analysis Report. Returns { date, rows }.
export function parseBrokerageWorkbook(buf: ArrayBuffer): { date: string | null; rows: BrokerRow[] } {
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
    if (String(aoa[i]?.[0] ?? "").trim().toLowerCase() === "code") {
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

/**
 * Compute the brokerage split per employee.
 *
 * Rules:
 *  - Each non-default employee gets 100% of their own code's net + 50% of mapped sub-brokers' net.
 *  - Ganpat Bedawala (the default/catch-all employee) gets:
 *      1) 100% of his own code (SSJ1073)
 *      2) 50% of ALL mapped sub-brokers across ALL employees (the "other half")
 *      3) 100% of ALL unmapped broker codes (codes that are neither an employee's own code
 *         nor explicitly mapped to any employee)
 */
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

  // Build emp -> sub list (explicit mappings only, NOT default catch-all)
  const empSubs = new Map<string, string[]>();
  for (const s of subs) {
    if (s.employee_id) {
      const arr = empSubs.get(s.employee_id) ?? [];
      arr.push(s.code);
      empSubs.set(s.employee_id, arr);
    }
  }

  // Codes assigned to employees as own codes
  const ownCodes = new Set(
    employees.filter((e) => e.code).map((e) => e.code!.trim().toUpperCase()),
  );

  // ALL explicitly mapped sub-broker codes (mapped to any employee via sub_brokers table)
  const allMappedCodes = new Set(
    subs.filter((s) => s.employee_id).map((s) => s.code.trim().toUpperCase()),
  );

  // Unmapped: all broker codes that are neither an employee own code nor explicitly mapped
  const unmappedCodes: string[] = [];
  for (const r of brokers) {
    const c = r.code.trim().toUpperCase();
    if (ownCodes.has(c)) continue;       // employee's own code
    if (allMappedCodes.has(c)) continue;  // explicitly mapped to an employee
    unmappedCodes.push(r.code);
  }

  // ---- Build rollup for non-default employees ----
  const out: EmployeeRollup[] = employees
    .filter((e) => !e.is_default)
    .map((e) => {
      const ownRow = e.code ? byCode.get(e.code.trim().toUpperCase()) : undefined;
      const own_net = ownRow?.net ?? 0;
      const mapped = empSubs.get(e.id) ?? [];

      // Employee gets 50% of their mapped sub-brokers
      const shared_net = mapped.reduce((sum, c) => {
        const row = byCode.get(c.trim().toUpperCase());
        return sum + (row ? row.net * 0.5 : 0);
      }, 0);

      // The other 50% of this employee's mapped sub-brokers goes to Ganpat
      const ganpat_net = shared_net; // same amount (the other 50%)

      return {
        employee_id: e.id,
        employee_name: e.name,
        own_code: e.code,
        own_net,
        shared_net,
        ganpat_net,
        total: own_net + shared_net,
        mapped_codes: mapped,
      };
    });

  // ---- Build rollup for default employee (Ganpat Bedawala) ----
  if (defaultEmp) {
    const ownRow = defaultEmp.code
      ? byCode.get(defaultEmp.code.trim().toUpperCase())
      : undefined;
    const own_net = ownRow?.net ?? 0;

    // Ganpat gets 100% of ALL unmapped codes
    const unmapped_net = unmappedCodes.reduce((sum, c) => {
      const row = byCode.get(c.trim().toUpperCase());
      return sum + (row?.net ?? 0);
    }, 0);

    // Ganpat also gets 50% of ALL mapped sub-brokers (from all employees)
    const mapped_50_net = Array.from(allMappedCodes).reduce((sum, c) => {
      const row = byCode.get(c);
      return sum + (row ? row.net * 0.5 : 0);
    }, 0);

    // For display: shared_net = total from unmapped + 50% from mapped
    // ganpat_net stays 0 for the default row (Ganpat IS the recipient)
    const total_ganpat = own_net + unmapped_net + mapped_50_net;

    out.push({
      employee_id: defaultEmp.id,
      employee_name: defaultEmp.name,
      own_code: defaultEmp.code,
      own_net,
      shared_net: unmapped_net + mapped_50_net, // what Ganpat receives from subs
      ganpat_net: 0, // Ganpat doesn't pay himself
      total: total_ganpat,
      mapped_codes: unmappedCodes,
    });
  }

  return out.sort((a, b) => b.total - a.total);
}

/**
 * Compute total Ganpat Bedawala share.
 * This is the default employee's total (own + 100% unmapped + 50% all mapped).
 */
export function computeGanpatTotal(rollup: EmployeeRollup[]): number {
  const ganpatRow = rollup.find(
    (r) => r.employee_name.toUpperCase().includes("GANPAT") || r.ganpat_net === 0,
  );
  return ganpatRow?.total ?? 0;
}

export function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// CSV/XLSX downloads
export function downloadXlsx(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
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
