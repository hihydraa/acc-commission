import { describe, it, expect } from "vitest";
import { normalizeDocNo, baseDocNo, normalizeThai } from "@/lib/parser/normalize";

describe("normalizeDocNo", () => {
  it("strips a stray space before the line-item suffix (spec §3.5)", () => {
    expect(normalizeDocNo("ID6501963- 1")).toBe("ID6501963-1");
    expect(normalizeDocNo("HDA726080127- 1")).toBe("HDA726080127-1");
    expect(normalizeDocNo("IVB326080156- 1")).toBe("IVB326080156-1");
  });

  it("uppercases and strips all whitespace", () => {
    expect(normalizeDocNo("  idb726080044-1  ")).toBe("IDB726080044-1");
  });
});

describe("baseDocNo", () => {
  it("strips the trailing line-item suffix for AR matching (spec §3.5, §5.3)", () => {
    expect(baseDocNo("IDB726080044-1")).toBe("IDB726080044");
    expect(baseDocNo("ID6501963- 1")).toBe("ID6501963");
  });

  it("is a no-op when there is no suffix", () => {
    expect(baseDocNo("IDB726080044")).toBe("IDB726080044");
  });
});

describe("normalizeThai", () => {
  it("strips PUA glyphs injected mid-word (spec §3.4 'รายการสินค้า' bug)", () => {
    const withPua = "รายการสิน\u{F70B}ค้า";
    expect(normalizeThai(withPua)).not.toContain("\u{F70B}");
  });

  it("strips combining vowel/tone marks so both sides compare equal", () => {
    // เดียวกัน but with an extra tone mark artifact that pdftotext sometimes drops on one side only
    expect(normalizeThai("ลูกค้า")).toBe(normalizeThai("ลูกคา"));
  });
});
