import ExcelJS from "exceljs";
import type { DriverMonthlySummary } from "@/types/job";
import { toThaiMonthYear, toPayDate, toThaiShortDate } from "./thaiDate";

export interface DriverSheetData {
  driverName: string;
  vehicleNumber: string | null;
  /** เดือนล่าสุดก่อน — บล็อกซ้ายสุดใน sheet */
  months: DriverMonthlySummary[];
}

// ใช้ Angsana New ให้ตรงกับ jobsExcelGenerator ซึ่งเป็น export หลักของโปรเจกต์
// (ไฟล์ต้นฉบับที่ธุรกิจใช้ตั้งเป็น Courier New ซึ่งไม่มี glyph ไทย เลย fallback เพี้ยน)
const FONT = { name: "Angsana New", size: 16, bold: true } as const;
const RED = "FFFF0000";
const GREEN = "FF00B050";
const FILL_ORANGE = "FFFFC000";
const FILL_GREEN = "FF92D050";
const FILL_YELLOW = "FFFFFF00";
const FILL_PINK = "FFFCE4D6";
const MONEY_FMT = "#,##0.00";

/**
 * ระยะห่างระหว่างบล็อก = 7 คอลัมน์ (ยืนยันจากไฟล์ต้นฉบับ: label บล็อกแรกอยู่ B=2, บล็อกสองอยู่ I=9)
 * ภายในบล็อก: offset 0 = label, offset 2 = ค่า, offset 3 = หน่วย
 */
const BLOCK_STRIDE = 7;
const LABEL_OFFSET = 0;
const VALUE_OFFSET = 2;
const UNIT_OFFSET = 3;

/** ความกว้างคอลัมน์ 7 คอลัมน์ของ 1 บล็อก (B,C,D,E,F,G,H ของบล็อกแรก) */
const BLOCK_WIDTHS = [35.5, 2.5, 21.5, 10.83, 3, 10.83, 2.83];

/** Excel ห้าม []:*?/\ ในชื่อ sheet และจำกัด 31 ตัวอักษร */
function sanitizeSheetName(name: string, used: Set<string>): string {
  let safe = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  if (used.has(safe)) {
    let i = 2;
    while (used.has(`${safe.slice(0, 28)} ${i}`)) i++;
    safe = `${safe.slice(0, 28)} ${i}`;
  }
  used.add(safe);
  return safe;
}

