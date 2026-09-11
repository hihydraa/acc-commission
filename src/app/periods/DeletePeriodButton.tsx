"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePeriodButton({ periodId, label }: { periodId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm(`ลบรอบ ${label} ทิ้งถาวร? ข้อมูลไฟล์/รายการ/การคำนวณทั้งหมดในรอบนี้จะหายไปด้วย`)) return;
    setBusy(true);
    const res = await fetch(`/api/periods/${periodId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(`ลบไม่สำเร็จ: ${json.error ?? res.statusText}`);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="text-sm text-destructive hover:underline disabled:opacity-50"
    >
      {busy ? "กำลังลบ..." : "ลบ"}
    </button>
  );
}
