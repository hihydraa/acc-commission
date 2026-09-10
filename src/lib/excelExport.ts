import ExcelJS from "exceljs";
import { roundHalfUp2 } from "./calc/rounding";
import { splitTeam, type TeamSplitConfig } from "./calc/teamSplit";
import type { SaleType } from "./calc/commissionEngine";

/**
 * Builds the 4-sheet export workbook described in spec §7:
 *  1. one sheet per department (A-U columns, L-R as real Excel formulas so
 *     accounting can audit/re-derive them, not just read a frozen number)
 *  2. ชีตค่าคอมรวม — totals per salesperson (เซลล์)
 *  3. ชีตใบปะหน้า — team % split per salesperson
 *  4. ชีตหมายเหตุ — flags / blocked rows / audit notes for this period
 *
 * L (กำไรขั้นต้น) and N-Q are straightforward arithmetic on other columns in
 * the same row, so those become real formulas. R (ค่าคอม) is also emitted as
 * a formula with that period's threshold/rate config baked in as literals,
 * so the stepped commission table is auditable in Excel too — not just M
 * (ค่าขนส่ง/ลิตร), which stays a value because its BLOCK/one-way/lookup logic
 * isn't a pure same-row arithmetic expression.
 */

export interface ExportTransactionRow {
  departmentCode: string;
  docNo: string;
  docDate: string | null;
  customerCode: string | null;
  customerName: string | null;
  productCode: string;
  qty: number;
  saleValue: number;
  cost: number;
  saleType: SaleType | null;
  distanceKm: number | null;
  isOneWay: boolean;
  freightRate: number | null;
  commission: number | null; // R, unrounded — null when blocked/ineligible
  isEligible: boolean;
  blockedReason: string | null;
  flags: string[];
  outstandingAmount: number | null;
  salesperson: string | null;
}

export interface ExportDepartmentMeta {
  code: string;
  label: string;
}

export interface ExportPeriodInfo {
  year: number;
  month: number;
  branch: string;
}

export interface ExportConfig {
  thresholds: { cash: number; credit: number; overdue: number };
  ratePerLiter: number;
  penaltyNegativeQEnabled: boolean;
  teamSplit: TeamSplitConfig;
}

export interface AuditNoteEntry {
  message: string;
  actor?: string;
  createdAt?: string;
}

export interface ExportInput {
  period: ExportPeriodInfo;
  departments: ExportDepartmentMeta[];
  rows: ExportTransactionRow[];
  config: ExportConfig;
  notes: AuditNoteEntry[];
}

const HEADER = [
  "เลขที่เอกสาร",
  "วันที่",
  "รหัสลูกค้า",
  "ชื่อลูกค้า",
  "สินค้า",
  "ปริมาณ",
  "มูลค่าขาย",
  "ต้นทุนขายสุทธิ",
  "ประเภท",
  "ระยะทาง(กม.)",
  "1สาย1สู้",
  "กำไรขั้นต้น(L)",
  "ค่าขนส่ง/ลิตร(M)",
  "ค่าขนส่งรวม(N)",
  "ต้นทุนรวม(O)",
  "กำไรหลังหักค่าขนส่ง(P)",
  "กำไรต่อลิตร(Q)",
  "ค่าคอม(R)",
  "สาเหตุที่ถูก Block",
  "หมายเหตุ/Flag",
  "หนี้ค้างที่ต้องพิจารณา",
];

function saleTypeLabel(t: SaleType | null): string {
  if (t === "cash") return "ขายสด";
  if (t === "credit") return "ขายเชื่อ";
  if (t === "overdue") return "ลูกหนี้ค้างชำระ";
  return "";
}

