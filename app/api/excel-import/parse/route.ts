import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readSheetAsRows } from "@/lib/utils/excel";

/**
 * Parse ไฟล์ Excel ทั่วไปเป็น rows ของ object โดยใช้แถวแรกเป็นหัวคอลัมน์
 * — ทำฝั่ง server เพื่อไม่ต้องโหลด exceljs (~400KB) ลงเครื่องผู้ใช้
 *
 * body (multipart): file, headers (csv ของชื่อ field), labels (csv ของ label ภาษาไทย)
 * หัวคอลัมน์ในไฟล์จับคู่ได้ทั้งชื่อ field และ label
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });

  const headers = String(formData.get("headers") ?? "").split(",").filter(Boolean);
  const labels = String(formData.get("labels") ?? "").split(",");

  const labelToKey = new Map<string, string>();
  headers.forEach((h, i) => {
    labelToKey.set(h, h);
    if (labels[i]) labelToKey.set(labels[i], h);
  });

  let sheetRows: unknown[][];
  try {
    sheetRows = await readSheetAsRows(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "อ่านไฟล์ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx" }, { status: 400 });
  }

  if (sheetRows.length < 2) return NextResponse.json({ rows: [] });

  const fileHeaders = sheetRows[0].map((h) => String(h ?? "").trim());
  const keys = fileHeaders.map((h) => labelToKey.get(h) ?? h);

  const rows = sheetRows
    .slice(1)
    .map((values) => {
      const row: Record<string, string | undefined> = {};
      keys.forEach((key, idx) => {
        if (!key) return;
        const raw = values[idx];
        const value = raw === undefined || raw === null ? "" : String(raw).trim();
        row[key] = value || undefined;
      });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v !== undefined && v !== ""));

  return NextResponse.json({ rows });
}
