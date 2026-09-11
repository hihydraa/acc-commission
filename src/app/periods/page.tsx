import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { NewPeriodForm } from "./NewPeriodForm";
import { DeletePeriodButton } from "./DeletePeriodButton";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  review: "รอตรวจสอบ",
  closed: "ปิดรอบแล้ว",
};

export default async function PeriodsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: periods } = await supabase
    .from("periods")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">ประวัติรอบการคำนวณ</h1>

        <div className="mb-8 rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-medium">เริ่มรอบใหม่</h2>
          <NewPeriodForm />
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">รอบ</th>
              <th className="py-2 pr-4">สาขา</th>
              <th className="py-2 pr-4">สถานะ</th>
              <th className="py-2 pr-4">ปิดรอบเมื่อ</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {(periods ?? []).map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  {p.month}/{p.year}
                </td>
                <td className="py-2 pr-4">{p.branch}</td>
                <td className="py-2 pr-4">{STATUS_LABEL[p.status] ?? p.status}</td>
                <td className="py-2 pr-4">{p.closed_at ? new Date(p.closed_at).toLocaleString("th-TH") : "-"}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-3">
                    <Link href={`/periods/${p.id}/upload`} className="text-primary hover:underline">
                      เปิด
                    </Link>
                    <DeletePeriodButton periodId={p.id} label={`${p.month}/${p.year} (${p.branch})`} />
                  </div>
                </td>
              </tr>
            ))}
            {(!periods || periods.length === 0) && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  ยังไม่มีรอบการคำนวณ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </div>
  );
}
