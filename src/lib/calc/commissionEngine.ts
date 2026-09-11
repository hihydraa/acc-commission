import Decimal from "decimal.js";
import { DEFAULT_FREIGHT_TIERS, FREIGHT_BLOCK, lookupFreightRate, type FreightTier } from "./freightTable";

export type SaleType = "cash" | "credit" | "overdue";

export interface EligibilityConfig {
  /** department code -> minimum liters per product line (spec §2.1: 2000 for
   *  A7/B7/68, 1000 for B3) */
  minLitersByDepartment: Record<string, number>;
  /** normalized product codes considered "fuel" and in scope (spec §4.1) */
  fuelProductCodes: Set<string>;
  /** fuel-card / daily-refill customers, editable in settings, never hardcoded (spec §4.1) */
  excludedCustomerCodes: Set<string>;
  /**
   * department code -> whether a qualifying line must ALSO be an exact
   * multiple of 1,000 liters (marketing-commission-calc SKILL correction,
   * ส.ค. 2569: a quantity like 2,500 L does not partially qualify — the
   * whole line is excluded). Defaults to `true` for any department not
   * listed, since full-truck deliveries (A7/B7/68) are always dispatched in
   * round-thousand increments. กรอกหลังปั๊ม (B3) is the confirmed exception —
   * real ส.ค. 2569 data has qualifying B3 lines like 1,470.25 L — so it must
   * be set to `false` for that department's code.
   */
  roundToThousandByDepartment?: Record<string, boolean>;
}

export interface CommissionThresholds {
  cash: number; // 0.20
  credit: number; // 0.30
  overdue: number; // 0.60
}

export interface CommissionConfig {
  thresholds: CommissionThresholds;
  ratePerLiter: number; // 0.03 (3 สตางค์/ลิตร)
  penaltyNegativeQEnabled: boolean; // config flag, spec §4.3 last row
}

export interface TransactionInput {
  id: string;
  departmentCode: string;
  productCode: string;
  qty: number;
  saleValue: number;
  cost: number;
  customerCode: string;
  /** null = not found in the distance master -> must block, never default to 0 */
  distanceKm: number | null;
  /** the "1สาย1สู้" tag — must be chosen per-bill by accounting, never inferred (spec §5) */
  isOneWay: boolean;
  /** fixed M for the "กรอกหลังปั๊ม" (B3) department: 0.10 baht/liter (spec §4.3) */
  fixedFreightRate: number | null;
  saleType: SaleType;
}

export interface TransactionCalcResult {
  id: string;
  /** true once the line passes product/qty/customer scope, even if M/N/O/P/Q/R
   *  are still blocked pending a Review decision */
  isEligible: boolean;
  blockedReason: string | null;
  flags: string[];
  grossProfit: number | null; // L
  freightRate: number | null; // M
  freightTotal: number | null; // N
  totalCost: number | null; // O
  profitAfterFreight: number | null; // P
  profitPerLiter: number | null; // Q
  /** R — kept at full precision, never rounded at row level (spec §4.4) */
  commission: number | null;
}

function emptyResult(id: string): TransactionCalcResult {
  return {
    id,
    isEligible: false,
    blockedReason: null,
    flags: [],
    grossProfit: null,
    freightRate: null,
    freightTotal: null,
    totalCost: null,
    profitAfterFreight: null,
    profitPerLiter: null,
    commission: null,
  };
}

export function isInScope(tx: Pick<TransactionInput, "productCode" | "customerCode">, config: EligibilityConfig): boolean {
  if (!config.fuelProductCodes.has(tx.productCode)) return false;
  if (tx.customerCode === "-") return false; // walk-in cash, always excluded (spec §4.1)
  if (config.excludedCustomerCodes.has(tx.customerCode)) return false;
  return true;
}

export function calculateTransaction(
  tx: TransactionInput,
  config: CommissionConfig,
  eligibility: EligibilityConfig,
  freightTiers: FreightTier[] = DEFAULT_FREIGHT_TIERS
): TransactionCalcResult {
  const base = emptyResult(tx.id);

  if (!eligibility.fuelProductCodes.has(tx.productCode)) return base; // out of scope, not fuel
  if (tx.customerCode === "-") return base; // walk-in cash, always excluded
  if (eligibility.excludedCustomerCodes.has(tx.customerCode)) return base; // fuel-card exclude list

  const minQty = eligibility.minLitersByDepartment[tx.departmentCode];
  if (minQty === undefined) {
    return { ...base, blockedReason: `ไม่รู้จักแผนก '${tx.departmentCode}' — เพิ่มใน master departments ก่อน` };
  }
  if (tx.qty < minQty) return base; // below the per-line quantity threshold, silently excluded

  const requiresRoundThousand = eligibility.roundToThousandByDepartment?.[tx.departmentCode] ?? true;
  if (requiresRoundThousand && !new Decimal(tx.qty).modulo(1000).isZero()) return base; // not an exact 1,000-liter multiple, silently excluded

  // From here the line counts toward commission (§4.1 filter passed).
  const L = new Decimal(tx.saleValue).minus(tx.cost);

  let M: Decimal;
  if (tx.isOneWay) {
    M = new Decimal(0);
  } else if (tx.fixedFreightRate !== null) {
    M = new Decimal(tx.fixedFreightRate);
  } else if (tx.distanceKm === null) {
    return {
      ...base,
      isEligible: true,
      blockedReason: "ไม่มีระยะทางใน master — กรอกระยะทาง หรือ ติ๊ก 1สาย1สู้ (spec §5)",
      grossProfit: L.toNumber(),
    };
  } else {
    const rate = lookupFreightRate(tx.distanceKm, freightTiers);
    if (rate === FREIGHT_BLOCK) {
      return {
        ...base,
        isEligible: true,
        blockedReason: `ระยะทาง ${tx.distanceKm} กม. เกิน 209 กม. หรือไม่อยู่ในตาราง — ระบุค่าขนส่ง/ลิตรเอง (spec §5)`,
        grossProfit: L.toNumber(),
      };
    }
    M = new Decimal(rate);
  }

  const N = M.times(tx.qty);
  const O = N.plus(tx.cost);
  const P = new Decimal(tx.saleValue).minus(O);
  const Q = P.div(tx.qty);

  const flags: string[] = [];
  let R: Decimal;
  if (Q.isNegative()) {
    if (config.penaltyNegativeQEnabled) {
      R = new Decimal(config.ratePerLiter).times(tx.qty).negated();
      flags.push("Q ติดลบ — หัก 3 สต./ลิตร ตาม penalty (รอบัญชียืนยันก่อนปิดรอบ)");
    } else {
      R = new Decimal(0);
      flags.push("Q ติดลบ — penalty ปิดอยู่ใน config");
    }
  } else {
    const threshold = config.thresholds[tx.saleType];
    R = Q.gte(threshold) ? new Decimal(config.ratePerLiter).times(tx.qty) : new Decimal(0);
  }

  return {
    id: tx.id,
    isEligible: true,
    blockedReason: null,
    flags,
    grossProfit: L.toNumber(),
    freightRate: M.toNumber(),
    freightTotal: N.toNumber(),
    totalCost: O.toNumber(),
    profitAfterFreight: P.toNumber(),
    profitPerLiter: Q.toNumber(),
    commission: R.toNumber(),
  };
}
