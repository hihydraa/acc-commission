import type { ParsedDistanceMaster, DistanceMasterRow } from "./types";

/**
 * Parses the "ระยะทาง + เซลล์" master file (customer code -> distance km +
 * assigned salesperson). Spec gives no literal line excerpt for this file
 * either — only that it maps customer_code -> distance_km + salesperson,
 * and the critical edge case (§8): customer KCL660037 has the distance
 * column filled with the text "ทางผ่าน" (not a number) instead of a km
 * value, which must surface as a Review item every month rather than being
 * silently coerced to 0 or NaN.
 *
 * This is deliberately a permissive, best-effort line scanner (one master
 * row per line, columns separated by 2+ spaces as typically produced by
 * `pdftotext -layout` or a copy-pasted Excel export) — expect to adjust the
 * column order once run against a real export.
 */

const CUSTOMER_CODE_RE = /\b([A-Z]{2,5}\d{5,})\b/;
const THAI_TEXT_RE = /[ก-๙]/;

function parseThaiNumber(token: string): number {
  return parseFloat(token.replace(/,/g, ""));
}

export function parseDistanceMasterText(text: string): ParsedDistanceMaster {
  const warnings: string[] = [];
  const rows: DistanceMasterRow[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const codeMatch = trimmed.match(CUSTOMER_CODE_RE);
    if (!codeMatch) continue;
    const customerCode = codeMatch[1].toUpperCase();

    const split = trimmed
      .split(/\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    const tokens = split.length > 1 ? split : trimmed.split(/\s+/);

    const codeColIdx = tokens.findIndex((t) => t.toUpperCase().includes(customerCode));
    // the customer code and name are typically the first two columns, in
    // either order — whichever of positions 0/1 isn't the code is the name.
    const nameColIdx = codeColIdx === 0 ? 1 : 0;
    const customerName = tokens[nameColIdx] ?? customerCode;

    let distanceKm: number | null = null;
    let distanceRaw = "";
    let salesperson: string | null = null;

    for (let idx = 0; idx < tokens.length; idx++) {
      if (idx === codeColIdx || idx === nameColIdx) continue;
      const tok = tokens[idx];
      if (/^-?[\d,]+(\.\d+)?$/.test(tok) && distanceRaw === "") {
        distanceKm = parseThaiNumber(tok);
        distanceRaw = tok;
        continue;
      }
      if (distanceRaw === "" && THAI_TEXT_RE.test(tok)) {
        // non-numeric distance column, e.g. "ทางผ่าน" -> must go to Review, never silently 0
        distanceRaw = tok;
        distanceKm = null;
        continue;
      }
      salesperson = tok;
    }

    if (distanceRaw === "") {
      warnings.push(`แถวที่ ${i + 1}: ลูกค้า ${customerCode} ไม่พบคอลัมน์ระยะทาง — ตรวจสอบไฟล์ต้นฉบับ`);
    } else if (distanceKm === null) {
      warnings.push(
        `แถวที่ ${i + 1}: ลูกค้า ${customerCode} ระยะทางไม่ใช่ตัวเลข ("${distanceRaw}") — ต้องเข้าคิว Review เสมอ (ดูสเปค §8 กรณี KCL660037)`
      );
    }

    rows.push({
      customerCode,
      customerName: customerName || customerCode,
      distanceKm,
      distanceRaw,
      salesperson,
    });
  }

  return { rows, warnings };
}
