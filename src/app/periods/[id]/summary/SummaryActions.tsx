"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SummaryActions({
  periodId,
  status,
  canClose,
}: {
  periodId: string;
  status: string;
  canClose: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [closedBy, setClosedBy] = useState("");

  async function handleClose() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/periods/${periodId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closedBy }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) {
      setMessage(json.message ?? json.error ?? "ปิดรอบไม่สำเร็จ");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={`/api/periods/${periodId}/export`}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        Export Excel
      </a>
      {status !== "closed" && (
        <>
          <input
            value={closedBy}
            onChange={(e) => setClosedBy(e.target.value)}
            placeholder="ชื่อผู้ปิดรอบ"
            className="rounded-md border border-border px-2 py-2 text-sm"
          />
          <button
            onClick={handleClose}
            disabled={busy || !canClose}
            title={!canClose ? "ยังมีแถวรอ Review อยู่" : undefined}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "กำลังปิดรอบ..." : "ปิดรอบ"}
          </button>
        </>
      )}
      {status === "closed" && <span className="text-sm text-green-600">ปิดรอบแล้ว</span>}
      {message && <span className="text-sm text-destructive">{message}</span>}
    </div>
  );
}
