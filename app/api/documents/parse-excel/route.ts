import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readSheetAsRows } from "@/lib/utils/excel";

// อ่านไฟล์ฝั่ง server เพื่อไม่ต้องส่ง excel parser ไปที่เบราว์เซอร์
// คืน shape เดิมของ readExcelFile: { originalRowIndex, rowIndex, data }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "กรุณาแนบไฟล์" }, { status: 400 });
  }

  try {
    const jsonData = await readSheetAsRows(await file.arrayBuffer());

    if (jsonData.length < 2) {
      return NextResponse.json(
        { error: "ไฟล์ Excel ต้องมีอย่างน้อยแถวหัวตารางและข้อมูล 1 แถว" },
        { status: 400 },
      );
    }

    const headers = jsonData[0] as string[];
    const rows = jsonData.slice(1);

    const parsedData = rows
      .map((row, index) => {
        const rowData: Record<string, unknown> = {};
        headers.forEach((header, colIndex) => {
          if (header && row[colIndex] !== undefined) rowData[header] = row[colIndex];
        });
        return { originalRowIndex: index + 2, data: rowData };
      })
      .filter((item) => {
        const dateValue = item.data["วันที่"];
        return dateValue !== undefined && dateValue !== "" && dateValue !== null;
      })
      .map((item, filteredIndex) => ({ ...item, rowIndex: filteredIndex + 1 }));

    return NextResponse.json({ rows: parsedData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `อ่านไฟล์ไม่สำเร็จ: ${msg}` }, { status: 400 });
  }
}
