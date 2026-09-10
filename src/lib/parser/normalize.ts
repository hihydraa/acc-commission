/**
 * Text normalization helpers for parsing PDF-extracted reports.
 *
 * Background (spec §3.4-3.5): `pdftotext` output from the source accounting
 * system drops some Thai vowel/tone marks and occasionally injects a Private
 * Use Area (PUA) glyph mid-word (observed as U+F70B in "สินค้า" -> "สิน<PUA>ค้า").
 * Document numbers also sometimes get a stray space inserted before the
 * line-item suffix (e.g. "ID6501963- 1" instead of "ID6501963-1").
 *
 * Rule (spec §3.4): NEVER match on raw Thai customer names. Always match on
 * `customer_code`. Thai-keyword matching (e.g. detecting report section
 * markers) must go through `normalizeThai` first.
 */

// Unicode Private Use Area block. The spec's own regex literal for this
// (`/[-]/g` in the source doc) lost its actual PUA glyph when the source
// file was saved as plain text, so we match the whole PUA block instead of
// trying to reproduce the single invisible character.
const PUA_RANGE = /[\u{E000}-\u{F8FF}]/gu;

// Thai combining vowel signs (above/below) and tone marks that pdftotext
// sometimes drops from one side of a word but not the other, so we strip
// them from both sides before comparing.
const THAI_COMBINING_MARKS = /[ัิ-ฺ็-๎]/g;

export function normalizeThai(s: string): string {
  return s.replace(PUA_RANGE, "").replace(THAI_COMBINING_MARKS, "");
}

export function normalizeDocNo(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** Strip the trailing "-<line item number>" suffix, e.g. IDB726080044-1 -> IDB726080044 */
export function baseDocNo(s: string): string {
  return normalizeDocNo(s).replace(/-\d+$/, "");
}
