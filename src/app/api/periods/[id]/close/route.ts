import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Closes a period (spec §1 step [5] CLOSE). Refuses to close while any row
 * is still blocked pending a Review decision (missing distance / >209 km /
 * unknown department) — those must be resolved (or the row explicitly
 * accepted via a manual adjustment) first. Once closed, transactions are
 * conceptually locked; this route doesn't add a DB-level write lock beyond
 * status='closed' — enforce "no editing a closed period" in the UI and, if
 * this goes to real production use, add a trigger that rejects writes to
 * transactions whose period is closed.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const periodId = params.id;
  const db = createServiceRoleClient();

  const { data: blocked } = await db
    .from("transactions")
    .select("id, doc_no, blocked_reason")
    .eq("period_id", periodId)
    .not("blocked_reason", "is", null);

  if (blocked && blocked.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: `ยังปิดรอบไม่ได้ — มี ${blocked.length} แถวรอ Review (ระยะทาง/แผนก)`,
        blocked,
      },
      { status: 409 }
    );
  }

  let closedBy = "unknown";
  try {
    const body = await request.json();
    if (typeof body?.closedBy === "string" && body.closedBy.trim()) closedBy = body.closedBy.trim();
  } catch {
    // no JSON body sent — fine, keep the default
  }

  const { error } = await db
    .from("periods")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: closedBy })
    .eq("id", periodId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
