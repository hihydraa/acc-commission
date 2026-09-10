"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database, SaleType } from "@/lib/supabase/types";
import { useActorName } from "@/components/useActorName";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

export function ReviewTable({ periodId, rows }: { periodId: string; rows: Transaction[] }) {
  const router = useRouter();
  const [distanceInputs, setDistanceInputs] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actorName, setActorName] = useActorName();

  async function logAdjustment(transactionId: string, field: string, oldValue: string, newValue: string) {
    const supabase = createClient();
    await supabase.from("adjustments").insert({
      transaction_id: transactionId,
      field,
      old_value: oldValue,
      new_value: newValue,
      actor: actorName.trim() || "unknown",
    });
  }

  async function saveDistance(tx: Transaction) {
    if (!tx.customer_code) return;
    const value = distanceInputs[tx.id];
    if (!value) return;
    setBusyId(tx.id);
    const supabase = createClient();
    await supabase.from("customers").update({ distance_km: parseFloat(value) }).eq("code", tx.customer_code);
    await logAdjustment(tx.id, "customers.distance_km", "", value);
    setBusyId(null);
    router.refresh();
  }

  async function toggleOneWay(tx: Transaction) {
    setBusyId(tx.id);
    const supabase = createClient();
    const next = !tx.is_one_way;
    await supabase.from("transactions").update({ is_one_way: next }).eq("id", tx.id);
    await logAdjustment(tx.id, "is_one_way", String(tx.is_one_way), String(next));
    setBusyId(null);
    router.refresh();
  }

  async function changeSaleType(tx: Transaction, saleType: SaleType) {
    setBusyId(tx.id);
    const supabase = createClient();
    await supabase.from("transactions").update({ sale_type: saleType }).eq("id", tx.id);
    await logAdjustment(tx.id, "sale_type", tx.sale_type ?? "", saleType);
    setBusyId(null);
    router.refresh();
  }

  async function recalculate() {
    setBusyId("recalculate");
    await fetch(`/api/periods/${periodId}/calculate`, { method: "POST" });
    setBusyId(null);
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">ไม่มีแถวที่ต้อง Review 🎉</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label className="text-muted-foreground">ชื่อผู้แก้ไข (บันทึกลง audit log):</label>
        <input
          value={actorName}
          onChange={(e) => setActorName(e.target.value)}
          placeholder="เช่น บัญชีสาขา"
          className="rounded-md border border-border px-2 py-1 text-sm"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted">
          <tr className="text-left">
            <th className="px-3 py-2">เอกสาร</th>
            <th className="px-3 py-2">ลูกค้า</th>
            <th className="px-3 py-2">ปริมาณ</th>
            <th className="px-3 py-2">ประเภท</th>
            <th className="px-3 py-2">1สาย1สู้</th>
            <th className="px-3 py-2">สาเหตุ / Flag</th>
            <th className="px-3 py-2">แก้ไข</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr key={tx.id} className="border-t border-border align-top">
              <td className="px-3 py-2">{tx.doc_no}</td>
              <td className="px-3 py-2">{tx.customer_code}</td>
              <td className="px-3 py-2">{Number(tx.qty).toLocaleString()}</td>
              <td className="px-3 py-2">
                <select
                  value={tx.sale_type ?? ""}
                  disabled={busyId === tx.id}
                  onChange={(e) => changeSaleType(tx, e.target.value as SaleType)}
                  className="rounded-md border border-border px-1 py-0.5 text-xs"
                >
                  <option value="cash">ขายสด</option>
                  <option value="credit">ขายเชื่อ</option>
                  <option value="overdue">ลูกหนี้ค้างชำระ</option>
                </select>
              </td>
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={tx.is_one_way}
                  disabled={busyId === tx.id}
                  onChange={() => toggleOneWay(tx)}
                />
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {tx.blocked_reason && <p className="text-destructive">{tx.blocked_reason}</p>}
                {(tx.flags as string[] | null)?.map((f, i) => <p key={i}>{f}</p>)}
              </td>
              <td className="px-3 py-2">
                {tx.blocked_reason?.includes("ระยะทาง") && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      placeholder="กม."
                      value={distanceInputs[tx.id] ?? ""}
                      onChange={(e) => setDistanceInputs((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                      className="w-16 rounded-md border border-border px-1 py-0.5 text-xs"
                    />
                    <button
                      onClick={() => saveDistance(tx)}
                      disabled={busyId === tx.id}
                      className="rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                    >
                      บันทึก
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border p-3">
        <button
          onClick={recalculate}
          disabled={busyId !== null}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busyId === "recalculate" ? "กำลังคำนวณ..." : "คำนวณใหม่หลังแก้ไข"}
        </button>
      </div>
      </div>
    </div>
  );
}
