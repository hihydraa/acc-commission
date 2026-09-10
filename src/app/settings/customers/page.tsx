import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { CustomerTable } from "./CustomerTable";

export default async function CustomersSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: customers } = await supabase.from("customers").select("*").order("code");

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">ตั้งค่าลูกค้า / ระยะทาง / เซลล์</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          master data นี้ต้องเก็บใน DB ไม่ hardcode (spec §2.1, §4.1) — เพิ่มลูกค้าใหม่หรือแก้ไขได้ที่นี่
        </p>
        <CustomerTable initialCustomers={customers ?? []} />
      </main>
    </div>
  );
}
