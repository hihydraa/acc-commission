import { describe, it, expect } from "vitest";
import { lookupFreightRate, FREIGHT_BLOCK } from "@/lib/calc/freightTable";

describe("lookupFreightRate", () => {
  it.each([
    [0, 0],
    [19, 0],
    [20, 0.15],
    [59, 0.15],
    [60, 0.17],
    [69, 0.17],
    [70, 0.19],
    [79, 0.19],
    [80, 0.2],
    [89, 0.2],
    [90, 0.22],
    [99, 0.22],
    [100, 0.24],
    [109, 0.24],
    [110, 0.28],
    [129, 0.28],
    [130, 0.3],
    [139, 0.3],
    [140, 0.32],
    [159, 0.32],
    [160, 0.34],
    [169, 0.34],
    [170, 0.35],
    [179, 0.35],
    [180, 0.36],
    [189, 0.36],
    [190, 0.38],
    [199, 0.38],
    [200, 0.39],
    [209, 0.39],
  ])("distance %i km -> %f baht/liter", (km, expected) => {
    expect(lookupFreightRate(km)).toBe(expected);
  });

  it("BLOCKs beyond 209 km — never silently defaults to 0 (spec v2 bug fix #1)", () => {
    expect(lookupFreightRate(210)).toBe(FREIGHT_BLOCK);
    expect(lookupFreightRate(500)).toBe(FREIGHT_BLOCK);
  });

  it("BLOCKs negative distances", () => {
    expect(lookupFreightRate(-1)).toBe(FREIGHT_BLOCK);
  });
});
