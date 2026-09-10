"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Customer = Database["public"]["Tables"]["customers"]["Row"];

function EditableRow({ customer }: { customer: Customer }) {
  const [row, setRow] = useState(customer);
  const [saving, setSaving] = useState(false);

  async function save(patch: Partial<Customer>) {
    setSaving(true);
    const next = { ...row, ...patch };
    setRow(next);
    const supabase = createClient();
    await supabase
      .from("customers")
      .update({
        name: next.name,
        distance_km: next.distance_km,
        salesperson: next.salesperson,
        is_excluded: next.is_excluded,
        note: next.note,
      })
      .eq("code", customer.code);
    setSaving(false);
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
      <td className="px-3 py-2">
        <input
          defaultValue={row.name ?? ""}
          onBlur={(e) => save({ name: e.target.value })}
          className="w-40 rounded-md border border-border px-1 py-0.5 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          defaultValue={row.distance_km ?? ""}
          onBlur={(e) => save({ distance_km: e.target.value === "" ? null : parseFloat(e.target.value) })}
          className="w-20 rounded-md border border-border px-1 py-0.5 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <input
          defaultValue={row.salesperson ?? ""}
          onBlur={(e) => save({ salesperson: e.target.value })}
          className="w-24 rounded-md border border-border px-1 py-0.5 text-xs"
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={row.is_excluded} onChange={(e) => save({ is_excluded: e.target.checked })} />
      </td>
      <td className="px-3 py-2">
        <input
          defaultValue={row.note ?? ""}
          onBlur={(e) => save({ note: e.target.value })}
          className="w-40 rounded-md border border-border px-1 py-0.5 text-xs"
        />
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{saving ? "กำลังบันทึก..." : ""}</td>
    </tr>
  );
}

export function CustomerTable({ initialCustomers }: { initialCustomers: Customer[] }) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [newCode, setNewCode] = useState("");

  async function addCustomer() {
    if (!newCode.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({ code: newCode.trim().toUpperCase() })
      .select()
      .single();
    if (!error && data) {
      setCustomers((prev) => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)));
      setNewCode("");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">เพิ่มรหัสลูกค้าใหม่</label>
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="เช่น KCL660099"
            className="rounded-md border border-border px-2 py-1.5 text-sm"
          />
        </div>
        <button onClick={addCustomer} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          เพิ่ม
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted">
            <tr className="text-left">
              <th className="px-3 py-2">รหัส</th>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">ระยะทาง (กม.)</th>
              <th className="px-3 py-2">เซลล์</th>
              <th className="px-3 py-2">ยกเว้น (บัตรเติมน้ำมัน)</th>
              <th className="px-3 py-2">หมายเหตุ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <EditableRow key={c.code} customer={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
