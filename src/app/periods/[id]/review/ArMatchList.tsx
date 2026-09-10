"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import type { ArMatchResult } from "@/lib/arMatch";
import { useActorName } from "@/components/useActorName";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

export function ArMatchList({
  periodId: _periodId,
  matches,
  transactions,
}: {
  periodId: string;
  matches: ArMatchResult[];
  transactions: Transaction[];
}) {
  const router = useRouter();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actorName, setActorName] = useActorName();

  async function saveDeduction(match: ArMatchResult) {
    const value = inputs[match.baseDocNo];
    if (value === undefined) return;
    setBusy(match.baseDocNo);
    const supabase = createClient();
    const relatedTx = transactions.filter((t) => t.base_doc_no === match.baseDocNo && t.is_eligible);
    for (const tx of relatedTx) {
      await supabase.from("transactions").update({ outstanding_amount: parseFloat(value) }).eq("id", tx.id);
      await supabase.from("adjustments").insert({
        transaction_id: tx.id,
        field: "outstanding_amount",
        old_value: String(tx.outstanding_amount ?? 0),
        new_value: value,
        reason: `หักลูกหนี้ค้างชำระบิล ${match.baseDocNo}`,
        actor: actorName.trim() || "unknown",
      });
    }
    setBusy(null);
    router.refresh();
  }

  if (matches.length === 0) {
    return <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">ไม่มีบิลค้างชำระที่ต้อง flag ในเดือนนี้</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="bg-muted">
          <tr className="text-left">
            <th className="px-3 py-2">เลขที่เอกสาร</th>
            <th className="px-3 py-2">ลูกค้า</th>
            <th className="px-3 py-2">วันที่บิล</th>
            <th className="px-3 py-2">ยอดค้าง</th>
            <th className="px-3 py-2">ยอดหัก (กรอกเอง)</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.baseDocNo} className="border-t border-border">
              <td className="px-3 py-2">{m.baseDocNo}</td>
              <td className="px-3 py-2">{m.customerNameRaw}</td>
              <td className="px-3 py-2">{m.billDate}</td>
              <td className="px-3 py-2">{m.outstanding.toLocaleString()}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="0"
                    value={inputs[m.baseDocNo] ?? ""}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [m.baseDocNo]: e.target.value }))}
                    className="w-24 rounded-md border border-border px-1 py-0.5 text-xs"
                  />
                  <button
                    onClick={() => saveDeduction(m)}
                    disabled={busy === m.baseDocNo}
                    className="rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                  >
                    บันทึก
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
