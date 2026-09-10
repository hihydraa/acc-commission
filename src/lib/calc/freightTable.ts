/**
 * Freight (ค่าขนส่ง) lookup by distance, spec §4.3.
 *
 * Bug fixed from v1 (spec v2 §0 item #1): distances beyond the table, or
 * missing from the customer master entirely, must BLOCK the row for manual
 * review — never silently default to a freight rate of 0, which would
 * overstate profit-per-liter and overpay commission.
 *
 * This is meant to be seeded into the `freight_tiers` table (spec §6) so
 * accounting can adjust it without a code change; `DEFAULT_FREIGHT_TIERS`
 * doubles as that seed data and as the default for tests.
 */

export interface FreightTier {
  minKm: number;
  maxKm: number;
  rate: number;
}

export const DEFAULT_FREIGHT_TIERS: FreightTier[] = [
  { minKm: 0, maxKm: 19, rate: 0 },
  { minKm: 20, maxKm: 59, rate: 0.15 },
  { minKm: 60, maxKm: 69, rate: 0.17 },
  { minKm: 70, maxKm: 79, rate: 0.19 },
  { minKm: 80, maxKm: 89, rate: 0.2 },
  { minKm: 90, maxKm: 99, rate: 0.22 },
  { minKm: 100, maxKm: 109, rate: 0.24 },
  { minKm: 110, maxKm: 129, rate: 0.28 },
  { minKm: 130, maxKm: 139, rate: 0.3 },
  { minKm: 140, maxKm: 159, rate: 0.32 },
  { minKm: 160, maxKm: 169, rate: 0.34 },
  { minKm: 170, maxKm: 179, rate: 0.35 },
  { minKm: 180, maxKm: 189, rate: 0.36 },
  { minKm: 190, maxKm: 199, rate: 0.38 },
  { minKm: 200, maxKm: 209, rate: 0.39 },
];

export const FREIGHT_BLOCK = "BLOCK" as const;

/**
 * Tiers assume whole-number km inputs, matching how the distance master
 * data is recorded (§6 `customers.distance_km`). A fractional distance that
 * falls between two integer tier boundaries (e.g. 19.5) will BLOCK rather
 * than guess — safer than silently picking a neighboring tier.
 */
export function lookupFreightRate(
  distanceKm: number,
  tiers: FreightTier[] = DEFAULT_FREIGHT_TIERS
): number | typeof FREIGHT_BLOCK {
  if (distanceKm < 0 || distanceKm > 209) return FREIGHT_BLOCK;
  for (const tier of tiers) {
    if (distanceKm >= tier.minKm && distanceKm <= tier.maxKm) return tier.rate;
  }
  return FREIGHT_BLOCK;
}
