import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildCommissionWorkbook, type ExportInput } from "@/lib/excelExport";
import { DEFAULT_TEAM_SPLIT } from "@/lib/calc/teamSplit";

const input: ExportInput = {
  period: { year: 2569, month: 8, branch: "สามทอง/โลจิสติกส์" },
  departments: [{ code: "A7", label: "เบอร์รถ 60" }],
  rows: [
    {
      departmentCode: "A7",
      docNo: "HDA726080001-1",
      docDate: "2026-08-01",
      customerCode: "KCL660009",
      customerName: "อานันต์ปิโตรเลียม",
      productCode: "DS",
      qty: 2000,
      saleValue: 60000,
      cost: 58500,
      saleType: "cash",
      distanceKm: 42,
      isOneWay: false,
      freightRate: 0.15,
      commission: 60,
      isEligible: true,
      blockedReason: null,
      flags: [],
      outstandingAmount: 20,
      arOutstandingReference: 5000,
      salesperson: "อ้อม",
    },
    {
      departmentCode: "A7",
      docNo: "HDA726080002-1",
      docDate: "2026-08-02",
      customerCode: "KCL999999",
      customerName: "ลูกค้าไม่มีระยะทาง",
      productCode: "DS",
      qty: 2000,
      saleValue: 60000,
      cost: 58500,
      saleType: "cash",
      distanceKm: null,
      isOneWay: false,
      freightRate: null,
      commission: null,
      isEligible: true,
      blockedReason: "ไม่มีระยะทางใน master — กรอกระยะทาง หรือ ติ๊ก 1สาย1สู้",
      flags: [],
      outstandingAmount: null,
      arOutstandingReference: null,
      salesperson: null,
    },
  ],
  config: {
    thresholds: { cash: 0.2, credit: 0.3, overdue: 0.6 },
    ratePerLiter: 0.03,
    penaltyNegativeQEnabled: true,
    teamSplit: DEFAULT_TEAM_SPLIT,
  },
  notes: [{ message: "test note", actor: "tester", createdAt: "2026-09-01" }],
};

describe("buildCommissionWorkbook", () => {
  it("builds a readable workbook with the Master / department / หักหนี้ค้างชำระ / ค่าคอมรวม / ใบปะหน้า / หมายเหตุ sheets", async () => {
    const buffer = await buildCommissionWorkbook(input);
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exceljs's Buffer type and the installed @types/node's generic Buffer disagree; both are Buffer at runtime.
    await wb.xlsx.load(buffer as any);

    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual(["Master", "เบอร์รถ 60", "หักหนี้ค้างชำระ", "ค่าคอมรวม", "ใบปะหน้า", "หมายเหตุ"]);

    const master = wb.getWorksheet("Master")!;
    expect(master.getRow(2).getCell(1).value).toBe("KCL660009");
    expect(master.getRow(2).getCell(3).value).toBe("อ้อม");
    expect(master.getRow(3).getCell(1).value).toBe("KCL999999");
    expect(master.getRow(3).getCell(6).value).toContain("ไม่มีเซลล์");

    const dept = wb.getWorksheet("เบอร์รถ 60")!;
    expect(dept.getRow(1).getCell(3).value).toBe("เลขที่เอกสาร");
    expect(dept.getRow(2).getCell(3).value).toBe("HDA726080001-1");
    expect(dept.getRow(2).getCell(9).value).toBe(2000); // I = qty
    // row 4 blank, row 5 = "รวมทั้งชีท", row 6 = "รวมเฉพาะรายการที่เข้าเกณฑ์ค่าคอม"
    expect(dept.getRow(5).getCell(5).value).toBe("รวมทั้งชีท");
    expect(dept.getRow(6).getCell(5).value).toBe("รวมเฉพาะรายการที่เข้าเกณฑ์ค่าคอม");

    const debt = wb.getWorksheet("หักหนี้ค้างชำระ")!;
    expect(debt.getRow(2).getCell(1).value).toBe("KCL660009");
    expect(debt.getRow(2).getCell(7).value).toBe(20);
    expect(debt.getRow(2).getCell(8).value).toBe(5000);

    const summary = wb.getWorksheet("ค่าคอมรวม")!;
    expect(summary.getRow(2).getCell(1).value).toBe("อ้อม");
    expect(summary.getRow(2).getCell(4).value).toBe(60); // ก่อนหักหนี้
    expect(summary.getRow(2).getCell(5).value).toBe(20); // หักหนี้
    expect(summary.getRow(2).getCell(6).value).toBe(40); // สุทธิ

    const cover = wb.getWorksheet("ใบปะหน้า")!;
    expect(cover.getRow(4).getCell(1).value).toBe("อ้อม");
    expect(cover.getRow(4).getCell(2).value).toBe(40); // net used for split, not the pre-deduction 60
  });
});
