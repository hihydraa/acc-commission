import ExcelJS from "exceljs";

/**
 * Converts the first worksheet of an .xlsx file into pseudo-`pdftotext
 * -layout` text (cells joined with double spaces) so `distanceMasterText`
 * can parse either a PDF or an Excel export of the distance/salesperson
 * master file (spec §2.2 allows either format for that one file).
 */
export async function extractXlsxAsText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return "";

  const lines: string[] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      if (value === null || value === undefined) return;
      cells.push(String(typeof value === "object" && "text" in value ? (value as { text: string }).text : value));
    });
    if (cells.length > 0) lines.push(cells.join("  "));
  });
  return lines.join("\n");
}
