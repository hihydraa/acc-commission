import { normalizeDocNo, baseDocNo } from "./normalize";
import type {
  ParsedSalesReport,
  DepartmentCode,
} from "./types";

/**
 * Parses "รายงานสรุปยอดขาย แยกตามลูกค้า" (per-vehicle sales report) plain
 * text — already extracted from PDF via `pdftotext -layout` or `pdf-parse`
 * (see `parseSalesReportPdf` for the PDF-buffer wrapper, which lives outside
 * this module so the line-parsing logic stays unit-testable with plain
 * strings, per the "deterministic parser, no PDF binary needed for tests"
 * approach in spec §9 step 1).
 *
 * ⚠️ KNOWN LIMITATION — read before trusting this against real files:
 * this session had no real PDF sample to parse against, only the line
 * excerpts quoted in the spec (§3.2-§3.6). The following assumptions are
 * best-effort guesses and MUST be verified against an actual exported PDF
 * before this goes into production (see README "ก่อนใช้งานจริง"):
 *   1. In subtotal / grand-total lines, the liters figure is the number
 *      immediately followed by the unit label "ลิตร"; the value figure is
 *      the right-most decimal number on the line.
 *   2. Page-header / column-header lines are recognized by the marker list
 *      in SKIP_LINE_MARKERS below.
 * If parsing disagrees with the real files, the mandatory checksum (§3.6)
 * will fail loudly rather than silently producing wrong commission numbers
 * — that fail-closed behavior is intentional and must not be relaxed.
 */

const SALE_LINE_RE = /^(\S.*?)\s+(\d{2}\/\d{2}\/\d{2})\s+(.*)$/;
// Captures "<name> /<code>" from the start of the line. Deliberately NOT
// anchored at the end — subtotal lines have more tokens (qty/value/"ลิตร")
// trailing after the code, unlike plain header lines.
const CODE_SUFFIX_RE = /^(.+?)\s*\/\s*(\S+)/;

const SKIP_LINE_MARKERS = [
  "หน้า",
  "หนา :",
  "หนา:",
  "เลขที่เอกสาร",
  "รายการสินค้า",
  "รายการสินคา",
  "เขตการขายจาก",
];

const COMPANY_LINE_RE = /^ห[จๆ]ก\.|บริษัท|ห้างหุ้นส่วน|หางหุนสวน/;

function parseThaiNumber(token: string | undefined): number {
  if (!token) return NaN;
  return parseFloat(token.replace(/,/g, ""));
}

function isNumericToken(token: string): boolean {
  return /^-?[\d,]+(\.\d+)?$/.test(token);
}

function extractQtyAndValue(line: string): { qty: number | null; value: number | null } {
  const numberTokens = [...line.matchAll(/-?[\d,]+\.\d+/g)].map((m) => parseThaiNumber(m[0]));
  if (numberTokens.length === 0) return { qty: null, value: null };
  const litersMatch = line.match(/([\d,]+\.\d+)\s*ลิตร/);
  const qty = litersMatch ? parseThaiNumber(litersMatch[1]) : numberTokens[0] ?? null;
  const value = numberTokens[numberTokens.length - 1] ?? null;
  return { qty, value };
}

