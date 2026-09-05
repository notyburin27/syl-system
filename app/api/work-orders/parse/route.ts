import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readSheetAsObjects } from "@/lib/utils/excel";
import { mapExcelRowToWorkOrder } from "@/lib/utils/workOrderUtils";

// อ่าน/แปลงไฟล์ฝั่ง server เพื่อไม่ต้องส่ง excel parser ไปที่เบราว์เซอร์
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "กรุณาแนบไฟล์" }, { status: 400 });
  }

  try {
    const jsonRows = await readSheetAsObjects(await file.arrayBuffer());

    const trimmedRows = jsonRows.map((row) => {
      const trimmed: Record<string, unknown> = {};
      for (const key of Object.keys(row)) trimmed[key.trim()] = row[key];
      return trimmed;
    });

    const rows = trimmedRows
      .map(mapExcelRowToWorkOrder)
      .filter((r) => r.date || r.customerName || r.booking);

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `อ่านไฟล์ไม่สำเร็จ: ${msg}` }, { status: 400 });
  }
}
