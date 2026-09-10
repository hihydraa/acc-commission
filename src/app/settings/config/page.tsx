import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { ConfigForm } from "./ConfigForm";
import { FreightTierTable } from "./FreightTierTable";

export default async function ConfigSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: configRows }, { data: freightTiers }, { data: departments }] = await Promise.all([
    supabase.from("commission_config").select("*"),
    supabase.from("freight_tiers").select("*").order("min_km"),
    supabase.from("departments").select("*").order("code"),
  ]);

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-10">
        <div>
          <h1 className="mb-1 text-xl font-semibold">ตั้งค่าระบบ</h1>
          <p className="mb-6 text-sm text-muted-foreground">เกณฑ์ค่าคอม / เปอร์เซ็นต์แบ่งทีม (spec §4.3, §4.6, §6)</p>
          <ConfigForm initialConfig={configRows ?? []} />
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">ตารางค่าขนส่งตามระยะทาง</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            แก้ไขอัตราได้ที่นี่ — การเพิ่ม/ลบช่วงระยะทางให้ทำผ่าน Supabase dashboard โดยตรง
          </p>
          <FreightTierTable initialTiers={freightTiers ?? []} />
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">แผนก/รถ</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="px-3 py-2">รหัส</th>
                  <th className="px-3 py-2">ชื่อ</th>
                  <th className="px-3 py-2">เกณฑ์ขั้นต่ำ (ลิตร)</th>
                  <th className="px-3 py-2">ค่าขนส่งคงที่</th>
                  <th className="px-3 py-2">Prefix เอกสาร</th>
                </tr>
              </thead>
              <tbody>
                {(departments ?? []).map((d) => (
                  <tr key={d.code} className="border-t border-border">
                    <td className="px-3 py-2">{d.code}</td>
                    <td className="px-3 py-2">{d.label}</td>
                    <td className="px-3 py-2">{d.min_liters}</td>
                    <td className="px-3 py-2">{d.fixed_freight ?? "ตามตารางระยะทาง"}</td>
                    <td className="px-3 py-2">{d.doc_prefixes.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
