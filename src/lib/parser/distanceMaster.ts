import type { ParsedDistanceMaster, DistanceMasterRow } from "./types";

/**
 * Parses the "ระยะทาง + เซลล์" master file (customer code -> distance km +
 * assigned salesperson). Spec gives no literal line excerpt for this file
 * either — only that it maps customer_code -> distance_km + salesperson.
 *
 * "ทางผ่าน" (customer is along the route to another stop, e.g. KCL660037)
 * means distance = 0 km — confirmed directly by the user, overriding the
 * original spec text (§8) which said this must always queue for Review.
 * 0 km still routes through the normal freight tier table and lands in the
 * "< 20 km -> 0 baht/liter" bracket, so this is really just a plain
 * zero-distance entry, not a special case needing manual freight input.
 * Any OTHER non-numeric distance text (not literally "ทางผ่าน") still
 * blocks for Review — that's a genuinely unknown case, not a confirmed one.
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
        distanceRaw = tok;
        // "ทางผ่าน" = pass-through stop = 0 km (confirmed business rule).
        // Any other non-numeric text is a genuinely unknown case and still
        // blocks for Review rather than guessing.
        distanceKm = tok.replace(/\s+/g, "") === "ทางผ่าน" ? 0 : null;
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
