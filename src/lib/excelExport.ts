import ExcelJS from "exceljs";
import { roundHalfUp2 } from "./calc/rounding";
import { splitTeam, type TeamSplitConfig } from "./calc/teamSplit";
import type { SaleType } from "./calc/commissionEngine";

/**
 * Builds the export workbook, matching the sheet layout the
 * marketing-commission-calc SKILL / Template_คำนวณค่าคอมการตลาด.xlsx
 * describe as the required output shape:
 *  1. Master — one row per customer referenced this period (เซลล์/ระยะทาง/Tag),
 *     so a reviewer can see where each per-row VLOOKUP-equivalent came from
 *     without hunting through Settings.
 *  2. one sheet per department (all rows, not pre-filtered — a non-qualifying
 *     or blocked row must still be visible with its formula evaluating to
 *     blank/0, not omitted) with two summary rows at the bottom.
 *  3. หักหนี้ค้างชำระ — one row per transaction accounting entered a debt
 *     deduction for, plus a total row.
 *  4. ค่าคอมรวม — ก่อนหักหนี้ / หักหนี้ / สุทธิ per salesperson (เซลล์).
 *  5. ใบปะหน้า — team % split per salesperson, computed off the NET
 *     (post-deduction) column above.
 *  6. หมายเหตุ — flags / blocked rows / audit notes for this period.
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
  /** true once the row passed product/customer/qty/round-1000 scope, even if
   *  freight is still blocked pending Review — matches the "เข้าเกณฑ์ปริมาณ
   *  (1/0)" column in the SKILL/Template output (see commissionEngine.ts) */
  isEligible: boolean;
  blockedReason: string | null;
  flags: string[];
  /** accounting-entered deduction (spec §4.5) — this IS what gets subtracted */
  outstandingAmount: number | null;
  /** reference-only figure from the AR report itself, NOT what gets deducted */
  arOutstandingReference: number | null;
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

// Column order matches the per-truck sheet layout in
// marketing-commission-calc/skills/.../references/formulas.md (A ลำดับ … K
// ต้นทุนขายสุทธิ, L-R the formula columns, S ประเภท, T เซลล์, U ค่าคอม, plus the
// V "เข้าเกณฑ์ปริมาณ" helper column added after the ส.ค. 2569 review).
const DEPT_HEADER = [
  "ลำดับ",
  "วันที่",
  "เลขที่เอกสาร",
  "รหัสลูกค้า",
  "ชื่อลูกค้า",
  "สินค้า",
  "ระยะทาง(กม.)",
  "Tag",
  "ปริมาณขายสุทธิ(ลิตร)",
  "มูลค่าขาย",
  "ต้นทุนขายสุทธิ",
  "กำไรขั้นต้น",
  "ค่าขนส่ง/ลิตร",
  "ค่าขนส่งรวม",
  "ต้นทุนรวม",
  "กำไรหลังหักขนส่ง",
  "กำไรต่อลิตร",
  "ประเภท",
  "เซลล์",
  "ค่าคอม",
  "หมายเหตุ",
  "เข้าเกณฑ์ปริมาณ(1/0)",
];

function saleTypeLabel(t: SaleType | null): string {
  if (t === "cash") return "ขายสด";
  if (t === "credit") return "ขายเชื่อ";
  if (t === "overdue") return "ลูกหนี้ค้างชำระ";
  return "";
}

function tagLabel(r: ExportTransactionRow): string {
  if (r.isOneWay) return "1สาย1สู้";
  if (r.distanceKm === 0) return "ทางผ่าน";
  return "";
}

