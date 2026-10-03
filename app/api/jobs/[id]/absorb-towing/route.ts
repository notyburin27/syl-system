import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recalcAbsorbForMain } from "@/lib/utils/towingAbsorb";

// POST /api/jobs/[id]/absorb-towing
// คำนวณการดูดซับใหม่ทั้งหมดสำหรับคนขับ+วันของงานหลักใบนี้
// - ทอยตู้ที่เข้าเกณฑ์ → ล้างค่าเที่ยว + ติดธง
// - ทอยตู้ที่เคยติดธงแต่ไม่เข้าเกณฑ์แล้ว → ปลดธง (ไม่คืนค่าเที่ยว)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "ADMIN") return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });

  const { id } = await params;
  const result = await recalcAbsorbForMain(id);
  if (!result) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
  return NextResponse.json(result);
}
