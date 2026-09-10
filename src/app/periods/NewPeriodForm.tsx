"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NewPeriodForm() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear() + 543);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [branch, setBranch] = useState("สามทอง/โลจิสติกส์");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("periods")
      .insert({ year, month, branch, status: "draft" })
      .select()
      .single();
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/periods/${data.id}/upload`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">ปี (พ.ศ.)</label>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="w-28 rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">เดือน</label>
        <select
          value={month}
          onChange={(e) => setMonth(parseInt(e.target.value, 10))}
          className="w-24 rounded-md border border-border px-2 py-1.5 text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">สาขา</label>
        <input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="w-52 rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "กำลังสร้าง..." : "สร้างรอบ"}
      </button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
