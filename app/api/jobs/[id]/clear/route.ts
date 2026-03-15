import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.job.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    }

    // If trying to uncheck (unlock), only ADMIN can do this
    if (existing.clearStatus) {
      if ((session.user as { role?: string }).role !== "ADMIN") {
        return NextResponse.json(
          { error: "เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถปลดล็อคได้" },
          { status: 403 }
        );
      }
      // Uncheck clearStatus (unlock)
      const job = await prisma.job.update({
        where: { id },
        data: { clearStatus: false },
      });
      return NextResponse.json(job);
    }

    // Check clearStatus (lock)
    const job = await prisma.job.update({
      where: { id },
      data: { clearStatus: true },
    });
    return NextResponse.json(job);
  } catch (error) {
    console.error("Error toggling clear status:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการเปลี่ยนสถานะเคลียร์" },
      { status: 500 }
    );
  }
}
