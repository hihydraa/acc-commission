export type DepartmentCode = "A7" | "B7" | "68" | "B3" | (string & {});

export interface RawSalesLine {
  docNo: string; // normalized, e.g. IDA726080014-1
  baseDocNo: string; // suffix stripped, e.g. IDA726080014
  date: string; // as printed, dd/mm/yy (Buddhist Era)
  qty: number;
  qty2: number;
  saleValue: number;
  cost: number;
  customerCode: string; // '-' means walk-in cash customer, always excluded
  productCode: string; // from the current product-header context
  productName: string;
  customerNameRaw: string; // display only, never used for matching (spec §3.4)
  sourceLineNo: number;
}

export interface ProductSubtotal {
  productCode: string;
  productName: string;
  /** as printed on the "ยอดรวมผลิตภัณฑ์" line */
  qtyTotal: number;
  valueTotal: number;
  /** sum of the sale lines the parser attributed to this product block
   *  (reset each time a subtotal line closes a block) — compared against
   *  qtyTotal/valueTotal for the checksum (spec §3.6) */
  qtyComputed: number;
  valueComputed: number;
}

export interface CustomerSubtotal {
  customerNameRaw: string;
  /** as printed on the "รวมลูกคา" line */
  qtyTotal: number;
  valueTotal: number;
  qtyComputed: number;
  valueComputed: number;
}

export interface FileGrandTotal {
  customerCount: number | null;
  qtyTotal: number;
  valueTotal: number;
}

export interface ParsedSalesReport {
  departmentCode: DepartmentCode | null;
  lines: RawSalesLine[];
  productSubtotals: ProductSubtotal[];
  customerSubtotals: CustomerSubtotal[];
  grandTotal: FileGrandTotal | null;
  warnings: string[];
}

export interface ChecksumIssue {
  level: "product" | "customer" | "file" | "line";
  key: string;
  message: string;
}

export interface ChecksumResult {
  ok: boolean;
  issues: ChecksumIssue[];
}

export interface ArOutstandingRow {
  baseDocNo: string;
  customerCode: string | null;
  customerNameRaw: string;
  billDate: string | null; // dd/mm/yy as printed
  billAmount: number;
  paidAmount: number;
  outstanding: number;
}

export interface ParsedArReport {
  rows: ArOutstandingRow[];
  asOfDate: string | null;
  warnings: string[];
}

export interface DistanceMasterRow {
  customerCode: string;
  customerName: string;
  distanceKm: number | null; // null when the source says something non-numeric (e.g. "ทางผ่าน")
  distanceRaw: string; // original text, e.g. "ทางผ่าน"
  salesperson: string | null;
}

export interface ParsedDistanceMaster {
  rows: DistanceMasterRow[];
  warnings: string[];
}
