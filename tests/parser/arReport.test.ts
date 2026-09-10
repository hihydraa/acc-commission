import { describe, it, expect } from "vitest";
import { parseArReportText } from "@/lib/parser/arReport";

/**
 * SYNTHETIC fixture — the spec gives no literal line excerpt for this
 * report's layout (see the limitation comment at the top of arReport.ts).
 * This only proves the scaffold logic works on a plausible shape; it must
 * be re-validated against a real exported PDF before production use.
 */
const SAMPLE = `รายงานลูกหนี้คงค้างแบบละเอียด ณ วันที่ 07/09/69
IDB726080022-1 เกวลิน ปิโตรเลียม 10/08/69 20,600.00
IDB726080043-1 เกวลิน ปิโตรเลียม 22/08/69 107,700.00
IDB726080044-1 ป.ปัดถากิจ 25/08/69 107,550.00
`;

describe("parseArReportText", () => {
  it("extracts the report as-of date", () => {
    const result = parseArReportText(SAMPLE);
    expect(result.asOfDate).toBe("07/09/69");
  });

  it("extracts one row per bill with base doc no, date, and outstanding amount", () => {
    const result = parseArReportText(SAMPLE);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].baseDocNo).toBe("IDB726080022");
    expect(result.rows[0].billDate).toBe("10/08/69");
    expect(result.rows[0].outstanding).toBe(20600);
    expect(result.rows[2].baseDocNo).toBe("IDB726080044");
    expect(result.rows[2].outstanding).toBe(107550);
  });
});
