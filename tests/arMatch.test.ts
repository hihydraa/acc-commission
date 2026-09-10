import { describe, it, expect } from "vitest";
import { matchOutstandingBills } from "@/lib/arMatch";
import type { ArOutstandingRow } from "@/lib/parser/types";

/**
 * Mirrors the worked example in spec §5.3 for เดือน 8/2569:
 *  - IDB726080022, IDB726080043, IDB726080044 SHOULD be flagged (eligible + in-month)
 *  - IDB726080038, IDB726080034 must NOT be flagged — they never reached the
 *    quantity threshold, so they were never in the eligible set to begin with
 *  - a same-numbered bill dated the *next* month must not be flagged either
 *    (the AR report is issued on the 7th of the following month and carries
 *    plenty of next-month bills mixed in)
 */
function row(overrides: Partial<ArOutstandingRow>): ArOutstandingRow {
  return {
    baseDocNo: "IDB000000000",
    customerCode: null,
    customerNameRaw: "",
    billDate: "15/08/69",
    billAmount: 0,
    paidAmount: 0,
    outstanding: 0,
    ...overrides,
  };
}

describe("matchOutstandingBills — spec §5.3", () => {
  const eligibleBaseDocNos = new Set(["IDB726080022", "IDB726080043", "IDB726080044"]);
  const period = { year: 2569, month: 8 };

  it("flags eligible bills dated within the calculated month", () => {
    const rows: ArOutstandingRow[] = [
      row({ baseDocNo: "IDB726080022", customerNameRaw: "เกวลิน", outstanding: 20600, billDate: "10/08/69" }),
      row({ baseDocNo: "IDB726080043", customerNameRaw: "เกวลิน", outstanding: 107700, billDate: "22/08/69" }),
      row({ baseDocNo: "IDB726080044", customerNameRaw: "ป.ปัดถากิจ", outstanding: 107550, billDate: "25/08/69" }),
    ];
    const matches = matchOutstandingBills(rows, eligibleBaseDocNos, period);
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.outstanding).sort((a, b) => a - b)).toEqual([20600, 107550, 107700]);
  });

  it("does not flag bills that never reached the commission-eligible set (below quantity threshold)", () => {
    const rows: ArOutstandingRow[] = [
      row({ baseDocNo: "IDB726080038", customerNameRaw: "ส.สิริโรจน์", outstanding: 5000 }),
      row({ baseDocNo: "IDB726080034", customerNameRaw: "จุฑาทรัพย์", outstanding: 4000 }),
    ];
    const matches = matchOutstandingBills(rows, eligibleBaseDocNos, period);
    expect(matches).toHaveLength(0);
  });

  it("excludes bills dated in a different month even if the doc number matches (AR report bleeds into next month)", () => {
    const rows: ArOutstandingRow[] = [
      row({ baseDocNo: "IDB726080022", outstanding: 20600, billDate: "03/09/69" }), // next month
    ];
    const matches = matchOutstandingBills(rows, eligibleBaseDocNos, period);
    expect(matches).toHaveLength(0);
  });

  it("normalizes the line-item suffix before matching (IDB726080044-1 -> IDB726080044)", () => {
    // baseDocNo is already suffix-stripped by the parser before reaching this
    // function (normalize.ts baseDocNo()), so this just documents the contract.
    const rows: ArOutstandingRow[] = [row({ baseDocNo: "IDB726080044", outstanding: 107550 })];
    const matches = matchOutstandingBills(rows, new Set(["IDB726080044"]), period);
    expect(matches).toHaveLength(1);
  });
});
