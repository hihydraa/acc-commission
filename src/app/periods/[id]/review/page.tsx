import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { matchOutstandingBills } from "@/lib/arMatch";
import { isoToThaiDate } from "@/lib/thaiDate";
import { ReviewTable } from "./ReviewTable";
import { ArMatchList } from "./ArMatchList";

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: period } = await supabase.from("periods").select("*").eq("id", params.id).single();
  if (!period) notFound();

  const { data: transactions } = await supabase.from("transactions").select("*").eq("period_id", params.id);
  const { data: arRows } = await supabase.from("ar_outstanding").select("*").eq("period_id", params.id);

  const all = transactions ?? [];
  const reviewRows = all.filter((t) => t.blocked_reason || (Array.isArray(t.flags) && t.flags.length > 0));

  const eligibleBaseDocNos = new Set(all.filter((t) => t.is_eligible).map((t) => t.base_doc_no));
  const arMatches = matchOutstandingBills(
    (arRows ?? []).map((r) => ({
      baseDocNo: r.base_doc_no,
      customerCode: r.customer_code,
      customerNameRaw: r.customer_name ?? r.customer_code ?? "",
      billDate: isoToThaiDate(r.bill_date), // round-trip ISO -> dd/mm/yy BE for arMatch.ts
      billAmount: r.bill_amount,
      paidAmount: r.paid_amount,
      outstanding: r.outstanding,
    })),
    eligibleBaseDocNos,
    { year: period.year, month: period.month }
  );

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">
          คิว Review — รอบ {period.month}/{period.year} ({period.branch})
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {reviewRows.length} แถวต้องตรวจสอบ จากทั้งหมด {all.length} แถว (spec §5)
        </p>

        <ReviewTable periodId={params.id} rows={reviewRows} />

        <h2 className="mb-2 mt-10 text-lg font-semibold">บิลค้างชำระที่ต้องพิจารณา (spec §4.5, §5.3)</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          ระบบ flag ไว้เท่านั้น ยอดหักเริ่มต้น = 0 — บัญชีต้องพิมพ์ยอดหักเอง (policy ปกติ 50%/100%)
        </p>
        <ArMatchList periodId={params.id} matches={arMatches} transactions={all} />

        <div className="mt-8">
          <a href={`/periods/${params.id}/summary`} className="text-sm text-primary hover:underline">
            ไปหน้าสรุป →
          </a>
        </div>
      </main>
    </div>
  );
}
