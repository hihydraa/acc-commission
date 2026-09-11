import { describe, it, expect } from "vitest";
import { parseDistanceMasterText } from "@/lib/parser/distanceMaster";

const SAMPLE = `KCL660019  หนองกุงศรีปโตรเลียม  45  อ้อม
KCL660037  ปั๊มปุ๊บริการ  ทางผ่าน  ต้อม
KCL660020  ป.ปัดถากิจ  120  วีระ
`;

describe("parseDistanceMasterText", () => {
  it("parses a normal numeric distance row", () => {
    const result = parseDistanceMasterText(SAMPLE);
    const row = result.rows.find((r) => r.customerCode === "KCL660019")!;
    expect(row.distanceKm).toBe(45);
    expect(row.salesperson).toBe("อ้อม");
  });

  it("treats 'ทางผ่าน' as 0 km — confirmed business rule (pass-through stop), no Review needed", () => {
    const result = parseDistanceMasterText(SAMPLE);
    const row = result.rows.find((r) => r.customerCode === "KCL660037")!;
    expect(row.distanceKm).toBe(0);
    expect(row.distanceRaw).toBe("ทางผ่าน");
    expect(result.warnings.some((w) => w.includes("KCL660037"))).toBe(false);
  });

  it("still blocks for Review on a genuinely unknown non-numeric distance value", () => {
    const result = parseDistanceMasterText(
      "KCL660099  ร้านทดสอบ  ไม่ทราบ  สมชาย\n"
    );
    const row = result.rows[0];
    expect(row.distanceKm).toBeNull();
    expect(row.distanceRaw).toBe("ไม่ทราบ");
    expect(result.warnings.some((w) => w.includes("KCL660099"))).toBe(true);
  });
});
