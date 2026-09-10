"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { DEFAULT_TEAM_SPLIT, type TeamSplitConfig } from "@/lib/calc/teamSplit";

type ConfigRow = Database["public"]["Tables"]["commission_config"]["Row"];

interface Thresholds {
  cash: number;
  credit: number;
  overdue: number;
}

export function ConfigForm({ initialConfig }: { initialConfig: ConfigRow[] }) {
  const map = new Map<string, unknown>(initialConfig.map((c) => [c.key, c.value]));
  const [thresholds, setThresholds] = useState<Thresholds>(
    (map.get("thresholds") as Thresholds | undefined) ?? { cash: 0.2, credit: 0.3, overdue: 0.6 }
  );
  const [ratePerLiter, setRatePerLiter] = useState<number>(Number(map.get("rate_per_liter") ?? 0.03));
  const [penaltyEnabled, setPenaltyEnabled] = useState<boolean>(
    Boolean((map.get("penalty_negative_q") as { enabled?: boolean } | undefined)?.enabled ?? true)
  );
  const [teamSplit, setTeamSplit] = useState<TeamSplitConfig>(
    (map.get("team_split") as TeamSplitConfig | undefined) ?? DEFAULT_TEAM_SPLIT
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const asJson = (v: unknown) => v as Database["public"]["Tables"]["commission_config"]["Row"]["value"];
    await Promise.all([
      supabase.from("commission_config").upsert({ key: "thresholds", value: asJson(thresholds) }),
      supabase.from("commission_config").upsert({ key: "rate_per_liter", value: asJson(ratePerLiter) }),
      supabase
        .from("commission_config")
        .upsert({ key: "penalty_negative_q", value: asJson({ enabled: penaltyEnabled }) }),
      supabase.from("commission_config").upsert({ key: "team_split", value: asJson(teamSplit) }),
    ]);
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="space-y-6 rounded-lg border border-border p-4">
      <div>
        <h3 className="mb-2 text-sm font-medium">เกณฑ์กำไรต่อลิตร (Q) ที่จะได้ค่าคอม</h3>
        <div className="flex gap-4">
          <label className="text-sm">
            ขายสด{" "}
            <input
              type="number"
              step="0.01"
              value={thresholds.cash}
              onChange={(e) => setThresholds({ ...thresholds, cash: parseFloat(e.target.value) })}
              className="w-20 rounded-md border border-border px-1 py-0.5"
            />
          </label>
          <label className="text-sm">
            ขายเชื่อ{" "}
            <input
              type="number"
              step="0.01"
              value={thresholds.credit}
              onChange={(e) => setThresholds({ ...thresholds, credit: parseFloat(e.target.value) })}
              className="w-20 rounded-md border border-border px-1 py-0.5"
            />
          </label>
          <label className="text-sm">
            ลูกหนี้ค้างชำระ{" "}
            <input
              type="number"
              step="0.01"
              value={thresholds.overdue}
              onChange={(e) => setThresholds({ ...thresholds, overdue: parseFloat(e.target.value) })}
              className="w-20 rounded-md border border-border px-1 py-0.5"
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">อัตราค่าคอม (บาท/ลิตร)</h3>
        <input
          type="number"
          step="0.001"
          value={ratePerLiter}
          onChange={(e) => setRatePerLiter(parseFloat(e.target.value))}
          className="w-24 rounded-md border border-border px-1 py-0.5 text-sm"
        />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={penaltyEnabled} onChange={(e) => setPenaltyEnabled(e.target.checked)} />
          หัก 3 สต./ลิตร เมื่อ Q ติดลบ (penalty)
        </label>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">เปอร์เซ็นต์แบ่งทีม (สาขา{"สามทอง/โลจิสติกส์"})</h3>
        <div className="flex gap-4">
          <label className="text-sm">
            ผู้จัดการ{" "}
            <input
              type="number"
              step="0.01"
              value={teamSplit.manager}
              onChange={(e) => setTeamSplit({ ...teamSplit, manager: parseFloat(e.target.value) })}
              className="w-20 rounded-md border border-border px-1 py-0.5"
            />
          </label>
          <label className="text-sm">
            ADMIN{" "}
            <input
              type="number"
              step="0.01"
              value={teamSplit.admin}
              onChange={(e) => setTeamSplit({ ...teamSplit, admin: parseFloat(e.target.value) })}
              className="w-20 rounded-md border border-border px-1 py-0.5"
            />
          </label>
          <label className="text-sm">
            ส่วนกลาง{" "}
            <input
              type="number"
              step="0.01"
              value={teamSplit.central}
              onChange={(e) => setTeamSplit({ ...teamSplit, central: parseFloat(e.target.value) })}
              className="w-20 rounded-md border border-border px-1 py-0.5"
            />
          </label>
          <span className="self-center text-xs text-muted-foreground">การตลาด = ส่วนที่เหลือ (รับเศษ)</span>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
      </button>
      {saved && <span className="ml-3 text-sm text-green-600">บันทึกแล้ว</span>}
    </div>
  );
}
