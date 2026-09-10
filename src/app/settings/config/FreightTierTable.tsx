"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type FreightTier = Database["public"]["Tables"]["freight_tiers"]["Row"];

export function FreightTierTable({ initialTiers }: { initialTiers: FreightTier[] }) {
  const [tiers, setTiers] = useState(initialTiers);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function saveRate(id: string, rate: number) {
    setSavingId(id);
    const supabase = createClient();
    await supabase.from("freight_tiers").update({ rate }).eq("id", id);
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, rate } : t)));
    setSavingId(null);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full max-w-md text-sm">
        <thead className="bg-muted">
          <tr className="text-left">
            <th className="px-3 py-2">ระยะทาง (กม.)</th>
            <th className="px-3 py-2">บาท/ลิตร</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td className="px-3 py-2">
                {t.min_km}–{t.max_km}
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  step="0.01"
                  defaultValue={t.rate}
                  onBlur={(e) => saveRate(t.id, parseFloat(e.target.value))}
                  disabled={savingId === t.id}
                  className="w-24 rounded-md border border-border px-1 py-0.5"
                />
              </td>
            </tr>
          ))}
          <tr className="border-t border-border">
            <td className="px-3 py-2">&gt; 209</td>
            <td className="px-3 py-2 text-destructive">BLOCK (บังคับ ไม่ให้แก้)</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
