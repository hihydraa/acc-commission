import { describe, it, expect } from "vitest";
import {
  calculateTransaction,
  isInScope,
  type CommissionConfig,
  type EligibilityConfig,
  type TransactionInput,
} from "@/lib/calc/commissionEngine";

const eligibility: EligibilityConfig = {
  minLitersByDepartment: { A7: 2000, B7: 2000, "68": 2000, B3: 1000 },
  fuelProductCodes: new Set(["DS", "DS2", "DSB20", "G91", "G95"]),
  excludedCustomerCodes: new Set(["KNDC0018"]),
  // marketing-commission-calc SKILL correction: full-truck departments must
  // also be an exact multiple of 1,000 L; กรอกหลังปั๊ม (B3) is the confirmed
  // exception — real ส.ค. 2569 data has qualifying B3 lines like 1,470.25 L.
  roundToThousandByDepartment: { A7: true, B7: true, "68": true, B3: false },
};

const config: CommissionConfig = {
  thresholds: { cash: 0.2, credit: 0.3, overdue: 0.6 },
  ratePerLiter: 0.03,
  penaltyNegativeQEnabled: true,
};

function b3Tx(overrides: Partial<TransactionInput>): TransactionInput {
  return {
    id: "tx",
    departmentCode: "B3",
    productCode: "DS",
    qty: 1000,
    saleValue: 0,
    cost: 0,
    customerCode: "KCL000001",
    distanceKm: null,
    isOneWay: false,
    fixedFreightRate: 0.1, // B3 fixed freight (spec §4.3)
    saleType: "cash",
    ...overrides,
  };
}

describe("calculateTransaction — B3 (กรอกหลังปั๊ม) reference numbers, spec §8", () => {
  it("bill of 1,470.25 liters yields commission 44.1075 baht, unrounded at row level", () => {
    const qty = 1470.25;
    const cost = 50000;
    const saleValue = cost + qty * 0.5; // arbitrary margin comfortably above the 0.20 threshold
    const result = calculateTransaction(
      b3Tx({ id: "t1", qty, cost, saleValue }),
      config,
      eligibility
    );
    expect(result.isEligible).toBe(true);
    expect(result.blockedReason).toBeNull();
    expect(result.commission).toBe(44.1075);
  });

  it("two bills (1,012.64 L + 1,114.30 L) sum to the 63.81 baht lost when excluding KNDC0018", () => {
    const mk = (qty: number) =>
      calculateTransaction(
        b3Tx({ id: `x-${qty}`, qty, cost: 100000, saleValue: 100000 + qty * 0.5 }),
        config,
        eligibility
      );
    const r1 = mk(1012.64);
    const r2 = mk(1114.3);
    expect(r1.commission).toBeCloseTo(30.3792, 4);
    expect(r2.commission).toBeCloseTo(33.429, 4);
    const sum = (r1.commission ?? 0) + (r2.commission ?? 0);
    expect(Math.round(sum * 100) / 100).toBe(63.81);
  });

  it("excludes a customer on the exclude list entirely (KNDC0018 -> not eligible)", () => {
    const result = calculateTransaction(
      b3Tx({ qty: 1012.64, customerCode: "KNDC0018", cost: 100000, saleValue: 100506.32 }),
      config,
      eligibility
    );
    expect(result.isEligible).toBe(false);
    expect(result.commission).toBeNull();
  });

  it("excludes lines below the department's per-line quantity threshold", () => {
    const result = calculateTransaction(b3Tx({ qty: 999.99 }), config, eligibility);
    expect(result.isEligible).toBe(false);
  });

  it("excludes walk-in cash customers (customer_code === '-')", () => {
    const result = calculateTransaction(b3Tx({ customerCode: "-", qty: 5000 }), config, eligibility);
    expect(result.isEligible).toBe(false);
  });

  it("excludes non-fuel product codes", () => {
    const result = calculateTransaction(
      b3Tx({ productCode: "LUBE", qty: 5000 }),
      config,
      eligibility
    );
    expect(result.isEligible).toBe(false);
  });
});

describe("calculateTransaction — freight blocking, spec §4.3 / §5", () => {
  it("blocks (never defaults to 0) when distance is missing from master", () => {
    const result = calculateTransaction(
      b3Tx({ departmentCode: "A7", qty: 3000, fixedFreightRate: null, distanceKm: null }),
      config,
      { ...eligibility, minLitersByDepartment: { ...eligibility.minLitersByDepartment, A7: 2000 } }
    );
    expect(result.isEligible).toBe(true);
    expect(result.blockedReason).toContain("ไม่มีระยะทาง");
    expect(result.commission).toBeNull();
  });

  it("blocks when distance exceeds 209 km", () => {
    const result = calculateTransaction(
      b3Tx({ departmentCode: "A7", qty: 3000, fixedFreightRate: null, distanceKm: 250 }),
      config,
      eligibility
    );
    expect(result.blockedReason).toContain("209");
    expect(result.commission).toBeNull();
  });

  it("one-way tag ('1สาย1สู้') forces freight to 0 regardless of distance", () => {
    const result = calculateTransaction(
      b3Tx({ departmentCode: "A7", qty: 3000, fixedFreightRate: null, distanceKm: 250, isOneWay: true, cost: 50000, saleValue: 51000 }),
      config,
      eligibility
    );
    expect(result.isEligible).toBe(true);
    expect(result.blockedReason).toBeNull();
    expect(result.freightRate).toBe(0);
  });
});

