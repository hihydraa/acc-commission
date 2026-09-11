import { describe, it, expect } from "vitest";
import { parseDistanceMasterText } from "@/lib/parser/distanceMaster";

/**
 * Verbatim pdf-parse extraction of the user's real "ระยะทาง + เชลล์ 2.pdf"
 * (branch กระนวน) — a narrow multi-column PDF table where each logical row
 * gets split across an unpredictable number of text lines, and some fields
 * end up jammed together with zero separating whitespace (see the last row
 * here: "21ปั๊มปุ๊บริการKCL660037อ.กระนวนทางผ่านอ้อม" has NO gaps at all
 * between area/"ทางผ่าน"/salesperson). This exposed a real bug: the
 * original line-by-line parser found the customer code fine but always
 * missed the distance (it was on a different extracted line), silently
 * writing distance_km = NULL for every single customer on upload — which
 * then overwrote any previously-correct distance in the database.
 */
const REAL_MASTER_TEXT = `

ระยะทาง(กม.) / เซล
ล าดับช
ื่
อลูกค้ารหัสพื้นที่
ระยะทาง
/กม.
เซลล์
1อานันต์ปิโตรเลียมKCL660009
ศรีธาตุ
42       อ้อม
2เกวลินKCL660094
อ.ท่าคันโท
42       ต้อม
3ชาติเจริญKCL680003
โนนสะอาด
51       ต้อม
4
ส.ปิโตรเลียมKCL660017อ.เขาสวนกวาง13       อ้อม
5ป.ปัจถากิตKN58325อ.โนนสะอาด51       ต้อม
6พีพีสเตช
ั่
นKN58371สามหมอ76       ต้อม
7KSP เกษมทรัพย์KNB6001อ.โนนสะอาด51       วีระ
8แฟมมิลี่KN58375สามหมอ48       ต้อม
9เอื้องฟ้าKN58406อ.โนนสะอาด51       วีระ
10ป.รุ่งเรืองKCL660025
อ.หนองกรุงศรี
38       อ้อม
11หนองกุงศรีปิโตรเลียมKCL660019หนองกุงศรี
13
อ้อม
12ชาคิยาKCL660220อ.บ้านฝาง
13
วีระ
13ปั๊มอ าไพบริการ อ.ค าใหญ่KCL660073ห้วยเม็ก
13
อ้อม
14ชาติเจริญKCL660003โนนสะอาด
51
ต้อม
15ปั้มมีสุข บ.พิมูลKN53366ห้วยเม็ก
14
อ้อม
16ป.ปัจถากิตKN58325อ.โนนสะอาด
51
ต้อม
17พีพีปิโตรเลียมKN53461อ.โนนสะอาด
51
อ้อม
18อริยะKN58199บ้านฝาง
28
อ้อม
19ปั้มเอส.พี.ออยล์KN58306กระนวน
11
อ้อม
20ครูยุทธบริการ บ.ส

าโรง  ลูกค้ารถ19KN58060กระนวน
11
อ้อม
21ปั๊มปุ๊บริการKCL660037อ.กระนวนทางผ่านอ้อม`;

describe("parseDistanceMasterText — real ระยะทาง+เซลล์ file (branch กระนวน)", () => {
  it("finds all 21 rows / 20 distinct customer codes (KN58325 repeated) with no warnings", () => {
    const result = parseDistanceMasterText(REAL_MASTER_TEXT);
    expect(result.rows).toHaveLength(21);
    expect(new Set(result.rows.map((r) => r.customerCode)).size).toBe(20);
    expect(result.warnings).toHaveLength(0);
  });

  it("finds KN58060 even though its row's stray digits are glued directly onto the code with no space (real bug: previously dropped entirely)", () => {
    const result = parseDistanceMasterText(REAL_MASTER_TEXT);
    const row = result.rows.find((r) => r.customerCode === "KN58060");
    expect(row).toBeDefined();
    expect(row!.distanceKm).toBe(11);
    expect(row!.salesperson).toBe("อ้อม");
  });

  it("extracts distance + salesperson correctly for a plain numeric row", () => {
    const result = parseDistanceMasterText(REAL_MASTER_TEXT);
    const row = result.rows.find((r) => r.customerCode === "KCL660009")!;
    expect(row.distanceKm).toBe(42);
    expect(row.salesperson).toBe("อ้อม");
  });

  it("handles a code with only 4 digits (KNB6001)", () => {
    const result = parseDistanceMasterText(REAL_MASTER_TEXT);
    const row = result.rows.find((r) => r.customerCode === "KNB6001")!;
    expect(row.distanceKm).toBe(51);
    expect(row.salesperson).toBe("วีระ");
  });

  it("doesn't leak the next row's leading sequence number into distance/salesperson (KCL660017 case)", () => {
    const result = parseDistanceMasterText(REAL_MASTER_TEXT);
    const row = result.rows.find((r) => r.customerCode === "KCL660017")!;
    expect(row.distanceKm).toBe(13);
    expect(row.salesperson).toBe("อ้อม");
  });

  it("parses the last row (zero whitespace: area+'ทางผ่าน'+salesperson all jammed together)", () => {
    const result = parseDistanceMasterText(REAL_MASTER_TEXT);
    const row = result.rows.find((r) => r.customerCode === "KCL660037")!;
    expect(row.distanceKm).toBe(0);
    expect(row.distanceRaw).toBe("ทางผ่าน");
    expect(row.salesperson).toBe("อ้อม");
  });

  it("handles the same customer code appearing twice in the file (KN58325) without erroring", () => {
    const result = parseDistanceMasterText(REAL_MASTER_TEXT);
    const occurrences = result.rows.filter((r) => r.customerCode === "KN58325");
    expect(occurrences).toHaveLength(2);
    expect(occurrences.every((r) => r.distanceKm === 51 && r.salesperson === "ต้อม")).toBe(true);
  });
});