export async function buildCommissionWorkbook(input: ExportInput): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KN Commission System";
  workbook.created = new Date();
  // Without this, some Excel/viewer apps display formula cells as blank or
  // stale (0) until the user manually recalculates (F9/Ctrl+Alt+F9) — a
  // freshly generated file with no cached formula results looks like
  // "nothing was calculated" even though every formula is correct.
  workbook.calcProperties.fullCalcOnLoad = true;

  const { thresholds, ratePerLiter, penaltyNegativeQEnabled } = input.config;

  // ---------- 1. Master ----------
  // One row per distinct customer that actually has a QUALIFYING transaction
  // this period (isEligible — passed product/customer/qty/round-1000 scope,
  // per marketing-commission-calc SKILL: "narrow to only the customers that
  // actually have a qualifying transaction this month... cross-check the
  // master file against that short list, not the full customer roster").
  // A raw sales export can carry hundreds of tiny/walk-in rows that never
  // needed a distance/เซลล์ lookup at all — listing every one of them here
  // (as an earlier version of this function did) buries the handful of
  // rows that genuinely need Review under noise from ones that don't.
  const masterSheet = workbook.addWorksheet("Master");
  masterSheet.addRow(["รหัสลูกค้า", "ชื่อลูกค้า", "เซลล์", "ระยะทาง(กม.)", "Tag", "หมายเหตุ"]);
  masterSheet.getRow(1).font = { bold: true };
  const seenCustomers = new Set<string>();
  for (const r of input.rows) {
    if (!r.customerCode || !r.isEligible || seenCustomers.has(r.customerCode)) continue;
    seenCustomers.add(r.customerCode);
    masterSheet.addRow([
      r.customerCode,
      r.customerName ?? "",
      r.salesperson ?? "",
      r.distanceKm,
      tagLabel(r),
      !r.salesperson ? "⚠ ไม่มีเซลล์ในระบบ — เพิ่มในหน้าตั้งค่า > ลูกค้า" : "",
    ]);
  }
  masterSheet.columns.forEach((c) => (c.width = 20));
  masterSheet.getColumn(2).width = 28;

  // ---------- 2. per-department sheets ----------
  for (const dept of input.departments) {
    const sheet = workbook.addWorksheet(dept.label.slice(0, 31));
    sheet.addRow(DEPT_HEADER);
    sheet.getRow(1).font = { bold: true };

    const deptRows = input.rows.filter((r) => r.departmentCode === dept.code);
    deptRows.forEach((r, idx) => {
      const excelRow = idx + 2; // header is row 1
      // Only write the live L-R formulas when M (freight rate) is an actual
      // resolved number. N/O/P/Q reference M{row} in-formula, and Excel
      // treats a blank M cell as 0 — so a blocked row (missing distance,
      // >209km) or an out-of-scope row (below qty threshold, non-fuel,
      // excluded customer) would otherwise silently show a computed
      // commission as if freight were free, instead of "not calculated".
      const hasFreight = r.freightRate !== null;
      sheet.addRow([
        idx + 1,
        r.docDate,
        r.docNo,
        r.customerCode,
        r.customerName,
        r.productCode,
        r.distanceKm,
        tagLabel(r),
        r.qty,
        r.saleValue,
        r.cost,
        { formula: `J${excelRow}-K${excelRow}` }, // L กำไรขั้นต้น
        r.freightRate, // M ค่าขนส่ง/ลิตร — backend-computed value (lookup/BLOCK/one-way/fixed logic)
        hasFreight ? { formula: `M${excelRow}*I${excelRow}` } : "", // N ค่าขนส่งรวม
        hasFreight ? { formula: `N${excelRow}+K${excelRow}` } : "", // O ต้นทุนรวม
        hasFreight ? { formula: `J${excelRow}-O${excelRow}` } : "", // P กำไรหลังหักขนส่ง
        hasFreight ? { formula: `IF(I${excelRow}=0,0,P${excelRow}/I${excelRow})` } : "", // Q กำไรต่อลิตร
        r.saleType ?? "",
        r.salesperson ?? "",
        hasFreight
          ? {
              formula:
                `IF(Q${excelRow}<0,` +
                `IF(${penaltyNegativeQEnabled ? "TRUE" : "FALSE"},-${ratePerLiter}*I${excelRow},0),` +
                `IF(Q${excelRow}>=IF(R${excelRow}="cash",${thresholds.cash},IF(R${excelRow}="credit",${thresholds.credit},${thresholds.overdue})),${ratePerLiter}*I${excelRow},0))`,
            }
          : "", // R ค่าคอม
        [r.blockedReason, ...r.flags].filter(Boolean).join("; "),
        r.isEligible ? 1 : 0, // เข้าเกณฑ์ปริมาณ(1/0)
      ]);
      // display sale_type as Thai label but keep the underlying formula
      // matching against the raw 'cash'/'credit'/'overdue' code in column R —
      // write the raw code so the formula above resolves correctly, and show
      // the label in a comment instead of overwriting the cell value.
      const rCell = sheet.getCell(`R${excelRow}`);
      rCell.value = r.saleType ?? "";
      rCell.note = saleTypeLabel(r.saleType);
    });

    const lastRow = deptRows.length + 1;
    if (deptRows.length > 0) {
      // leave row lastRow+1 blank as a visual separator — getRow() below
      // creates rows on demand, so skipping straight to lastRow+2/+3 here
      // (rather than an extra addRow([]) call, which would instead land ON
      // lastRow+1 and collide with it) actually leaves it untouched.
      const totalRow = lastRow + 2;
      const qualifyingRow = lastRow + 3;
      sheet.getRow(totalRow).getCell(5).value = "รวมทั้งชีท";
      sheet.getRow(totalRow).getCell(9).value = { formula: `SUM(I2:I${lastRow})` };
      sheet.getRow(totalRow).getCell(20).value = { formula: `SUM(T2:T${lastRow})` };
      sheet.getRow(qualifyingRow).getCell(5).value = "รวมเฉพาะรายการที่เข้าเกณฑ์ค่าคอม";
      sheet.getRow(qualifyingRow).getCell(9).value = { formula: `SUMIF(V2:V${lastRow},1,I2:I${lastRow})` };
      sheet.getRow(qualifyingRow).getCell(20).value = { formula: `SUM(T2:T${lastRow})` };
      sheet.getRow(totalRow).font = { bold: true };
      sheet.getRow(qualifyingRow).font = { bold: true };
    }

    sheet.columns.forEach((col) => {
      col.width = 16;
    });
    sheet.getColumn(5).width = 28; // customer name
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

  // ---------- 3. หักหนี้ค้างชำระ ----------
  const debtSheet = workbook.addWorksheet("หักหนี้ค้างชำระ");
  debtSheet.addRow([
    "รหัสลูกค้า",
    "ชื่อลูกค้า",
    "เอกสาร#",
    "วันที่",
    "ลิตรที่ต้องนำมาหักค่าคอม",
    "เซลล์",
    "ค่าคอมของรายการนี้ (หัก)",
    "ยอดคงค้างตามรายงานลูกหนี้ (อ้างอิงเท่านั้น)",
  ]);
  debtSheet.getRow(1).font = { bold: true };
  const debtRows = input.rows.filter((r) => (r.outstandingAmount ?? 0) > 0);
  for (const r of debtRows) {
    debtSheet.addRow([
      r.customerCode,
      r.customerName,
      r.docNo,
      r.docDate,
      r.qty,
      r.salesperson,
      r.outstandingAmount,
      r.arOutstandingReference,
    ]);
  }
  if (debtRows.length > 0) {
    const totalRow = debtRows.length + 2;
    debtSheet.getRow(totalRow).getCell(1).value = "รวม";
    debtSheet.getRow(totalRow).getCell(7).value = { formula: `SUM(G2:G${debtRows.length + 1})` };
    debtSheet.getRow(totalRow).font = { bold: true };
  } else {
    debtSheet.addRow(["ไม่พบรายการค้างชำระที่ตรงกับรายการเข้าเกณฑ์เดือนนี้"]);
  }
  debtSheet.columns.forEach((c) => (c.width = 20));
  debtSheet.getColumn(2).width = 28;

  // ---------- 4. ค่าคอมรวม ----------
  const summarySheet = workbook.addWorksheet("ค่าคอมรวม");
  summarySheet.addRow([
    "เซลล์",
    "แผนก",
    "ลิตรรวม",
    "ค่าคอมมิชชั่นรวม (ก่อนหักหนี้)",
    "หักค่าคอมจากหนี้ค้างชำระ",
    "ค่าคอมสุทธิ",
  ]);
  summarySheet.getRow(1).font = { bold: true };
  // net-of-debt commission (spec §4.5/§4.6) — this is what the ใบปะหน้า team
  // split below must use, NOT the pre-deduction total, otherwise the
  // accounting-entered outstanding_amount deduction is collected but never
  // actually applied to the salesperson's payout.
  const roundedBySalesperson = new Map<string, number>();
  for (const agg of bySalesperson.values()) {
    const grossRounded = roundHalfUp2(agg.commissionRawSum);
    const outstandingRounded = roundHalfUp2(agg.outstandingSum);
    const net = roundHalfUp2(agg.commissionRawSum - agg.outstandingSum);
    roundedBySalesperson.set(agg.salesperson, net);
    summarySheet.addRow([
      agg.salesperson,
      [...agg.departments].join(", "),
      agg.qtyTotal,
      grossRounded,
      outstandingRounded,
      net,
    ]);
  }
  summarySheet.addRow([
    "⚠ ก่อนส่งมอบไฟล์: เช็คว่า 'ค่าคอมมิชชั่นรวม (ก่อนหักหนี้)' รวมทุกเซลล์เท่ากับผลรวมแถว 'รวมทั้งชีท' ของทุกชีทแผนก — ถ้าไม่ตรงกันคือบั๊ก ต้องตามหาก่อนส่ง",
  ]);
  summarySheet.columns.forEach((c) => (c.width = 20));

  // ---------- 5. ใบปะหน้า ----------
  const coverSheet = workbook.addWorksheet("ใบปะหน้า");
  coverSheet.addRow([`รอบ ${input.period.month}/${input.period.year} — สาขา${input.period.branch}`]);
  coverSheet.addRow([]);
  coverSheet.addRow(["เซลล์", "สุทธิ", "ผู้จัดการ (10%)", "ADMIN (20%)", "ส่วนกลาง (10%)", "การตลาด (รับเศษ)"]);
  coverSheet.getRow(3).font = { bold: true };
  for (const [salesperson, net] of roundedBySalesperson) {
    const split = splitTeam(net, input.config.teamSplit);
    coverSheet.addRow([salesperson, split.net, split.manager, split.admin, split.central, split.sales]);
  }
  coverSheet.columns.forEach((c) => (c.width = 20));

  // ---------- 6. หมายเหตุ ----------
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
