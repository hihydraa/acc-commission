import { normalizeDocNo, baseDocNo } from "./normalize";
import type { ParsedArReport } from "./types";

/**
 * Parses "รายงานลูกหนี้คงค้างแบบละเอียด" (detailed outstanding AR report).
 *
 * ⚠️ KNOWN LIMITATION: unlike the sales report, the spec gives no literal
 * line excerpt for this file's layout — only the matching *outcome* for
 * month 8/2569 (§5.3: 3 matched bills with their outstanding amounts). This
 * parser is a best-effort scaffold built from that outcome plus the general
 * shape described in §2.2/§6 (doc no + outstanding amount per bill, plus an
 * as-of date). It WILL need adjustment once run against a real exported
 * PDF — treat every regex below as a first draft, not a verified spec.
 *
 * Expected per-line shape (best guess): a document number token (letters +
 * digits, optional "-N" suffix) followed somewhere on the line by a bill
 * date (dd/mm/yy) and one or more baht amounts, the last of which is the
 * outstanding balance.
 */

const DOC_NO_TOKEN_RE = /^[A-Za-z]{1,4}\d{6,}(-\d+)?$/;
const DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4})/;

function parseThaiNumber(token: string): number {
  return parseFloat(token.replace(/,/g, ""));
}

export function parseArReportText(text: string): ParsedArReport {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);
  const rows: ParsedArReport["rows"] = [];

  const asOfMatch = text.match(/ณ\s*วันที่\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  const asOfDate = asOfMatch ? asOfMatch[1] : null;
  if (!asOfDate) {
    warnings.push("ไม่พบวันที่ 'ณ วันที่' ในรายงานลูกหนี้ — โปรดระบุ as-of date ด้วยมือ");
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const docToken = tokens[0];
    if (!docToken || !DOC_NO_TOKEN_RE.test(docToken)) continue;

    const dateMatch = trimmed.match(DATE_RE);
    const amounts = [...trimmed.matchAll(/-?[\d,]+\.\d{2}/g)].map((m) => parseThaiNumber(m[0]));
    if (amounts.length === 0) {
      warnings.push(`แถวที่ ${i + 1}: พบเลขเอกสาร ${docToken} แต่ไม่พบยอดเงิน — ข้าม`);
      continue;
    }

    let billAmount: number;
    let paidAmount: number;
    let outstanding: number;
    if (amounts.length === 1) {
      billAmount = amounts[0];
      paidAmount = 0;
      outstanding = amounts[0];
    } else if (amounts.length === 2) {
      billAmount = amounts[0];
      outstanding = amounts[1];
      paidAmount = Math.max(0, billAmount - outstanding);
    } else {
      billAmount = amounts[0];
      paidAmount = amounts[1];
      outstanding = amounts[amounts.length - 1];
    }

    // Customer name: whatever text sits between the doc no and the date (or
    // the first amount, if no date matched on this line).
    const afterDoc = trimmed.slice(docToken.length).trim();
    const cutIdx = dateMatch ? afterDoc.indexOf(dateMatch[0]) : afterDoc.search(/-?[\d,]+\.\d{2}/);
    const customerNameRaw = cutIdx > 0 ? afterDoc.slice(0, cutIdx).trim() : afterDoc;
    const customerCodeMatch = trimmed.match(/\/([A-Z0-9]{4,})/i);

    rows.push({
      baseDocNo: baseDocNo(docToken),
      customerCode: customerCodeMatch ? customerCodeMatch[1].toUpperCase() : null,
      customerNameRaw,
      billDate: dateMatch ? dateMatch[1] : null,
      billAmount,
      paidAmount,
      outstanding,
    });
  }

  if (rows.length === 0) {
    warnings.push("ไม่พบรายการลูกหนี้เลยในไฟล์นี้ — ตรวจสอบรูปแบบไฟล์ก่อนใช้ผลลัพธ์");
  }

  return { rows, asOfDate, warnings };
}

export { normalizeDocNo };
