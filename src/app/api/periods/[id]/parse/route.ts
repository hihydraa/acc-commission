import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/parser/pdfExtract";
import { extractXlsxAsText } from "@/lib/parser/xlsxExtract";
import { parseSalesReportText } from "@/lib/parser/salesReport";
import { checksumSalesReport } from "@/lib/parser/checksum";
import { parseArReportText } from "@/lib/parser/arReport";
import { parseDistanceMasterText } from "@/lib/parser/distanceMaster";
import { thaiDateToIso } from "@/lib/thaiDate";

export const runtime = "nodejs";
// pdf-parse on a real multi-page report + writing hundreds of transaction
// rows can take longer than the platform's 10s default — Vercel Hobby
// supports up to 60s via this export (Pro/Enterprise allow more).
export const maxDuration = 60;

/**
 * Ingests one uploaded file for a period (spec §1 step [2] PARSE).
 *
 * POST multipart/form-data:
 *   file: the PDF (or .xlsx for the distance master, spec §2.2)
 *   kind: 'sales' | 'ar' | 'master'
 *
 * Sales reports are checksummed (spec §3.6) before any transactions are
 * written — a failing checksum stops here with ok:false and the issue list;
 * nothing partial is written to `transactions`.
 */
export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    return await handlePost(request, context);
  } catch (err) {
    // Any unhandled throw here (pdf-parse choking on a malformed/odd PDF,
    // a regex edge case, etc.) used to fall through to Vercel's generic
    // HTML error page — which the client can't parse as JSON, so it just
    // showed a bare "HTTP 500" with no message. Catching it here means a
    // real crash is at least diagnosable from the Upload page.
    console.error("parse route failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
      { status: 500 }
    );
  }
}

async function handlePost(request: Request, { params }: { params: { id: string } }) {
  const periodId = params.id;

  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || typeof kind !== "string") {
    return NextResponse.json({ error: "missing file or kind" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
  const text = isXlsx ? await extractXlsxAsText(buffer) : await extractPdfText(buffer);

  const db = createServiceRoleClient();

  if (kind === "sales") {
    const report = parseSalesReportText(text);
    const checksum = checksumSalesReport(report);
    const totalQty = report.lines.reduce((s, l) => s + l.qty, 0);
    const totalValue = report.lines.reduce((s, l) => s + l.saleValue, 0);

    const { data: sourceFile, error: sourceFileError } = await db
      .from("source_files")
      .insert({
        period_id: periodId,
        kind: "sales",
        department_code: report.departmentCode,
        filename: file.name,
        storage_path: `periods/${periodId}/${file.name}`,
        checksum_liters: totalQty,
        checksum_value: totalValue,
        checksum_ok: checksum.ok,
      })
      .select()
      .single();
    if (sourceFileError) return NextResponse.json({ error: sourceFileError.message }, { status: 500 });

    if (!checksum.ok) {
      return NextResponse.json({
        ok: false,
        stage: "checksum",
        departmentCode: report.departmentCode,
        issues: checksum.issues,
        warnings: report.warnings,
        sourceFileId: sourceFile.id,
      });
    }

    if (!report.departmentCode) {
      return NextResponse.json({
        ok: false,
        stage: "department",
        message: "ตรวจไม่พบแผนกจากไฟล์ — โปรดตรวจสอบไฟล์ก่อนอัปโหลดใหม่",
      });
    }

    const rows = report.lines.map((line) => ({
      period_id: periodId,
      department_code: report.departmentCode!,
      doc_no: line.docNo,
      base_doc_no: line.baseDocNo,
      doc_date: thaiDateToIso(line.date),
      customer_code: line.customerCode,
      product_code: line.productCode,
      qty: line.qty,
      sale_value: line.saleValue,
      cost: line.cost,
      sale_type: (line.docNo[0] === "H" ? "cash" : line.docNo[0] === "I" ? "credit" : null) as
        | "cash"
        | "credit"
        | null,
      is_eligible: false,
      flags: [] as string[],
    }));

    const { error: insertError } = await db.from("transactions").insert(rows);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      departmentCode: report.departmentCode,
      lineCount: rows.length,
      warnings: report.warnings,
      sourceFileId: sourceFile.id,
    });
  }

  if (kind === "ar") {
    const parsed = parseArReportText(text);
    const { error: sourceFileError } = await db.from("source_files").insert({
      period_id: periodId,
      kind: "ar",
      filename: file.name,
      storage_path: `periods/${periodId}/${file.name}`,
      checksum_ok: parsed.rows.length > 0,
    });
    if (sourceFileError) return NextResponse.json({ error: sourceFileError.message }, { status: 500 });

    const rows = parsed.rows.map((r) => ({
      period_id: periodId,
      base_doc_no: r.baseDocNo,
      customer_code: r.customerCode,
      customer_name: r.customerNameRaw,
      bill_amount: r.billAmount,
      paid_amount: r.paidAmount,
      outstanding: r.outstanding,
      bill_date: thaiDateToIso(r.billDate),
      as_of_date: thaiDateToIso(parsed.asOfDate),
    }));
    if (rows.length > 0) {
      const { error } = await db.from("ar_outstanding").upsert(rows, { onConflict: "period_id,base_doc_no" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rowCount: rows.length, warnings: parsed.warnings });
  }

  if (kind === "master") {
    const parsed = parseDistanceMasterText(text);
    const { error: sourceFileError } = await db.from("source_files").insert({
      period_id: periodId,
      kind: "master",
      filename: file.name,
      storage_path: `periods/${periodId}/${file.name}`,
      checksum_ok: parsed.rows.length > 0,
    });
    if (sourceFileError) return NextResponse.json({ error: sourceFileError.message }, { status: 500 });

    for (const row of parsed.rows) {
      // never overwrite is_excluded/note — those are accounting-managed
      // settings, not something the monthly master file should reset.
      const { error } = await db
        .from("customers")
        .upsert(
          {
            code: row.customerCode,
            name: row.customerName,
            distance_km: row.distanceKm,
            salesperson: row.salesperson,
          },
          { onConflict: "code", ignoreDuplicates: false }
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rowCount: parsed.rows.length, warnings: parsed.warnings });
  }

  return NextResponse.json({ error: `unknown kind: ${kind}` }, { status: 400 });
}
