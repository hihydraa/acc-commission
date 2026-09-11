import type { ParsedDistanceMaster, DistanceMasterRow } from "./types";

/**
 * Parses the "ระยะทาง + เซลล์" master file (customer code -> distance km +
 * assigned salesperson).
 *
 * The real file (seen for the first time via a user-provided PDF, branch
 * กระนวน) turned out to be a narrow multi-column PDF table where pdf-parse
 * extracts each logical row split across an UNPREDICTABLE number of text
 * lines — sometimes 2, sometimes 3, and sometimes the area/distance/
 * salesperson end up jammed onto one line with ZERO separating whitespace
 * (e.g. "อ.กระนวนทางผ่านอ้อม" — area + "ทางผ่าน" + salesperson, no gaps at
 * all). A one-row-per-line scanner (the original design here) silently
 * failed on every single row: it found the customer code fine, but the
 * distance/salesperson data was always on a DIFFERENT extracted line, so
 * every row got inserted with distance_km = NULL — which then overwrote
 * any previously-correct distance in the customers table on upload. That
 * was the actual cause of a "ทุกรายมีระยะทางในไฟล์ แต่ระบบบอกว่าไม่มี" report.
 *
 * Fix: don't parse line-by-line at all. Join the whole page into one text
 * stream and anchor purely on customer-CODE matches (spec §3.4's own rule
 * — never trust Thai text position, only the code) — the segment of text
 * between one code and the next contains that customer's area + distance +
 * salesperson in some jumbled order/spacing, and the first number (or the
 * literal "ทางผ่าน") found in that segment is reliably the distance
 * regardless of line breaks or missing whitespace around it.
 *
 * "ทางผ่าน" = pass-through stop = distance 0 km (confirmed business rule,
 * see distanceKm assignment below) — 0 km still resolves through the
 * normal freight tier table (<20km = 0 baht/liter).
 */

// 4+ digits, not 5+ — a real code in this file ("KNB6001") has only 4.
const CUSTOMER_CODE_RE = /\b([A-Za-z]{1,5}\d{4,})\b/g;
const DISTANCE_OR_PASSTHROUGH_RE = /(\d+(?:\.\d+)?)|(ทางผ่าน)/;
// Common table-header fragments that can leak into the first row's
// best-effort "name" guess (display-only field, never used for matching —
// spec §3.4) — stripped for readability, not correctness.
const HEADER_NOISE_RE = /ระยะทาง|เซลล์|ลำดับ|ชื่อลูกค้า|รหัส|พื้นที่|กม\.?/g;

export function parseDistanceMasterText(text: string): ParsedDistanceMaster {
  const warnings: string[] = [];
  const rows: DistanceMasterRow[] = [];

  const fullText = text.replace(/\r?\n/g, " ").replace(/[ \t]+/g, " ");
  const codeMatches = [...fullText.matchAll(CUSTOMER_CODE_RE)];

  let cursor = 0; // end of the previously consumed row, for the name guess
  for (let i = 0; i < codeMatches.length; i++) {
    const match = codeMatches[i];
    const customerCode = match[1].toUpperCase();
    const codeStart = match.index!;
    const codeEnd = codeStart + match[0].length;
    const segmentEnd = i + 1 < codeMatches.length ? codeMatches[i + 1].index! : fullText.length;
    const segment = fullText.slice(codeEnd, segmentEnd);

    const nameGuess = fullText
      .slice(cursor, codeStart)
      .replace(HEADER_NOISE_RE, " ")
      .replace(/^\s*\d+\s*/, "") // drop a leading row/sequence number
      .replace(/\s+/g, " ")
      .trim();

    const distMatch = segment.match(DISTANCE_OR_PASSTHROUGH_RE);
    let distanceKm: number | null = null;
    let distanceRaw = "";
    let salesperson: string | null = null;

    if (!distMatch) {
      warnings.push(`ลูกค้า ${customerCode}: ไม่พบคอลัมน์ระยะทาง — ตรวจสอบไฟล์ต้นฉบับ`);
    } else {
      const matchEnd = distMatch.index! + distMatch[0].length;
      if (distMatch[1]) {
        distanceRaw = distMatch[1];
        distanceKm = parseFloat(distMatch[1]);
      } else {
        distanceRaw = "ทางผ่าน";
        distanceKm = 0;
      }
      // only the contiguous run of Thai characters right after the
      // distance token — stops before any digits/Latin text that belong
      // to the NEXT row (which can appear in this same segment when a row
      // wraps with no separating whitespace).
      salesperson = segment.slice(matchEnd).match(/^\s*([ก-๙]+)/)?.[1] ?? null;
    }

    cursor = segmentEnd;
    rows.push({
      customerCode,
      customerName: nameGuess || customerCode,
      distanceKm,
      distanceRaw,
      salesperson,
    });
  }

  if (rows.length === 0) {
    warnings.push("ไม่พบรหัสลูกค้าในไฟล์เลย — ตรวจรูปแบบไฟล์ก่อนใช้ผลลัพธ์");
  }

  return { rows, warnings };
}
