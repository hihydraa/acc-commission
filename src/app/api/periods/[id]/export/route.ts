import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildCommissionWorkbook, type ExportTransactionRow } from "@/lib/excelExport";
import type { CommissionConfig } from "@/lib/calc/commissionEngine";
import type { TeamSplitConfig } from "@/lib/calc/teamSplit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    return await handleGet(request, context);
  } catch (err) {
    console.error("export route failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
      { status: 500 }
    );
  }
}

async function handleGet(_request: Request, { params }: { params: { id: string } }) {
  const periodId = params.id;
  const db = createServiceRoleClient();

  const { data: period } = await db.from("periods").select("*").eq("id", periodId).single();
  const { data: transactions } = await db.from("transactions").select("*").eq("period_id", periodId);
  const { data: departments } = await db.from("departments").select("*");
  const { data: configRows } = await db.from("commission_config").select("*");
  const { data: arRows } = await db.from("ar_outstanding").select("base_doc_no, outstanding").eq("period_id", periodId);
  const arOutstandingByBaseDocNo = new Map((arRows ?? []).map((a) => [a.base_doc_no, a.outstanding]));

  if (!period) return NextResponse.json({ error: "period not found" }, { status: 404 });

  // avoid the FK-embedding select syntax (transactions!inner(...)) — our
  // hand-written Database type doesn't carry relationship metadata for it —
  // and just join manually via the transaction ids already fetched above.
  const transactionIds = (transactions ?? []).map((t) => t.id);
  const adjustmentsRes =
    transactionIds.length > 0
      ? await db.from("adjustments").select("*").in("transaction_id", transactionIds)
      : null;
  const adjustments = adjustmentsRes?.data ?? [];

  const customerCodes = [...new Set((transactions ?? []).map((t) => t.customer_code).filter(Boolean) as string[])];
  const { data: customers } =
    customerCodes.length > 0
      ? await db.from("customers").select("code, name, salesperson").in("code", customerCodes)
      : { data: [] as { code: string; name: string | null; salesperson: string | null }[] };
  const customerByCode = new Map((customers ?? []).map((c) => [c.code, c]));

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
  const teamSplit = (configMap.get("team_split") as TeamSplitConfig) ?? {
    manager: 0.1,
    sales: 0.6,
    admin: 0.2,
    central: 0.1,
  };

  const usedDeptCodes = new Set((transactions ?? []).map((t) => t.department_code));
  const departmentMeta = (departments ?? [])
    .filter((d) => usedDeptCodes.has(d.code))
    .map((d) => ({ code: d.code, label: d.label }));

  const rows: ExportTransactionRow[] = (transactions ?? []).map((t) => {
    const customer = t.customer_code ? customerByCode.get(t.customer_code) : undefined;
    return {
      departmentCode: t.department_code,
      docNo: t.doc_no,
      docDate: t.doc_date,
      customerCode: t.customer_code,
      customerName: customer?.name ?? null,
      productCode: t.product_code,
      qty: Number(t.qty),
      saleValue: Number(t.sale_value),
      cost: Number(t.cost),
      saleType: t.sale_type,
      distanceKm: t.distance_km,
      isOneWay: t.is_one_way,
      freightRate: t.freight_rate,
      commission: t.commission,
      isEligible: t.is_eligible,
      blockedReason: t.blocked_reason,
      flags: (t.flags as string[]) ?? [],
      outstandingAmount: t.outstanding_amount,
      // reference-only figure from the AR report itself (spec §4.5 /
      // marketing-commission-calc SKILL "หักหนี้ค้างชำระ" sheet) — NOT what
      // gets deducted (outstandingAmount, the accounting-entered figure, is)
      arOutstandingReference: arOutstandingByBaseDocNo.get(t.base_doc_no) ?? null,
      salesperson: customer?.salesperson ?? null,
    };
  });

  const notes = (adjustments ?? []).map((a) => ({
    message: `${a.field}: ${a.old_value ?? ""} -> ${a.new_value ?? ""}${a.reason ? ` (${a.reason})` : ""}`,
    actor: a.actor,
    createdAt: a.created_at,
  }));

  const buffer = await buildCommissionWorkbook({
    period: { year: period.year, month: period.month, branch: period.branch },
    departments: departmentMeta,
    rows,
    config: { thresholds, ratePerLiter, penaltyNegativeQEnabled, teamSplit },
    notes,
  });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="commission-${period.year}-${period.month}.xlsx"`,
    },
  });
}
