import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CAN_MANAGE = ["ADMIN", "MANAGER"];

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!CAN_MANAGE.includes((session.user as { role?: string }).role ?? "")) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ลบวันหยุด" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await prisma.companyHoliday.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting holiday:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลบวันหยุด" },
      { status: 500 }
    );
  }
}
