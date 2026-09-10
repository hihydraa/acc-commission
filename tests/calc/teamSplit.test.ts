import { describe, it, expect } from "vitest";
import { roundHalfUp2 } from "@/lib/calc/rounding";
import { splitTeam, DEFAULT_TEAM_SPLIT } from "@/lib/calc/teamSplit";

describe("roundHalfUp2 + splitTeam — spec §4.4 / §8 reference numbers", () => {
  it("rounds อ้อม's raw total 4,499.1075 to 4,499.11 at the cell level", () => {
    expect(roundHalfUp2(4499.1075)).toBe(4499.11);
  });

  it("splits อ้อม's rounded net exactly as the spec's reference sheet (§8)", () => {
    const result = splitTeam(4499.11, DEFAULT_TEAM_SPLIT);
    expect(result.manager).toBe(449.91);
    expect(result.admin).toBe(899.82);
    expect(result.central).toBe(449.91);
    expect(result.sales).toBe(2699.47); // receives the remainder, not round(net * 0.60)
    expect(result.manager + result.admin + result.central + result.sales).toBeCloseTo(4499.11, 2);
  });

  it("matches the spec's worked rounding-drift example: net 4,499.08 balances exactly via remainder", () => {
    // spec §4.4: rounding each of the 4 shares independently would sum to
    // 4,499.09 (1 satang over); the marketing share must absorb the
    // remainder instead so the four shares always sum back to net exactly.
    const result = splitTeam(4499.08, DEFAULT_TEAM_SPLIT);
    const total = result.manager + result.admin + result.central + result.sales;
    expect(Math.round(total * 100) / 100).toBe(4499.08);
  });

  it("ต้อม and วีระ totals pass through untouched when there's nothing to split (whole-number examples)", () => {
    expect(roundHalfUp2(720)).toBe(720);
    expect(roundHalfUp2(240)).toBe(240);
  });
});
