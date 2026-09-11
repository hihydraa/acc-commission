import type {
  ChecksumIssue,
  ChecksumResult,
  ParsedSalesReport,
} from "./types";

/**
 * Tolerance rules, spec §3.6 (revised against real August 2569 data):
 *  - quantity (liters) must match EXACTLY at every level — it's the primary checksum.
 *  - value (baht) may differ per product group and per file, because the
 *    source accounting system rounds its own per-liter rate before summing,
 *    which drifts more on larger-volume / fractional-liter lines (common on
 *    the "กรอกปั๊ม" file). The spec's own text says this drift is normally
 *    "0.01–0.20 บาท" per group, but the spec's stated ±0.05 tolerance was
 *    already tighter than its own example — and real files pushed it
 *    further: up to Bt1.14 observed on a single 3,646-liter product group.
 *    Bt2 per group leaves headroom over that with margin, while still
 *    catching real parsing bugs, which manifest as differences of
 *    thousands of baht (a wrong column), not fractions of a baht.
 *  - the ±5 per-file tolerance is unchanged and matches the spec's own
 *    documented example (Bt1.80 total drift across 24 product groups on
 *    that same file).
 *
 * Product/customer level comparisons use the qtyComputed/valueComputed the
 * parser already paired with each subtotal line while scanning (see
 * salesReport.ts block accumulators) — NOT a global re-aggregation — because
 * a product code can recur once per customer, each occurrence closed by its
 * own subtotal line.
 *
 * Every issue carries `rawLine` — the exact PDF-extracted text the parser
 * pulled qty/value out of — so a checksum failure against a real file is
 * debuggable without server log access: the mismatch itself shows you what
 * the extractQtyAndValue() ASSUMPTION got wrong for that file's real layout.
 */
const VALUE_TOLERANCE_PER_PRODUCT = 2;
const VALUE_TOLERANCE_PER_FILE = 5;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function checksumSalesReport(report: ParsedSalesReport): ChecksumResult {
  const issues: ChecksumIssue[] = [];

  for (const subtotal of report.productSubtotals) {
    if (round2(subtotal.qtyComputed) !== round2(subtotal.qtyTotal)) {
      issues.push({
        level: "product",
        key: subtotal.productCode,
        message: `ปริมาณผลิตภัณฑ์ ${subtotal.productCode} ไม่ตรง: คำนวณได้ ${round2(subtotal.qtyComputed)} ล. แต่รายงานบอก ${round2(subtotal.qtyTotal)} ล. | บรรทัดจริง: "${subtotal.rawLine}"`,
      });
    }
    if (Math.abs(subtotal.valueComputed - subtotal.valueTotal) > VALUE_TOLERANCE_PER_PRODUCT) {
      issues.push({
        level: "product",
        key: subtotal.productCode,
        message: `มูลค่าผลิตภัณฑ์ ${subtotal.productCode} ต่างเกิน ${VALUE_TOLERANCE_PER_PRODUCT} บาท: คำนวณได้ ${subtotal.valueComputed.toFixed(2)} แต่รายงานบอก ${subtotal.valueTotal.toFixed(2)} | บรรทัดจริง: "${subtotal.rawLine}"`,
      });
    }
  }

  for (const subtotal of report.customerSubtotals) {
    if (round2(subtotal.qtyComputed) !== round2(subtotal.qtyTotal)) {
      issues.push({
        level: "customer",
        key: subtotal.customerNameRaw,
        message: `ปริมาณลูกค้า "${subtotal.customerNameRaw}" ไม่ตรง: คำนวณได้ ${round2(subtotal.qtyComputed)} แต่รายงานบอก ${round2(subtotal.qtyTotal)} | บรรทัดจริง: "${subtotal.rawLine}"`,
      });
    }
  }

  if (!report.grandTotal) {
    issues.push({
      level: "file",
      key: "grand_total",
      message: "ไม่พบบรรทัด 'รวมทั้งสิ้น' ท้ายไฟล์ — parser อาจอ่านไฟล์ไม่ครบ",
    });
  } else {
    const totalQty = round2(report.lines.reduce((s, l) => s + l.qty, 0));
    const totalValue = report.lines.reduce((s, l) => s + l.saleValue, 0);
    if (totalQty !== round2(report.grandTotal.qtyTotal)) {
      issues.push({
        level: "file",
        key: "grand_total_qty",
        message: `ปริมาณรวมทั้งไฟล์ไม่ตรง: คำนวณได้ ${totalQty} ล. แต่รายงานบอก ${round2(report.grandTotal.qtyTotal)} ล. | บรรทัดจริง: "${report.grandTotal.rawLine}"`,
      });
    }
    if (Math.abs(totalValue - report.grandTotal.valueTotal) > VALUE_TOLERANCE_PER_FILE) {
      issues.push({
        level: "file",
        key: "grand_total_value",
        message: `มูลค่ารวมทั้งไฟล์ต่างเกิน ${VALUE_TOLERANCE_PER_FILE} บาท: คำนวณได้ ${totalValue.toFixed(2)} แต่รายงานบอก ${report.grandTotal.valueTotal.toFixed(2)} | บรรทัดจริง: "${report.grandTotal.rawLine}"`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
