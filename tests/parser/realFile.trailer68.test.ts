import { describe, it, expect } from "vitest";
import { parseSalesReportText } from "@/lib/parser/salesReport";
import { checksumSalesReport } from "@/lib/parser/checksum";

/**
 * Verbatim text (pdfjs-dist fallback extraction, disableNormalization:
 * true) from the user's real "เทรลเลอร์เบอร์68 ส.ค. 69.pdf" — the file that
 * exposed two real bugs in one round-trip:
 *  1. pdf-parse threw on this file's malformed XRef table (fixed by the
 *     pdfjs-dist fallback in pdfExtract.ts)
 *  2. the fallback's extracted text has NO indentation at all (modern
 *     pdf.js collapses repeated whitespace, unlike pdf-parse's old bundled
 *     pdf.js) — customer vs. product header used to be told apart by
 *     indentation, silently misclassifying every product header as a
 *     customer header and producing 0 parsed lines. Fixed by classifying
 *     on the CODE's shape instead (CUSTOMER_CODE_RE in salesReport.ts).
 *
 * Expected results are the spec's own reference numbers for this file
 * (§8: "เทรลเลอร์68 = 4 แถว", §3.6: "16,000.00 ล. / 513,551.40 บาท").
 */
const REAL_TRAILER68_TEXT = `หางหุนสวนจํากัด เค.ซี.ปโตรเลียม 2006 หนา : 1
รายงานสรุปยอดขาย แยกตามลูกคา
วันที่จาก 1 ส.ค. 2569 ถึง 31 ส.ค. 2569 วันที่ : 08/09/69
รหัสลูกคา ถึง ๛๛0000110
รหัสพนักงานขาย ถึง ไพโรจน
รหัสสินคาจาก 0101002 ถึง สท-1490020
หมวดสินคาจาก 01 ถึง 01
เขตการขายจาก ถึง หม เลือกแผนก 68
-----------------------------------------------------<-----------------------------------------จํานวน----------------------------------------->--<-------------------------------------------------------------มูลคา--------------------------------------------------->-------
รายการสินคา/รหัส ขายสด ขายเชื่อ ของแถม รับคืน รับคืนของแถม ขายสุทธิ หนวยนับ ขายสด ขายเชื่อ เพิ่มหนี้ ลดหนี้/รับคืน ขายสุทธิ - ตนทุนขาย + ตนทุนรับคืน =กําไรขั้นตน (%)
เลขที่เอกสาร วันที่ จํานวน มูลคาขาย ตนทุน หมายเหตุ ลูกคา พนักงานขาย จํานวนขาย หนวย อัตรา ราคาตอหนวย V สวนลด จํานวนเงิน สวนลดรวม เพื่อเอกสาร รับคืนสินคา? เปนของแถม?
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
ปมปุบริการ /KCL660037
ดีเซล-1 /DS
HD6501075- 1 02/08/69 5,000.00 160,747.67 158,470.46 KCL660037 5,000.00 ลต 1.00 34.40 1 172,000.00
ดีเซล-1 /DS 5,000.00 0.00 0.00 0.00 0.00 5,000.00 ลิตร 160,747.67 0.00 0.00 0.00 160,747.67 158,470.46 0.00 2,277.21 1.42
แกสโซฮอล 91 /G91
HD6501079- 1 18/08/69 3,000.00 96,728.97 95,656.36 KCL660037 3,000.00 ลต 1.00 34.50 1 103,500.00
แกสโซฮอล 91 /G91 3,000.00 0.00 0.00 0.00 0.00 3,000.00 ลิตร 96,728.97 0.00 0.00 0.00 96,728.97 95,656.36 0.00 1,072.61 1.11
แกสโซฮอล 95 /G95
HD6501075- 2 02/08/69 4,000.00 127,102.80 125,392.90 KCL660037 4,000.00 ลต 1.00 34.00 1 136,000.00
HD6501078- 1 16/08/69 4,000.00 128,971.96 126,720.00 KCL660037 4,000.00 ลต 1.00 34.50 1 138,000.00
แกสโซฮอล 95 /G95 8,000.00 0.00 0.00 0.00 0.00 8,000.00 ลิตร 256,074.76 0.00 0.00 0.00 256,074.76 252,112.90 0.00 3,961.86 1.55
------------- ------------ ---------- ------------ ---------- ------------ ------------- ------------- ------------- ------------- ------------- ------------- ------------- -------------
รวมลูกคา ปมปุบริการ /KCL66003 3 สินคา 16,000.00 0.00 0.00 0.00 0.00 16,000.00 513,551.40 0.00 0.00 0.00 513,551.40 506,239.72 0.00 7,311.68 1.42
============= ============ ========== ============ ========== ============ ============= ============= ============= ============= ============= ============= ============= =============
รวมทั้งสิ้น ลูกคา 1 ราย 16,000.00 0.00 0.00 0.00 0.00 16,000.00 513,551.40 0.00 0.00 0.00 513,551.40 506,239.72 0.00 7,311.68 1.42
============= ============ ========== ============ ========== ============ ============= ============= ============= ============= ============= ============= ============= =============
>>>> จบรายงาน <<<<`;

describe("parseSalesReportText — real เทรลเลอร์68 file (no indentation, pdfjs-dist extraction)", () => {
  it("detects department 68", () => {
    expect(parseSalesReportText(REAL_TRAILER68_TEXT).departmentCode).toBe("68");
  });

  it("parses exactly 4 sale lines, matching spec §8 reference", () => {
    const report = parseSalesReportText(REAL_TRAILER68_TEXT);
    expect(report.lines).toHaveLength(4);
    expect(report.warnings).toHaveLength(0);
  });

  it("assigns product codes correctly despite zero indentation (the actual bug)", () => {
    const report = parseSalesReportText(REAL_TRAILER68_TEXT);
    expect(report.lines.map((l) => l.productCode)).toEqual(["DS", "G91", "G95", "G95"]);
    expect(report.lines.every((l) => l.customerCode === "KCL660037")).toBe(true);
  });

  it("passes checksum end-to-end and matches the spec §3.6 grand total exactly", () => {
    const report = parseSalesReportText(REAL_TRAILER68_TEXT);
    expect(report.grandTotal).toEqual(
      expect.objectContaining({ customerCount: 1, qtyTotal: 16000, valueTotal: 513551.4 })
    );
    const result = checksumSalesReport(report);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
