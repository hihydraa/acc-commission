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
  sales: "รายงานขายรายรถ (PDF) — เลือกได้หลายไฟล์พร้อมกัน 1 ไฟล์ต่อรถ 1 คัน",
  ar: "รายงานลูกหนี้คงค้าง (PDF)",
  master: "ไฟล์ระยะทาง+เซลล์ (PDF/Excel)",
};

// Vercel serverless functions time out well before a slow parse of a large,
// real multi-page PDF finishes if left unbounded — give it a generous
// client-side ceiling so a hung request fails loudly instead of leaving the
// UI stuck on "กำลังประมวลผล..." forever.
const UPLOAD_TIMEOUT_MS = 55_000;

interface UploadResult {
  filename: string;
  kind: string;
  [key: string]: unknown;
}

export function UploadPanel({ periodId, initialSourceFiles, transactionCount }: Props) {
  const router = useRouter();
  const [sourceFiles, setSourceFiles] = useState(initialSourceFiles);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [calcResult, setCalcResult] = useState<Record<string, unknown> | null>(null);

  async function uploadOne(kind: "sales" | "ar" | "master", file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/periods/${periodId}/parse`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        let message = `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          message = errJson.error ?? errJson.message ?? message;
        } catch {
          // response wasn't JSON — keep the generic status message
        }
        return { filename: file.name, kind, ok: false, error: message };
      }
      const json = await res.json();
      return { filename: file.name, kind, ...json };
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      return {
        filename: file.name,
        kind,
        ok: false,
        error: isAbort
          ? `หมดเวลาประมวลผล (เกิน ${UPLOAD_TIMEOUT_MS / 1000} วินาที) — ไฟล์อาจใหญ่/ซับซ้อนเกินไป หรือเซิร์ฟเวอร์มีปัญหา`
          : `เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handleFilesSelected(kind: "sales" | "ar" | "master", fileList: FileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setBusy(kind);
    setResults([]);
    // upload sequentially — parsing is CPU/IO heavy per file, and doing them
    // one at a time keeps error messages attributable to the right file.
    for (const file of files) {
      const result = await uploadOne(kind, file);
      setResults((prev) => [...prev, result]);
    }
    setBusy(null);
    router.refresh();
  }

  async function handleCalculate() {
    setBusy("calculate");
    try {
      const res = await fetch(`/api/periods/${periodId}/calculate`, { method: "POST" });
      const json = await res.json();
      setCalcResult(json);
    } catch (err) {
      setCalcResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {(["sales", "ar", "master"] as const).map((kind) => (
        <div key={kind} className="rounded-lg border border-border p-4">
          <label className="mb-2 block text-sm font-medium">{KIND_LABEL[kind]}</label>
          <input
            type="file"
            accept={kind === "master" ? ".pdf,.xlsx" : ".pdf"}
            multiple={kind === "sales"}
            disabled={busy !== null}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFilesSelected(kind, e.target.files);
              }
              e.target.value = "";
            }}
            className="block w-full text-sm"
          />
          {busy === kind && <p className="mt-2 text-sm text-muted-foreground">กำลังประมวลผล...</p>}
        </div>
      ))}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-4 text-sm ${
                result.ok ? "border-green-300 bg-green-50" : "border-destructive bg-red-50"
              }`}
            >
              <p className="font-medium">
                {result.filename} ({result.kind}) — {result.ok ? "สำเร็จ" : "ไม่ผ่าน checksum / มีปัญหา"}
              </p>
              {Array.isArray(result.issues) && result.issues.length > 0 && (
                <ul className="mt-2 list-disc pl-5">
                  {(result.issues as { message: string }[]).map((issue, i) => (
                    <li key={i}>{issue.message}</li>
                  ))}
                </ul>
              )}
              {Array.isArray(result.warnings) && result.warnings.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">
                    คำเตือน ({(result.warnings as string[]).length})
                  </summary>
                  <ul className="mt-1 list-disc pl-5">
                    {(result.warnings as string[]).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              {"error" in result && <p className="text-destructive">{String(result.error)}</p>}
            </div>
          ))}
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