function buildMonthBlock(
  ws: ExcelJS.Worksheet,
  s: DriverMonthlySummary,
  startCol: number
) {
  // startCol คือคอลัมน์ label (B ของบล็อกแรก = 2)
  const L = startCol + LABEL_OFFSET;   // label
  const V = startCol + VALUE_OFFSET;   // ค่า
  const U = startCol + UNIT_OFFSET;    // หน่วย
  const colLetter = (c: number) => ws.getColumn(c).letter;
  const vCol = colLetter(V);

  // ค่ากรอกมือชนะ prefill เสมอ — ตรงกับที่หน้าสรุปแสดง
  const carryTrips = s.carryTrips ?? (s.carryTripsPrefill || null);
  const otherExpenses = s.otherExpenses ?? (s.otherExpensesPrefill || null);
  const isGas = s.isGasVehicle;

  const set = (
    row: number,
    col: number,
    value: ExcelJS.CellValue,
    opts: {
      color?: string;
      fill?: string;
      fmt?: string;
      align?: "left" | "right" | "center";
    } = {}
  ) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = { ...FONT, ...(opts.color ? { color: { argb: opts.color } } : {}) };
    if (opts.fill) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    }
    if (opts.fmt) cell.numFmt = opts.fmt;
    // จัดกลางแนวตั้งทุก cell — ไม่ใช่เฉพาะที่ระบุ align มา
    // ไม่งั้นช่องตัวเลขจะจมลงล่างขณะที่ช่องหน่วยอยู่กลาง (แถวสูง 24)
    cell.alignment = opts.align
      ? { horizontal: opts.align, vertical: "middle" }
      : { vertical: "middle" };
    return cell;
  };

  // หัวบล็อก
  set(2, L, `เงินเดือน: ${toThaiMonthYear(s.month)}`, { align: "center" });
  set(2, V, `(${toPayDate(s.month)})`, { align: "center" });
  set(2, U, s.groupName ?? "", { fill: FILL_ORANGE, align: "center" });

  set(3, L, s.vehicleNumber ?? "", { align: "right" });
  set(3, V, s.driverName, { align: "left" });
  ws.mergeCells(3, V, 3, U);

  const startText = toThaiShortDate(s.startDate);
  if (startText) {
    set(4, V, `เริ่มขับรับรถ ${startText}`, { align: "center" });
    ws.mergeCells(4, V, 4, U);
  }

  // จำนวนวัน/เที่ยว
  // เดิมมีแถว "ลาหยุด" แถวเดียว — แยกเป็นลาป่วย/ลากิจ และเพิ่ม "มีงานไม่ไปงาน"
  // แถวด้านล่างทั้งหมดเลื่อนลง 3 แถว สูตรจึงต้องอ้างเลขแถวใหม่ด้วย
  set(5, L, "ลาป่วย", { color: RED, align: "right" });
  set(5, V, s.sickLeaveDays || null, { color: RED, align: "center" });
  set(5, U, "วัน", { color: RED, align: "left" });

  set(6, L, "ลากิจ", { color: RED, align: "right" });
  set(6, V, s.personalLeaveDays || null, { color: RED, align: "center" });
  set(6, U, "วัน", { color: RED, align: "left" });

  set(7, L, "ซ่อมรถ", { align: "right" });
  set(7, V, s.repairDays || null, { align: "center" });
  set(7, U, "วัน", { align: "left" });

  set(8, L, "งาน", { color: GREEN, align: "right" });
  set(8, V, s.jobTrips || null, { color: GREEN, align: "center" });
  set(8, U, "เที่ยว", { color: GREEN, align: "left" });

  set(9, L, "ทอย", { color: GREEN, align: "right" });
  set(9, V, s.towingTrips || null, { color: GREEN, align: "center" });
  set(9, U, "เที่ยว", { color: GREEN, align: "left" });

  // แบก — ค่ากรอกมือ ถ้ายังไม่กรอกใช้จำนวนงานที่ติ๊กแบกในเดือนนั้น
  set(10, L, "แบก", { color: GREEN, align: "right" });
  set(10, V, carryTrips, { color: GREEN, align: "center" });
  set(10, U, "เที่ยว", { color: GREEN, align: "left" });

  // ค้างคืน — นับจาก job ประเภท "ไม่มีงาน" เหตุผล overnight (เหมือนซ่อมรถ)
  set(11, L, "ค้างคืน", { align: "right" });
  set(11, V, s.overnightDays || null, { align: "center" });
  set(11, U, "วัน", { align: "left" });

  set(12, L, "มีงานไม่ไปงาน", { align: "right" });
  set(12, V, s.noShowDays || null, { align: "center" });
  set(12, U, "วัน", { align: "left" });

  // รายได้ + สัดส่วน
  set(14, L, "รายได้", { align: "right" });
  set(14, V, s.income, { fmt: MONEY_FMT });
  set(14, U, "บาท", { align: "left" });

  set(15, L, 0.55, { fmt: "0%", align: "right" });
  set(15, V, { formula: `${vCol}14*55%` }, { fmt: MONEY_FMT });
  set(15, U, "บาท", { align: "left" });

  set(16, L, 0.45, { fmt: "0%", align: "right" });
  set(16, V, { formula: `${vCol}14*45%` }, { fmt: MONEY_FMT });
  set(16, U, "บาท", { align: "left" });

  // น้ำมัน — รถก๊าซไม่มีค่าน้ำมัน ปล่อยว่างทั้งบล็อกและไม่ใส่สูตร
  set(18, L, "ราคาน้ำมันต่อลิตร", { align: "right" });
  set(18, V, isGas ? null : s.fuelPricePerLiter, { fmt: MONEY_FMT });
  set(18, U, "บาท", { align: "left" });

  set(19, L, "จำนวนน้ำมัน", { align: "right" });
  set(19, V, isGas ? null : s.fuelLiters, { fmt: MONEY_FMT });
  set(19, U, "ลิตร", { align: "left" });

  set(20, L, "รวมใช้น้ำมัน", { align: "right" });
  set(20, V, isGas ? null : { formula: `${vCol}18*${vCol}19` }, { fmt: MONEY_FMT });
  set(20, U, "บาท", { align: "left" });

  set(22, L, "45% - ราคาน้ำมัน", { fill: FILL_PINK, align: "right" });
  set(22, V, isGas ? null : { formula: `${vCol}16-${vCol}20` }, { fill: FILL_PINK, fmt: MONEY_FMT });
  set(22, U, "บาท", { fill: FILL_PINK, align: "left" });

  // ค่าตอบแทน
  set(24, L, "ค่าเที่ยว", { align: "right" });
  set(24, V, s.driverWage, { fmt: MONEY_FMT });
  set(24, U, "บาท", { align: "left" });

  set(25, L, "เงินเดือน", { align: "right" });
  set(25, V, s.baseSalary, { fmt: MONEY_FMT });
  set(25, U, "บาท", { align: "left" });

  // หัก น้ำมัน/หยุด — ค่าที่กรอกไว้ในหน้าสรุปงาน
  set(26, L, "หัก น้ำมัน/หยุด", { color: RED, align: "right" });
  set(26, V, s.fuelDeduction, { color: RED, fmt: MONEY_FMT });
  set(26, U, "บาท", { color: RED, align: "left" });

  set(28, L, "รวม", { align: "right" });
  set(28, V, { formula: `${vCol}24+${vCol}25+${vCol}26` }, { fmt: MONEY_FMT });
  set(28, U, "บาท", { align: "left" });

  // สรุปให้เงินเดือนคนรถ — ค่าที่กรอกไว้ (ต้นฉบับเป็นค่าคงที่ ไม่ใช่สูตร)
  set(30, L, "สรุปให้เงินเดือนคนรถ", { fill: FILL_GREEN, align: "right" });
  set(30, V, s.driverPayout, { fill: FILL_GREEN, fmt: MONEY_FMT });
  set(30, U, "บาท", { fill: FILL_GREEN, align: "left" });

  // ค่าใช้จ่ายต่างๆ — ค่ากรอกมือ ถ้ายังไม่กรอกใช้ผลรวมจากงาน (ทางด่วน+ยกตู้+ฝากตู้+ยาง+อื่นๆ)
  set(32, L, "ค่าใช้จ่ายต่างๆ", { color: RED, align: "right" });
  set(32, V, otherExpenses, { color: RED, fmt: MONEY_FMT });
  set(32, U, "บาท", { color: RED, align: "left" });

  // ยอดคงเหลือของบริษัท — รถก๊าซไม่มีบล็อกน้ำมัน จึงเว้นว่างตามหน้าสรุป
  set(34, L, "ยอดคงเหลือของบริษัท", { fill: FILL_YELLOW, align: "right" });
  set(
    34,
    V,
    isGas ? null : { formula: `${vCol}14-${vCol}20-${vCol}30-${vCol}32` },
    { fill: FILL_YELLOW, fmt: MONEY_FMT }
  );
  set(34, U, "บาท", { fill: FILL_YELLOW, align: "left" });
}

export async function generateSummaryExcel(sheets: DriverSheetData[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const usedNames = new Set<string>();

  for (const data of sheets) {
    const rawName = `${data.driverName}${data.vehicleNumber ? ` ${data.vehicleNumber}` : ""}`;
    const ws = wb.addWorksheet(sanitizeSheetName(rawName, usedNames));

    // ความสูงแถวคงที่ทั้ง sheet
    for (let r = 1; r <= 35; r++) ws.getRow(r).height = 24;

    // บล็อกที่ n เริ่มที่คอลัมน์ 2 + n*7 (B=2, I=9, P=16, ...)
    data.months.forEach((summary, idx) => {
      const startCol = 2 + idx * BLOCK_STRIDE;
      BLOCK_WIDTHS.forEach((w, i) => {
        ws.getColumn(startCol + i).width = w;
      });
      buildMonthBlock(ws, summary, startCol);
    });
  }

  // ไม่มี sheet เลย (ไม่มีคนขับตรงเงื่อนไข) — ใส่ sheet ว่างกัน exceljs error
  if (wb.worksheets.length === 0) {
    wb.addWorksheet("ไม่มีข้อมูล").getCell("B2").value = "ไม่พบคนขับตามเงื่อนไขที่เลือก";
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
