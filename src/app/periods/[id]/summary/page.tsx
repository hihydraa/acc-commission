import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { roundHalfUp2 } from "@/lib/calc/rounding";
import { splitTeam, DEFAULT_TEAM_SPLIT, type TeamSplitConfig } from "@/lib/calc/teamSplit";
import { SummaryActions } from "./SummaryActions";

export default async function SummaryPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: period } = await supabase.from("periods").select("*").eq("id", params.id).single();
  if (!period) notFound();

  const { data: transactions } = await supabase.from("transactions").select("*").eq("period_id", params.id);
  const { data: configRow } = await supabase.from("commission_config").select("*").eq("key", "team_split").single();
  const teamSplit = (configRow?.value as unknown as TeamSplitConfig) ?? DEFAULT_TEAM_SPLIT;

  const customerCodes = [...new Set((transactions ?? []).map((t) => t.customer_code).filter(Boolean) as string[])];
  const { data: customers } =
    customerCodes.length > 0
      ? await supabase.from("customers").select("code, salesperson").in("code", customerCodes)
      : { data: [] as { code: string; salesperson: string | null }[] };
  const salespersonByCode = new Map((customers ?? []).map((c) => [c.code, c.salesperson]));

  interface Agg {
    salesperson: string;
    qty: number;
    commissionRaw: number;
    outstanding: number;
  }
  const bySalesperson = new Map<string, Agg>();
  const blockedCount = (transactions ?? []).filter((t) => t.blocked_reason).length;

  for (const t of transactions ?? []) {
    if (!t.is_eligible || t.commission === null) continue;
    const salesperson = (t.customer_code && salespersonByCode.get(t.customer_code)) || "(ไม่ระบุเซลล์)";
    const agg = bySalesperson.get(salesperson) ?? { salesperson, qty: 0, commissionRaw: 0, outstanding: 0 };
    agg.qty += Number(t.qty);
    agg.commissionRaw += Number(t.commission);
    agg.outstanding += Number(t.outstanding_amount ?? 0);
    bySalesperson.set(salesperson, agg);
  }

  const summaryRows = [...bySalesperson.values()].map((agg) => ({
    ...agg,
    net: roundHalfUp2(agg.commissionRaw),
  }));

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">
          สรุปค่าคอม — รอบ {period.month}/{period.year} ({period.branch})
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          สถานะ: {period.status} {blockedCount > 0 && `— ⚠️ ยังมี ${blockedCount} แถวรอ Review ก่อนปิดรอบได้`}
        </p>

        <div className="mb-8 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="px-3 py-2">เซลล์</th>
                <th className="px-3 py-2">ลิตรรวม</th>
                <th className="px-3 py-2">ค่าคอมรวม</th>
                <th className="px-3 py-2">ผู้จัดการ</th>
                <th className="px-3 py-2">ADMIN</th>
                <th className="px-3 py-2">ส่วนกลาง</th>
                <th className="px-3 py-2">การตลาด</th>
                <th className="px-3 py-2">หนี้ค้างที่ต้องพิจารณา</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => {
                const split = splitTeam(row.net, teamSplit);
                return (
                  <tr key={row.salesperson} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{row.salesperson}</td>
                    <td className="px-3 py-2">{row.qty.toLocaleString()}</td>
                    <td className="px-3 py-2">{split.net.toLocaleString()}</td>
                    <td className="px-3 py-2">{split.manager.toLocaleString()}</td>
                    <td className="px-3 py-2">{split.admin.toLocaleString()}</td>
                    <td className="px-3 py-2">{split.central.toLocaleString()}</td>
                    <td className="px-3 py-2">{split.sales.toLocaleString()}</td>
                    <td className="px-3 py-2">{roundHalfUp2(row.outstanding).toLocaleString()}</td>
                  </tr>
                );
              })}
              {summaryRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    ยังไม่มีรายการที่เข้าเกณฑ์ค่าคอม
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <SummaryActions periodId={params.id} status={period.status} canClose={blockedCount === 0} />
      </main>
    </div>
  );
}