export function parseSalesReportText(text: string): ParsedSalesReport {
  const warnings: string[] = [];
  const rawLines = text.split(/\r?\n/);

  const deptMatch = text.match(/เลือกแผนก\s*([A-Za-z0-9]+)/);
  const departmentCode: DepartmentCode | null = deptMatch ? deptMatch[1].toUpperCase() : null;
  if (!departmentCode) {
    warnings.push("ไม่พบบรรทัด 'เลือกแผนก' ในไฟล์ — ไม่สามารถระบุแผนกอัตโนมัติได้ ต้องเลือกแผนกด้วยมือ");
  }

  const result: ParsedSalesReport = {
    departmentCode,
    lines: [],
    productSubtotals: [],
    customerSubtotals: [],
    grandTotal: null,
    warnings,
  };

  let currentProductCode = "";
  let currentProductName = "";
  let currentCustomerNameRaw = "";
  let grandTotalSeen = false;

  // Block accumulators for the product-level / customer-level checksums
  // (spec §3.6). A "block" is the run of sale lines between the previous
  // subtotal line and the next one — NOT reset on a page break, since a
  // product/customer block can span pages without repeating its header
  // (spec §3.2 warning).
  let productBlockQty = 0;
  let productBlockValue = 0;
  let customerBlockQty = 0;
  let customerBlockValue = 0;

  for (let i = 0; i < rawLines.length; i++) {
    if (grandTotalSeen) break; // "รวมทั้งสิ้น" is the last meaningful line in the file
    const raw = rawLines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leadingSpaces = raw.length - raw.trimStart().length;

    if (SKIP_LINE_MARKERS.some((m) => trimmed.includes(m))) continue;
    if (COMPANY_LINE_RE.test(trimmed)) continue;

    if (trimmed.startsWith("รวมทั้งสิ้น")) {
      const { qty, value } = extractQtyAndValue(trimmed);
      const countMatch = trimmed.match(/([\d,]+)\s*ราย/);
      result.grandTotal = {
        customerCount: countMatch ? parseInt(countMatch[1].replace(/,/g, ""), 10) : null,
        qtyTotal: qty ?? 0,
        valueTotal: value ?? 0,
      };
      grandTotalSeen = true;
      continue;
    }

    if (trimmed.startsWith("รวมลูกคา") || trimmed.startsWith("รวมลูกค้า")) {
      const { qty, value } = extractQtyAndValue(trimmed);
      const nameMatch = trimmed.match(/^รวมลูกค[้]?า\s*(.+?)(?:\s*\/|\s+\d)/);
      result.customerSubtotals.push({
        customerNameRaw: nameMatch ? nameMatch[1].trim() : trimmed,
        qtyTotal: qty ?? 0,
        valueTotal: value ?? 0,
        qtyComputed: customerBlockQty,
        valueComputed: customerBlockValue,
      });
      customerBlockQty = 0;
      customerBlockValue = 0;
      continue;
    }

    const saleMatch = trimmed.match(SALE_LINE_RE);
    if (saleMatch && leadingSpaces > 0) {
      const [, docNoRaw, date, restRaw] = saleMatch;
      const rest = restRaw.trim().split(/\s+/).filter(Boolean);
      const qty = parseThaiNumber(rest[0]);
      const saleValue = parseThaiNumber(rest[1]);
      const cost = parseThaiNumber(rest[2]);
      const customerCode = rest[3] ?? "";

      let qty2 = NaN;
      for (let j = 4; j < rest.length; j++) {
        if (isNumericToken(rest[j])) {
          qty2 = parseThaiNumber(rest[j]);
          break;
        }
      }

      if (!Number.isNaN(qty) && !Number.isNaN(saleValue) && customerCode) {
        result.lines.push({
          docNo: normalizeDocNo(docNoRaw),
          baseDocNo: baseDocNo(docNoRaw),
          date,
          qty,
          qty2: Number.isNaN(qty2) ? qty : qty2,
          saleValue,
          cost: Number.isNaN(cost) ? 0 : cost,
          customerCode,
          productCode: currentProductCode,
          productName: currentProductName,
          customerNameRaw: currentCustomerNameRaw,
          sourceLineNo: i + 1,
        });
        productBlockQty += qty;
        productBlockValue += saleValue;
        customerBlockQty += qty;
        customerBlockValue += saleValue;
        if (!Number.isNaN(qty2) && qty !== qty2) {
          warnings.push(
            `แถวที่ ${i + 1}: qty (${qty}) ไม่เท่ากับ qty2 (${qty2}) — เอกสาร ${normalizeDocNo(docNoRaw)}`
          );
        }
      } else {
        warnings.push(`แถวที่ ${i + 1}: parse รายการขายไม่สำเร็จ (ข้าม): "${trimmed}"`);
      }
      continue;
    }

    const headerMatch = trimmed.match(CODE_SUFFIX_RE);
    if (headerMatch) {
      // NOTE: can't use "contains any digit" to tell a header from a
      // subtotal line — product names themselves contain digits (e.g.
      // "ดีเซล-1", "ดีเซลบี20"). A subtotal line is distinguished by having
      // an actual decimal-formatted number and/or the "ลิตร" unit label.
      const hasNumericData = /\d+\.\d+/.test(trimmed) || /ลิตร/.test(trimmed);
      if (hasNumericData && /ลิตร/.test(trimmed) && leadingSpaces > 0) {
        // product subtotal line — closes the current product block
        const { qty, value } = extractQtyAndValue(trimmed);
        result.productSubtotals.push({
          productCode: headerMatch[2].toUpperCase(),
          productName: headerMatch[1].trim(),
          qtyTotal: qty ?? 0,
          valueTotal: value ?? 0,
          qtyComputed: productBlockQty,
          valueComputed: productBlockValue,
        });
        productBlockQty = 0;
        productBlockValue = 0;
        continue;
      }
      if (!hasNumericData && leadingSpaces > 0) {
        // product header
        currentProductCode = headerMatch[2].toUpperCase();
        currentProductName = headerMatch[1].trim();
        continue;
      }
      if (!hasNumericData && leadingSpaces === 0) {
        // customer header
        currentCustomerNameRaw = headerMatch[1].trim();
        continue;
      }
    }
    // otherwise: unrecognized decorative/blank line — ignore silently.
  }

  if (!grandTotalSeen) {
    warnings.push("ไม่พบบรรทัด 'รวมทั้งสิ้น' — checksum ระดับไฟล์จะไม่ผ่านแน่นอน ตรวจสอบว่าไฟล์ครบหรือไม่");
  }

  return result;
}
