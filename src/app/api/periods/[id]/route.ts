import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Deletes an entire period. `source_files`, `transactions`, `ar_outstanding`
 * all reference periods(id) with `on delete cascade` (spec §6 schema), so
 * deleting the period row alone cleans up everything under it; adjustments
 * cascade further from transactions.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const db = createServiceRoleClient();
    const { error } = await db.from("periods").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete period failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
      { status: 500 }
    );
  }
}
