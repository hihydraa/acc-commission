import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { UploadPanel } from "./UploadPanel";
import { notFound } from "next/navigation";

export default async function UploadPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: period } = await supabase.from("periods").select("*").eq("id", params.id).single();
  if (!period) notFound();

  const { data: sourceFiles } = await supabase
    .from("source_files")
    .select("*")
    .eq("period_id", params.id)
    .order("uploaded_at", { ascending: false });

  const { count: txCount } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("period_id", params.id);

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">
          อัปโหลดไฟล์ — รอบ {period.month}/{period.year} ({period.branch})
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          ลากไฟล์ PDF รายงานขายทุกคัน + รายงานลูกหนี้ + master ระยะทาง (spec §1-§2)
        </p>

        <UploadPanel periodId={params.id} initialSourceFiles={sourceFiles ?? []} transactionCount={txCount ?? 0} />
      </main>
    </div>
  );
}
