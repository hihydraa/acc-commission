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
 * Column layout for subtotal/grand-total lines (extractQtyAndValue below)
 * was originally a guess and has since been CONFIRMED against 4 real
 * production PDFs (เบอร์60/เบอร์67/เทรลเลอร์68/กรอกปั๊ม, ส.ค. 69) — see the
 * tests in tests/parser/extractQtyAndValue.test.ts, which use verbatim
 * lines from those files and match the spec's known-correct §3.6 totals
 * exactly.
 *
 * The SALE-LINE column order (doc_no/date/qty/sale_value/cost/
 * customer_code/...) and header/column-header skip markers are confirmed
 * against real files too now (เทรลเลอร์68, ส.ค. 69 — the qty total came out
 * as exactly 0 the first time this ran against a real file that needed the
 * pdfjs-dist fallback, tracked down to leadingSpaces indentation detection:
 * see CUSTOMER_CODE_RE below).
 *
 * The mandatory checksum (§3.6) fails loudly rather than silently
 * producing wrong commission numbers when any assumption here is wrong —
 * that fail-closed behavior is intentional and must not be relaxed.
 */

const SALE_LINE_RE = /^(\S.*?)\s+(\d{2}\/\d{2}\/\d{2})\s+(.*)$/;
// Captures "<name> /<code>" from the start of the line. Deliberately NOT
// anchored at the end — subtotal lines have more tokens (qty/value/"ลิตร")
// trailing after the code, unlike plain header lines.
const CODE_SUFFIX_RE = /^(.+?)\s*\/\s*(\S+)/;

/**
 * Distinguishes a customer header ("ปมปุบริการ /KCL660037") from a product
 * header ("ดีเซล-1 /DS") by the CODE'S SHAPE, not indentation.
 *
 * This used to key off leading-whitespace indentation (customer headers
 * un-indented, product headers indented) — but that broke completely on
 * the one real file that needed the pdfjs-dist extraction fallback:
 * modern pdf.js collapses all leading/repeated whitespace to single spaces
 * (see pdfExtract.ts), so every line came out with zero indentation and
 * every product header got misread as a customer header, silently
 * corrupting `currentProductCode` for every following sale line. The old
 * pdf-parse path happens to preserve raw spacing (its bundled pdf.js is
 * old enough to not normalize it), which is why this worked before.
 *
 * Customer codes are 2-5 letters immediately followed by 4+ digits with
 * nothing after (KCL660037, KNDC0018). No known product code matches this
 * shape — they're either pure letters (DSKN) or end in letters after the
 * digits (B20KN, G91KN) or have too few trailing digits (DS2, G91) — so
 * this distinguishes the two regardless of whitespace fidelity.
 */
const CUSTOMER_CODE_RE = /^[A-Za-z]{2,5}\d{4,}$/;

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

/**
 * Column layout confirmed against real exported PDFs (spec files เบอร์60/
 * เบอร์67/เทรลเลอร์68/กรอกปั๊ม, ส.ค. 69) — a subtotal/grand-total line always
 * has exactly 6 quantity columns then, after the "ลิตร" label, 9 value
 * columns: [cash_qty, credit_qty, _, _, _, TOTAL_QTY] ลิตร
 * [cash_value, credit_value, _, _, TOTAL_VALUE, cost, _, profit, profit%].
 * The trailing "profit%" column (a small number like 6.19-11.70) was being
 * misread as the total value before this fix — verified by reproducing all
 * 4 real files' grand totals exactly against the spec's known reference
 * numbers (6,303,635.56 / 7,189,472.77 / 5,051,106.44).
 */
export function extractQtyAndValue(line: string): { qty: number | null; value: number | null } {
  const litersIdx = line.indexOf("ลิตร");

  if (litersIdx !== -1) {
    const beforeNumbers = [...line.slice(0, litersIdx).matchAll(/-?[\d,]+\.\d+/g)].map((m) =>
      parseThaiNumber(m[0])
    );
    const qty = beforeNumbers.length > 0 ? beforeNumbers[beforeNumbers.length - 1] : null;

    const afterNumbers = [...line.slice(litersIdx + "ลิตร".length).matchAll(/-?[\d,]+\.\d+/g)].map((m) =>
      parseThaiNumber(m[0])
    );
    const value = afterNumbers.length >= 5 ? afterNumbers[4] : afterNumbers[afterNumbers.length - 1] ?? null;
    return { qty, value };
  }

  // No "ลิตร" label — this is the file grand-total line, which omits the
  // unit label but keeps the same fixed 6-qty + 9-value column layout.
  const numberTokens = [...line.matchAll(/-?[\d,]+\.\d+/g)].map((m) => parseThaiNumber(m[0]));
  if (numberTokens.length === 0) return { qty: null, value: null };
  const qty = numberTokens.length >= 6 ? numberTokens[5] : numberTokens[0];
  const value = numberTokens.length >= 11 ? numberTokens[10] : numberTokens[numberTokens.length - 1];
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

    if (SKIP_LINE_MARKERS.some((m) => trimmed.includes(m))) continue;
    if (COMPANY_LINE_RE.test(trimmed)) continue;

    if (trimmed.startsWith("รวมทั้งสิ้น")) {
      const { qty, value } = extractQtyAndValue(trimmed);
      const countMatch = trimmed.match(/([\d,]+)\s*ราย/);
      result.grandTotal = {
        customerCount: countMatch ? parseInt(countMatch[1].replace(/,/g, ""), 10) : null,
        qtyTotal: qty ?? 0,
        valueTotal: value ?? 0,
        rawLine: trimmed,
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
        rawLine: trimmed,
      });
      customerBlockQty = 0;
      customerBlockValue = 0;
      continue;
    }

    const saleMatch = trimmed.match(SALE_LINE_RE);
    if (saleMatch) {
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
      if (hasNumericData && /ลิตร/.test(trimmed)) {
        // product subtotal line — closes the current product block
        const { qty, value } = extractQtyAndValue(trimmed);
        result.productSubtotals.push({
          productCode: headerMatch[2].toUpperCase(),
          productName: headerMatch[1].trim(),
          qtyTotal: qty ?? 0,
          valueTotal: value ?? 0,
          qtyComputed: productBlockQty,
          valueComputed: productBlockValue,
          rawLine: trimmed,
        });
        productBlockQty = 0;
        productBlockValue = 0;
        continue;
      }
      if (!hasNumericData) {
        const code = headerMatch[2].toUpperCase();
        if (CUSTOMER_CODE_RE.test(code)) {
          currentCustomerNameRaw = headerMatch[1].trim();
        } else {
          currentProductCode = code;
          currentProductName = headerMatch[1].trim();
        }
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
