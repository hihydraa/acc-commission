/**
 * Server-only PDF -> text extraction. Kept separate from the line parsers
 * so those stay pure-string-in/JSON-out and unit-testable without a real
 * PDF binary (spec §9 step 1: "Parser + checksum + unit test ... ยังไม่ต้องมี UI").
 *
 * `pdf-parse` is the primary extractor (pure-JS, no poppler/pdftotext
 * binary dependency — safe on Vercel). It bundles a very old (2018-era)
 * copy of pdf.js internally with weak error recovery, though, and one real
 * file from this project ("เทรลเลอร์เบอร์68") threw
 * `UnknownErrorException: bad XRef entry` — a malformed-but-common PDF
 * structural issue that a modern PDF engine recovers from automatically by
 * rebuilding the xref table. So: try pdf-parse first (it's what the other
 * 3 real files were validated against), and only fall back to pdfjs-dist
 * directly — with `stopAtErrors: false` — if pdf-parse throws.
 */
import pdfParse from "pdf-parse";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return result.text;
  } catch (primaryErr) {
    try {
      return await extractPdfTextWithPdfjs(buffer);
    } catch (fallbackErr) {
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(
        `อ่าน PDF ไม่สำเร็จทั้ง 2 วิธี — pdf-parse: ${primaryMsg} | pdfjs-dist: ${fallbackMsg}`
      );
    }
  }
}

async function extractPdfTextWithPdfjs(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    stopAtErrors: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    // mirrors pdf-parse's own render_page join behavior (spec §9 parity):
    // same Y-transform -> same line, different Y -> new line.
    let lastY: number | undefined;
    let pageText = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY === undefined || lastY === y) {
        pageText += item.str;
      } else {
        pageText += "\n" + item.str;
      }
      lastY = y;
    }
    pageTexts.push(pageText);
  }
  return pageTexts.join("\n\n");
}