export async function buildCommissionWorkbook(input: ExportInput): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KN Commission System";
  workbook.created = new Date();

  const { thresholds, ratePerLiter, penaltyNegativeQEnabled } = input.config;

  // ---------- 1. per-department sheets ----------
  for (const dept of input.departments) {
    const sheet = workbook.addWorksheet(dept.label.slice(0, 31));
    sheet.addRow(HEADER);
    sheet.getRow(1).font = { bold: true };

    const deptRows = input.rows.filter((r) => r.departmentCode === dept.code);
    deptRows.forEach((r, idx) => {
      const excelRow = idx + 2; // header is row 1
      sheet.addRow([
        r.docNo,
        r.docDate,
        r.customerCode,
        r.customerName,
        r.productCode,
        r.qty,
        r.saleValue,
        r.cost,
        r.saleType ?? "",
        r.distanceKm,
        r.isOneWay,
        { formula: `G${excelRow}-H${excelRow}` }, // L
        r.freightRate, // M — backend-computed value (lookup/BLOCK/one-way logic)
        { formula: `M${excelRow}*F${excelRow}` }, // N
        { formula: `N${excelRow}+H${excelRow}` }, // O
        { formula: `G${excelRow}-O${excelRow}` }, // P
        { formula: `IF(F${excelRow}=0,0,P${excelRow}/F${excelRow})` }, // Q
        {
          formula:
            `IF(Q${excelRow}<0,` +
            `IF(${penaltyNegativeQEnabled ? "TRUE" : "FALSE"},-${ratePerLiter}*F${excelRow},0),` +
            `IF(Q${excelRow}>=IF(I${excelRow}="cash",${thresholds.cash},IF(I${excelRow}="credit",${thresholds.credit},${thresholds.overdue})),${ratePerLiter}*F${excelRow},0))`,
        }, // R
        r.blockedReason ?? "",
        r.flags.join("; "),
        r.outstandingAmount ?? 0,
      ]);
      // display sale_type as Thai label but keep the underlying formula
      // matching against the raw 'cash'/'credit'/'overdue' code in column I —
      // write the raw code so the R formula above resolves correctly, and
      // show the label in a comment instead of overwriting the cell value.
      const iCell = sheet.getCell(`I${excelRow}`);
      iCell.value = r.saleType ?? "";
      iCell.note = saleTypeLabel(r.saleType);
    });

    sheet.columns.forEach((col) => {
      col.width = 16;
    });
    sheet.getColumn(4).width = 28; // customer name
  }

  // ---------- aggregate per salesperson (เซลล์) ----------
  interface SalespersonAgg {
    salesperson: string;
    departments: Set<string>;
    qtyTotal: number;
    commissionRawSum: number;
    outstandingSum: number;
  }
  const bySalesperson = new Map<string, SalespersonAgg>();
  for (const r of input.rows) {
    if (!r.isEligible || r.commission === null || !r.salesperson) continue;
    const key = r.salesperson;
    const agg = bySalesperson.get(key) ?? {
      salesperson: key,
      departments: new Set<string>(),
      qtyTotal: 0,
      commissionRawSum: 0,
      outstandingSum: 0,
    };
    agg.departments.add(r.departmentCode);
    agg.qtyTotal += r.qty;
    agg.commissionRawSum += r.commission;
    agg.outstandingSum += r.outstandingAmount ?? 0;
    bySalesperson.set(key, agg);
  }

  // ---------- 2. ชีตค่าคอมรวม ----------
  const summarySheet = workbook.addWorksheet("ค่าคอมรวม");
  summarySheet.addRow(["เซลล์", "แผนก", "ลิตรรวม", "ค่าคอมรวม (ปัด 2 ตำแหน่ง)", "หนี้ค้างที่ต้องพิจารณา"]);
  summarySheet.getRow(1).font = { bold: true };
  const roundedBySalesperson = new Map<string, number>();
  for (const agg of bySalesperson.values()) {
    const rounded = roundHalfUp2(agg.commissionRawSum);
    roundedBySalesperson.set(agg.salesperson, rounded);
    summarySheet.addRow([
      agg.salesperson,
      [...agg.departments].join(", "),
      agg.qtyTotal,
      rounded,
      roundHalfUp2(agg.outstandingSum),
    ]);
  }
  summarySheet.columns.forEach((c) => (c.width = 20));

  // ---------- 3. ชีตใบปะหน้า ----------
  const coverSheet = workbook.addWorksheet("ใบปะหน้า");
  coverSheet.addRow([
    `รอบ ${input.period.month}/${input.period.year} — สาขา${input.period.branch}`,
  ]);
  coverSheet.addRow([]);
  coverSheet.addRow(["เซลล์", "สุทธิ", "ผู้จัดการ (10%)", "ADMIN (20%)", "ส่วนกลาง (10%)", "การตลาด (รับเศษ)"]);
  coverSheet.getRow(3).font = { bold: true };
  for (const [salesperson, net] of roundedBySalesperson) {
    const split = splitTeam(net, input.config.teamSplit);
    coverSheet.addRow([salesperson, split.net, split.manager, split.admin, split.central, split.sales]);
  }
  coverSheet.columns.forEach((c) => (c.width = 20));

  // ---------- 4. ชีตหมายเหตุ ----------
  const notesSheet = workbook.addWorksheet("หมายเหตุ");
  notesSheet.addRow(["ประเภท", "เอกสาร/ลูกค้า", "รายละเอียด"]);
  notesSheet.getRow(1).font = { bold: true };
  for (const r of input.rows) {
    if (r.blockedReason) {
      notesSheet.addRow(["Block", `${r.docNo} / ${r.customerCode ?? ""}`, r.blockedReason]);
    }
    for (const flag of r.flags) {
      notesSheet.addRow(["Flag", `${r.docNo} / ${r.customerCode ?? ""}`, flag]);
    }
  }
  for (const note of input.notes) {
    notesSheet.addRow([
      "Audit",
      note.actor ?? "",
      `${note.createdAt ? note.createdAt + " — " : ""}${note.message}`,
    ]);
  }
  notesSheet.columns.forEach((c) => (c.width = 30));

  return workbook.xlsx.writeBuffer();
}
