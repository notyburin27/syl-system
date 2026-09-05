import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as XLSX from "xlsx";
import { parseFuelRateRows } from "@/lib/utils/fuelRateExcel";

// แยกจาก /import เพื่อให้ modal แสดง preview ให้ผู้ใช้ตรวจก่อนบันทึกจริง
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "กรุณาแนบไฟล์" }, { status: 400 });
  }

  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = sheet ? (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][]) : [];
    return NextResponse.json(parseFuelRateRows(rows));
  } catch {
    return NextResponse.json({ error: "อ่านไฟล์ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx" }, { status: 400 });
  }
}
