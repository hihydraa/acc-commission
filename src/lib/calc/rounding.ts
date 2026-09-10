import Decimal from "decimal.js";

/**
 * Spec §4.4 — the single rounding point in the whole system: 2 decimal
 * places, ROUND_HALF_UP, applied only at the per-cell (salesperson) summary
 * level. Row-level commission (R) is kept at full precision — see
 * commissionEngine.ts.
 */
export function roundHalfUp2(value: number | Decimal): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
