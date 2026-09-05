import ExcelJS from "exceljs";

/**
 * Helper อ่าน/เขียนไฟล์ Excel ด้วย exceljs
 *
 * exceljs คืนค่า cell เป็น object ได้หลายรูป (formula/hyperlink/richText/error)
 * ต่างจาก primitive ที่โค้ดเรียกใช้คาดหวัง — normalizeCellValue จึงแปลงกลับเป็น
 * string | number | boolean | Date | "" ให้เทียบเท่ากับ `defval: ""` ของเดิม
 */
function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return normalizeCellValue(value.result as ExcelJS.CellValue); // formula
    if ("text" in value) return value.text; // hyperlink
    if ("richText" in value) return value.richText.map((t) => t.text).join(""); // rich text
    if ("error" in value) return ""; // #REF! ฯลฯ
  }
  return value;
}

async function firstWorksheet(buffer: ArrayBuffer): Promise<ExcelJS.Worksheet | undefined> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets[0];
}

/** อ่าน sheet แรกเป็น array ของ array (เทียบเท่า sheet_to_json({ header: 1, defval: "" })) */
export async function readSheetAsRows(buffer: ArrayBuffer): Promise<unknown[][]> {
  const ws = await firstWorksheet(buffer);
  if (!ws) return [];

  const rows: unknown[][] = [];
  const colCount = ws.columnCount;
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: unknown[] = [];
    for (let c = 1; c <= colCount; c++) cells.push(normalizeCellValue(row.getCell(c).value));
    rows.push(cells);
  });

  // ตัดแถวว่างท้ายไฟล์ที่ exceljs นับรวมมาด้วย
  while (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();
  return rows;
}

/** อ่าน sheet แรกเป็น array ของ object โดยใช้แถวแรกเป็น key (เทียบเท่า sheet_to_json({ defval: "" })) */
export async function readSheetAsObjects(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const rows = await readSheetAsRows(buffer);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => String(h ?? ""));
  return rows.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      if (header) obj[header] = row[i] ?? "";
    });
    return obj;
  });
}

/** เขียน array ของ array เป็นไฟล์ xlsx (เทียบเท่า aoa_to_sheet + write) */
export async function writeRowsToBuffer(rows: unknown[][], sheetName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName);
  for (const row of rows) ws.addRow(row as ExcelJS.CellValue[]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
