/**
 * Server-only PDF -> text extraction. Kept separate from the line parsers
 * so those stay pure-string-in/JSON-out and unit-testable without a real
 * PDF binary (spec §9 step 1: "Parser + checksum + unit test ... ยังไม่ต้องมี UI").
 *
 * `pdf-parse` is a pure-JS text extractor (no poppler/pdftotext binary
 * dependency), which is what makes it safe to run inside a Vercel
 * serverless/edge-adjacent function without a custom binary layer.
 */
import pdfParse from "pdf-parse";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}
