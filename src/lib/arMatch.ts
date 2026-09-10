import type { ArOutstandingRow } from "./parser/types";

/**
 * Outstanding-AR matching, spec §5.3 — all 4 rules must hold:
 *  1. normalize doc numbers on both sides (strip whitespace, uppercase)
 *  2. strip the "-N" line-item suffix (IDB726080044-1 -> IDB726080044)
 *  3. only match bills dated within the month being calculated (the AR
 *     report is issued on the 7th of the *next* month and includes plenty
 *     of next-month bills that must NOT be flagged)
 *  4. only match against transactions that already passed the commission
 *     eligibility filter
 *
 * Rules 1-2 are applied by the parsers themselves (both salesReport.ts and
 * arReport.ts compute `baseDocNo` via the same `normalize.ts` helpers), so
 * this module only needs to enforce rules 3-4.
 */

export interface PeriodMonth {
  /** full Buddhist Era year, e.g. 2569 */
  year: number;
  /** 1-12 */
  month: number;
}

export interface ArMatchResult {
  baseDocNo: string;
  customerNameRaw: string;
  outstanding: number;
  billDate: string;
}

function parseThaiDate(d: string): { month: number; year: number } | null {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2500; // 2-digit Buddhist Era year, e.g. "69" -> 2569
  return { month, year };
}

export function matchOutstandingBills(
  arRows: ArOutstandingRow[],
  eligibleBaseDocNos: ReadonlySet<string>,
  period: PeriodMonth
): ArMatchResult[] {
  const results: ArMatchResult[] = [];
  for (const row of arRows) {
    if (!eligibleBaseDocNos.has(row.baseDocNo)) continue; // rule 4
    if (!row.billDate) continue;
    const parsed = parseThaiDate(row.billDate);
    if (!parsed || parsed.month !== period.month || parsed.year !== period.year) continue; // rule 3
    results.push({
      baseDocNo: row.baseDocNo,
      customerNameRaw: row.customerNameRaw,
      outstanding: row.outstanding,
      billDate: row.billDate,
    });
  }
  return results;
}
