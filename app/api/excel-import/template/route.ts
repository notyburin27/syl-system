import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeRowsToBuffer } from "@/lib/utils/excel";

/**
 * สร้างไฟล์ template .xlsx สำหรับ import — หัวคอลัมน์เป็น label ภาษาไทย
 * ตามด้วยแถวตัวอย่าง (ถ้ามี)
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const labels = (searchParams.get("labels") ?? "").split(",").filter(Boolean);
  const fileName = searchParams.get("fileName") || "import_template.xlsx";

  let examples: string[][] = [];
  try {
    const raw = searchParams.get("examples");
    if (raw) examples = JSON.parse(raw) as string[][];
  } catch {
    examples = [];
  }

  const buf = await writeRowsToBuffer([labels, ...examples], "template");

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`,
    },
  });
}