describe("calculateTransaction — Q threshold and penalty, spec §4.3", () => {
  it("pays 0 when Q is positive but below the sale-type threshold", () => {
    const qty = 2000;
    const cost = 60000;
    // engineered so profit-after-freight-per-liter Q is small and positive
    const saleValue = cost + 0.1 * qty + qty * 0.05; // Q ~= 0.05 < 0.20 cash threshold
    const result = calculateTransaction(b3Tx({ qty, cost, saleValue }), config, eligibility);
    expect(result.profitPerLiter).toBeGreaterThan(0);
    expect(result.profitPerLiter!).toBeLessThan(0.2);
    expect(result.commission).toBe(0);
  });

  it("applies the negative-Q penalty (-3 satang/liter) when enabled", () => {
    const qty = 2000;
    const cost = 100000;
    const saleValue = cost - 1000; // guarantees a loss -> Q < 0
    const result = calculateTransaction(b3Tx({ qty, cost, saleValue }), config, eligibility);
    expect(result.profitPerLiter).toBeLessThan(0);
    expect(result.commission).toBeCloseTo(-0.03 * qty, 6);
    expect(result.flags.some((f) => f.includes("Q ติดลบ"))).toBe(true);
  });

  it("pays 0 (no penalty) for negative Q when the penalty flag is disabled", () => {
    const qty = 2000;
    const cost = 100000;
    const saleValue = cost - 1000;
    const result = calculateTransaction(
      b3Tx({ qty, cost, saleValue }),
      { ...config, penaltyNegativeQEnabled: false },
      eligibility
    );
    expect(result.commission).toBe(0);
  });
});

describe("calculateTransaction — round-to-1000 qualifying rule (marketing-commission-calc SKILL correction)", () => {
  it("excludes a full-truck (A7) line that is >= minLiters but not an exact multiple of 1,000", () => {
    const result = calculateTransaction(
      b3Tx({ departmentCode: "A7", qty: 2500, fixedFreightRate: null, distanceKm: 30, cost: 50000, saleValue: 51000 }),
      config,
      eligibility
    );
    expect(result.isEligible).toBe(false);
    expect(result.commission).toBeNull();
  });

  it("includes a full-truck (A7) line at exactly 2,000 L", () => {
    const result = calculateTransaction(
      b3Tx({ departmentCode: "A7", qty: 2000, fixedFreightRate: null, distanceKm: 30, cost: 50000, saleValue: 51000 }),
      config,
      eligibility
    );
    expect(result.isEligible).toBe(true);
    expect(result.commission).not.toBeNull();
  });

  it("does NOT require round-thousand for a department not listed in roundToThousandByDepartment (defaults to true)", () => {
    const result = calculateTransaction(
      b3Tx({ departmentCode: "68", qty: 3500, fixedFreightRate: null, distanceKm: 30, cost: 50000, saleValue: 51000 }),
      config,
      { ...eligibility, minLitersByDepartment: { ...eligibility.minLitersByDepartment, "68": 2000 } }
    );
    expect(result.isEligible).toBe(false); // 3,500 is not a multiple of 1,000 -> excluded, default is round-required
  });

  it("still allows fractional B3 (กรอกหลังปั๊ม) quantities to qualify (round-thousand explicitly off for that department)", () => {
    const result = calculateTransaction(b3Tx({ qty: 1470.25, cost: 50000, saleValue: 50000 + 1470.25 * 0.5 }), config, eligibility);
    expect(result.isEligible).toBe(true);
    expect(result.commission).not.toBeNull();
  });
});

describe("isInScope", () => {
  it("mirrors the same scope rules used inside calculateTransaction", () => {
    expect(isInScope({ productCode: "DS", customerCode: "KCL000001" }, eligibility)).toBe(true);
    expect(isInScope({ productCode: "DS", customerCode: "-" }, eligibility)).toBe(false);
    expect(isInScope({ productCode: "DS", customerCode: "KNDC0018" }, eligibility)).toBe(false);
    expect(isInScope({ productCode: "LUBE", customerCode: "KCL000001" }, eligibility)).toBe(false);
  });
});
