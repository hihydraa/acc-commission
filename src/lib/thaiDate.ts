/** Converts a dd/mm/yy (Buddhist Era) date as printed on these reports into
 *  an ISO yyyy-mm-dd string for Postgres `date` columns. Returns null if the
 *  string doesn't parse — callers should treat that as "needs manual entry",
 *  never guess. */
export function thaiDateToIso(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let beYear = parseInt(m[3], 10);
  if (beYear < 100) beYear += 2500;
  const gregorianYear = beYear - 543;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${gregorianYear}-${pad(month)}-${pad(day)}`;
}

/** Inverse of thaiDateToIso — converts a Postgres `date` (ISO, Gregorian)
 *  back into the dd/mm/yy (Buddhist Era, 2-digit year) shape the parsers and
 *  arMatch.ts expect, so DB-stored dates can round-trip through the same
 *  matching logic the unit tests cover instead of duplicating it. */
export function isoToThaiDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const gregorianYear = parseInt(m[1], 10);
  const beYear = gregorianYear + 543;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${m[3]}/${m[2]}/${pad(beYear % 100)}`;
}
