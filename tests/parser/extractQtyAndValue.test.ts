import { describe, it, expect } from "vitest";
import { extractQtyAndValue } from "@/lib/parser/salesReport";

/**
 * Regression tests using VERBATIM lines from the user's real August 2569
 * PDFs (pasted back after the first production checksum run). These
 * replace the earlier column-position guess documented as an ASSUMPTION —
 * this is the confirmed real layout, not a synthetic fixture.
 */
describe("extractQtyAndValue — real PDF lines", () => {
  it("product subtotal, all-cash (cash_value happens to equal total_value)", () => {
    const line =
      "ดีเซล-1 /DS 814.00 0.00 0.00 0.00 0.00 814.00 ลิตร 28,646.73 0.00 0.00 0.00 28,646.73 26,344.90 0.00 2,301.83 8.04";
    expect(extractQtyAndValue(line)).toEqual({ qty: 814, value: 28646.73 });
  });

  it("product subtotal split across cash + credit — value is NOT the last number (that's a profit % column)", () => {
    const line =
      "ดีเซล-1 /DS 540.00 160.00 0.00 0.00 0.00 700.00 ลิตร 18,845.79 5,671.03 0.00 0.00 24,516.82 22,531.00 0.00 1,985.82 8.10";
    expect(extractQtyAndValue(line)).toEqual({ qty: 700, value: 24516.82 });
  });

  it("grand total line (no 'ลิตร' label) — เบอร์60 A7, matches spec §3.6 reference exactly", () => {
    const line =
      "รวมทั้งสิ้น ลูกคา 82 ราย 92,959.00 91,852.00 0.00 0.00 0.00 184,811.00 3,203,566.79 3,100,068.77 0.00 0.00 6,303,635.56 5,913,551.98 0.00 390,083.58 6.19";
    expect(extractQtyAndValue(line)).toEqual({ qty: 184811, value: 6303635.56 });
  });

  it("grand total line — เบอร์67 B7, matches spec §3.6 reference exactly", () => {
    const line =
      "รวมทั้งสิ้น ลูกคา 102 ราย 126,170.00 85,315.00 0.00 0.00 0.00 211,485.00 4,286,762.98 2,902,709.79 0.00 0.00 7,189,472.77 6,785,810.99 0.00 403,661.78 5.61";
    expect(extractQtyAndValue(line)).toEqual({ qty: 211485, value: 7189472.77 });
  });

  it("grand total line — กรอกปั๊ม B3, matches spec §3.6 reference exactly (incl. the documented Bt1.80 line-sum rounding drift)", () => {
    const line =
      "รวมทั้งสิ้น ลูกคา 46 ราย 92,621.77 53,599.75 0.00 0.00 0.00 146,221.52 3,227,738.13 1,823,368.31 0.00 0.00 5,051,106.44 4,658,380.15 0.00 392,726.29 7.78";
    expect(extractQtyAndValue(line)).toEqual({ qty: 146221.52, value: 5051106.44 });
  });
});
