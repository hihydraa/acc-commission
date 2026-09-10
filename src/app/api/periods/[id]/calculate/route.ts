import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateTransaction,
  type CommissionConfig,
  type EligibilityConfig,
  type SaleType,
  type TransactionInput,
} from "@/lib/calc/commissionEngine";
import type { FreightTier } from "@/lib/calc/freightTable";

export const runtime = "nodejs";

/**
 * Re-runs the L-R commission formulas (spec §4.3) for every transaction in
 * a period, using the CURRENT master data / config / manual adjustments
 * (distance_km, is_excluded, is_one_way, sale_type overrides) — safe to
 * call repeatedly as accounting clears Review items (spec §5).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const periodId = params.id;
  const db = createServiceRoleClient();

  const { data: departments } = await db.from("departments").select("*");
  const { data: products } = await db.from("products").select("*");
  const { data: configRows } = await db.from("commission_config").select("*");
  const { data: freightTierRows } = await db.from("freight_tiers").select("*");
  const { data: transactions } = await db.from("transactions").select("*").eq("period_id", periodId);

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ ok: true, calculated: 0, message: "ไม่มีรายการให้คำนวณ — อัปโหลดไฟล์ก่อน" });
  }

  const configMap = new Map((configRows ?? []).map((c) => [c.key, c.value as unknown]));
  const thresholds = (configMap.get("thresholds") as CommissionConfig["thresholds"]) ?? {
    cash: 0.2,
    credit: 0.3,
    overdue: 0.6,
  };
  const ratePerLiter = Number(configMap.get("rate_per_liter") ?? 0.03);
  const penaltyNegativeQEnabled = Boolean(
    (configMap.get("penalty_negative_q") as { enabled?: boolean } | undefined)?.enabled ?? true
  );
  const commissionConfig: CommissionConfig = { thresholds, ratePerLiter, penaltyNegativeQEnabled };

  const minLitersByDepartment: Record<string, number> = {};
  const fixedFreightByDepartment: Record<string, number | null> = {};
  for (const d of departments ?? []) {
    minLitersByDepartment[d.code] = Number(d.min_liters);
    fixedFreightByDepartment[d.code] = d.fixed_freight === null ? null : Number(d.fixed_freight);
  }

  const fuelProductCodes = new Set((products ?? []).filter((p) => p.is_fuel).map((p) => p.code));

  const { data: excludedCustomers } = await db.from("customers").select("code").eq("is_excluded", true);
  const excludedCustomerCodes = new Set((excludedCustomers ?? []).map((c) => c.code));

  const customerCodes = [...new Set(transactions.map((t) => t.customer_code).filter(Boolean) as string[])];
  const { data: customers } =
    customerCodes.length > 0
      ? await db.from("customers").select("code, distance_km").in("code", customerCodes)
      : { data: [] as { code: string; distance_km: number | null }[] };
  const distanceByCustomer = new Map((customers ?? []).map((c) => [c.code, c.distance_km]));

  const freightTiers: FreightTier[] | undefined =
    freightTierRows && freightTierRows.length > 0
      ? freightTierRows.map((t) => ({ minKm: Number(t.min_km), maxKm: Number(t.max_km), rate: Number(t.rate) }))
      : undefined;

  const eligibility: EligibilityConfig = { minLitersByDepartment, fuelProductCodes, excludedCustomerCodes };

  const updates = transactions.map((tx) => {
    let saleType = tx.sale_type as SaleType | null;
    const flags: string[] = [];
    if (!saleType) {
      saleType = "credit";
      flags.push("ไม่พบประเภทขาย (H/I) จากเลขเอกสาร — ตั้งเป็น 'ขายเชื่อ' ชั่วคราว โปรดตรวจสอบ");
    }

    const input: TransactionInput = {
      id: tx.id,
      departmentCode: tx.department_code,
      productCode: tx.product_code,
      qty: Number(tx.qty),
      saleValue: Number(tx.sale_value),
      cost: Number(tx.cost),
      customerCode: tx.customer_code ?? "-",
      distanceKm: tx.customer_code ? distanceByCustomer.get(tx.customer_code) ?? null : null,
      isOneWay: tx.is_one_way,
      fixedFreightRate: fixedFreightByDepartment[tx.department_code] ?? null,
      saleType,
    };
    const result = calculateTransaction(input, commissionConfig, eligibility, freightTiers);

    return db
      .from("transactions")
      .update({
        distance_km: input.distanceKm,
        gross_profit: result.grossProfit,
        freight_rate: result.freightRate,
        freight_total: result.freightTotal,
        total_cost: result.totalCost,
        profit_after_freight: result.profitAfterFreight,
        profit_per_liter: result.profitPerLiter,
        commission: result.commission,
        is_eligible: result.isEligible,
        blocked_reason: result.blockedReason,
        flags: [...flags, ...result.flags],
      })
      .eq("id", tx.id);
  });

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, calculated: transactions.length });
}
