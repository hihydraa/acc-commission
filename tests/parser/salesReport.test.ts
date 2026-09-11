import { describe, it, expect } from "vitest";
import { parseSalesReportText } from "@/lib/parser/salesReport";
import { checksumSalesReport } from "@/lib/parser/checksum";

/**
 * NOTE: this fixture is SYNTHETIC — hand-built to match the line shapes
 * quoted in spec §3.2-§3.6, not extracted from a real PDF (none was
 * available this session). It validates the parser's own internal logic
 * (department detection, block-scoped checksums, doc-no normalization) but
 * does NOT prove the column-position assumptions documented at the top of
 * salesReport.ts hold against the real accounting-system PDF output. Treat
 * a passing test here as "the code does what it's supposed to do", not as
 * "the parser is validated against production data" — see README.
 */
const SAMPLE_REPORT = `หางหุนสวนจำกัด เค.ซี.ปโตรเลียม 2006  หนา : 1
เขตการขายจาก        ถึง หม   เลือกแผนก A7
หนองกุงศรีปโตรเลียม /KCL660019
  ดีเซล-1 /DS
  IDA726080014-1 07/08/69 4,000.00 128,598.13 124,600.00 KCL660019 4,000.00 ลิตร 32.15 32.15 0 0.00 128598.13
  ดีเซล-1 /DS 4,000.00 ลิตร 128598.13
รวมลูกคา หนองกุงศรีปโตรเลียม /K 1 สินคา 4,000.00 ลิตร 128598.13
ป.ปัดถากิจ /KCL660020
  ดีเซล-1 /DS
  ID6501963- 1 12/08/69 2,500.00 80,375.00 77,875.00 KCL660020 2,500.00 ลิตร 32.15 32.15 0 0.00 80375.00
  ดีเซล-1 /DS 2,500.00 ลิตร 80375.00
รวมลูกคา ป.ปัดถากิจ /K 1 สินคา 2,500.00 ลิตร 80375.00
รวมทั้งสิ้น ลูกคา 2 ราย 6,500.00 ลิตร 208973.13
`;

describe("parseSalesReportText", () => {
  it("detects the department from the 'เลือกแผนก' header line", () => {
    const report = parseSalesReportText(SAMPLE_REPORT);
    expect(report.departmentCode).toBe("A7");
  });

  it("parses both sale lines with the right product/customer context", () => {
    const report = parseSalesReportText(SAMPLE_REPORT);
    expect(report.lines).toHaveLength(2);

    const [first, second] = report.lines;
    expect(first.productCode).toBe("DS");
    expect(first.customerCode).toBe("KCL660019");
    expect(first.qty).toBe(4000);
    expect(first.saleValue).toBeCloseTo(128598.13, 2);

    expect(second.customerCode).toBe("KCL660020");
    expect(second.qty).toBe(2500);
  });

  it("normalizes a doc number with a stray space before the suffix (spec §3.5)", () => {
    const report = parseSalesReportText(SAMPLE_REPORT);
    const line = report.lines.find((l) => l.customerCode === "KCL660020")!;
    expect(line.docNo).toBe("ID6501963-1");
    expect(line.baseDocNo).toBe("ID6501963");
  });

  it("pairs each product/customer subtotal with the correct block of lines", () => {
    const report = parseSalesReportText(SAMPLE_REPORT);
    expect(report.productSubtotals).toHaveLength(2);
    for (const s of report.productSubtotals) {
      expect(s.qtyComputed).toBe(s.qtyTotal);
      expect(s.valueComputed).toBeCloseTo(s.valueTotal, 2);
    }
    expect(report.customerSubtotals).toHaveLength(2);
    for (const s of report.customerSubtotals) {
      expect(s.qtyComputed).toBe(s.qtyTotal);
    }
  });

  it("parses the file grand total line", () => {
    const report = parseSalesReportText(SAMPLE_REPORT);
    expect(report.grandTotal).not.toBeNull();
    expect(report.grandTotal!.customerCount).toBe(2);
    expect(report.grandTotal!.qtyTotal).toBe(6500);
    expect(report.grandTotal!.valueTotal).toBeCloseTo(208973.13, 2);
  });

  it("passes checksum end-to-end for a well-formed file", () => {
    const report = parseSalesReportText(SAMPLE_REPORT);
    const result = checksumSalesReport(report);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails checksum (fails closed, never silently passes) when a line is missing", () => {
    const broken = SAMPLE_REPORT.replace(
      "  IDA726080014-1 07/08/69 4,000.00 128,598.13 124,600.00 KCL660019 4,000.00 ลิตร 32.15 32.15 0 0.00 128598.13\n",
      ""
    );
    const report = parseSalesReportText(broken);
    const result = checksumSalesReport(report);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("carries currentProductCode across a page break without corrupting it, even with a PUA character mid-word in the reprinted column header (real bug found against เบอร์60/เบอร์67/กรอกปั๊ม ส.ค. 69)", () => {
    // A page break reprints the company/title lines, the "วันที่จาก...ถึง...
    // วันที่ : dd/mm/yy" period-range line, and the column-header line — but
    // NOT the product header (spec §3.2). Real files inject a Private Use
    // Area codepoint (U+F70B here) inside "สินค\u{F70B}า", and the
    // dd/mm/yy date contains slashes that look like a "<name>/<code>"
    // header to CODE_SUFFIX_RE — either alone was enough to make the parser
    // silently invent a fake product ("รหัส" / "09/69") and misattribute
    // every following sale line to it until the next real product header.
    const withPageBreak =
      SAMPLE_REPORT.replace(/รวมทั้งสิ้น.*$/m, "") +
      `หางหุนสวนจำกัด เค.ซี.ปโตรเลียม 2006  หนา : 2\n` +
      `วันที่จาก          1 ส.ค. 2569          ถึง   31 ส.ค. 2569        วันที่    : 08/09/69\n` +
      `    รายการสิน\u{F70B}คา/รหัส  ขายสด  ขายเชื่อ\n` +
      `       เลขที่เอกสาร         วันที่         จํานวน\n` +
      `  IDA726080015-1 20/08/69 3,000.00 96,450.00 93,000.00 KCL660019 3,000.00 ลิตร 32.15 32.15 0 0.00 96450.00\n` +
      `รวมทั้งสิ้น ลูกคา 3 ราย 9,500.00 ลิตร 305423.13\n`;
    const report = parseSalesReportText(withPageBreak);
    const carriedOverLine = report.lines.find((l) => l.docNo === "IDA726080015-1");
    expect(carriedOverLine).toBeDefined();
    expect(carriedOverLine!.productCode).toBe("DS");
  });
});
