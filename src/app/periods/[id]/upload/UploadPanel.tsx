"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/lib/supabase/types";

type SourceFile = Database["public"]["Tables"]["source_files"]["Row"];

interface Props {
  periodId: string;
  initialSourceFiles: SourceFile[];
  transactionCount: number;
}

const KIND_LABEL: Record<string, string> = {
  sales: "รายงานขายรายรถ (PDF)",
  ar: "รายงานลูกหนี้คงค้าง (PDF)",
  master: "ไฟล์ระยะทาง+เซลล์ (PDF/Excel)",
};

export function UploadPanel({ periodId, initialSourceFiles, transactionCount }: Props) {
  const router = useRouter();
  const [sourceFiles, setSourceFiles] = useState(initialSourceFiles);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [calcResult, setCalcResult] = useState<Record<string, unknown> | null>(null);

  async function handleUpload(kind: "sales" | "ar" | "master", file: File) {
    setBusy(kind);
    setLastResult(null);
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    const res = await fetch(`/api/periods/${periodId}/parse`, { method: "POST", body: form });
    const json = await res.json();
    setLastResult({ kind, filename: file.name, ...json });
    setBusy(null);
    router.refresh();
  }

  async function handleCalculate() {
    setBusy("calculate");
    const res = await fetch(`/api/periods/${periodId}/calculate`, { method: "POST" });
    const json = await res.json();
    setCalcResult(json);
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      {(["sales", "ar", "master"] as const).map((kind) => (
        <div key={kind} className="rounded-lg border border-border p-4">
          <label className="mb-2 block text-sm font-medium">{KIND_LABEL[kind]}</label>
          <input
            type="file"
            accept={kind === "master" ? ".pdf,.xlsx" : ".pdf"}
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(kind, file);
              e.target.value = "";
            }}
            className="block w-full text-sm"
          />
          {busy === kind && <p className="mt-2 text-sm text-muted-foreground">กำลังประมวลผล...</p>}
        </div>
      ))}

      {lastResult && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            lastResult.ok ? "border-green-300 bg-green-50" : "border-destructive bg-red-50"
          }`}
        >
          <p className="font-medium">
            {String(lastResult.filename)} ({String(lastResult.kind)}) —{" "}
            {lastResult.ok ? "สำเร็จ" : "ไม่ผ่าน checksum / มีปัญหา"}
          </p>
          {Array.isArray(lastResult.issues) && lastResult.issues.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {(lastResult.issues as { message: string }[]).map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          )}
          {Array.isArray(lastResult.warnings) && lastResult.warnings.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">คำเตือน ({(lastResult.warnings as string[]).length})</summary>
              <ul className="mt-1 list-disc pl-5">
                {(lastResult.warnings as string[]).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {"error" in lastResult && <p className="text-destructive">{String(lastResult.error)}</p>}
        </div>
      )}

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">ไฟล์ที่อัปโหลดแล้ว ({sourceFiles.length})</h2>
        <ul className="space-y-1 text-sm">
          {sourceFiles.map((f) => (
            <li key={f.id} className="flex items-center justify-between">
              <span>
                {KIND_LABEL[f.kind] ?? f.kind} — {f.filename} {f.department_code ? `(${f.department_code})` : ""}
              </span>
              <span className={f.checksum_ok ? "text-green-600" : "text-destructive"}>
                {f.checksum_ok === null ? "-" : f.checksum_ok ? "checksum ผ่าน" : "checksum ไม่ผ่าน"}
              </span>
            </li>
          ))}
          {sourceFiles.length === 0 && <li className="text-muted-foreground">ยังไม่มีไฟล์</li>}
        </ul>
      </div>

      <div className="flex items-center gap-4 rounded-lg border border-border p-4">
        <div className="text-sm">
          รายการที่ parse แล้ว: <span className="font-medium">{transactionCount}</span> แถว
        </div>
        <button
          onClick={handleCalculate}
          disabled={busy !== null || transactionCount === 0}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy === "calculate" ? "กำลังคำนวณ..." : "คำนวณค่าคอม"}
        </button>
        {calcResult && (
          <span className="text-sm text-muted-foreground">
            {calcResult.ok ? `คำนวณแล้ว ${calcResult.calculated} แถว` : String(calcResult.message ?? calcResult.error)}
          </span>
        )}
      </div>

      <a href={`/periods/${periodId}/review`} className="inline-block text-sm text-primary hover:underline">
        ไปหน้า Review →
      </a>
    </div>
  );
}
