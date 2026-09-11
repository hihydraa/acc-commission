import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Deletes one uploaded file's record and the data it produced, so it can be
 * re-uploaded cleanly after a mistake (spec §1 UPLOAD step — there's no
 * "replace" flow, so without this a bad upload would just pile up
 * duplicate transactions alongside a corrected re-upload).
 *
 * `source_files` doesn't carry a foreign key from `transactions` /
 * `ar_outstanding` (spec §6 schema — those link to a period, not a specific
 * file), so cleanup here is scoped by kind:
 *  - sales: delete transactions for this period + this file's department
 *    (one sales file per department per period, per spec §2.1)
 *  - ar: delete all ar_outstanding rows for the period (one AR file/period)
 *  - master: nothing period-scoped to undo — customers is shared reference
 *    data, and master-file uploads never overwrite is_excluded/note
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const db = createServiceRoleClient();
    const periodId = params.id;
    const fileId = params.fileId;

    const { data: file, error: fetchError } = await db
      .from("source_files")
      .select("*")
      .eq("id", fileId)
      .eq("period_id", periodId)
      .single();
    if (fetchError || !file) {
      return NextResponse.json({ error: fetchError?.message ?? "ไม่พบไฟล์นี้" }, { status: 404 });
    }

    if (file.kind === "sales" && file.department_code) {
      const { error } = await db
        .from("transactions")
        .delete()
        .eq("period_id", periodId)
        .eq("department_code", file.department_code);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (file.kind === "ar") {
      const { error } = await db.from("ar_outstanding").delete().eq("period_id", periodId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: deleteFileError } = await db.from("source_files").delete().eq("id", fileId);
    if (deleteFileError) return NextResponse.json({ error: deleteFileError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete source file failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
      { status: 500 }
    );
  }
}
