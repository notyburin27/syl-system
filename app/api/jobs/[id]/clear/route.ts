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
    const existing = await prisma.job.findUnique({
      where: { id },
      include: { transfers: true },
    });

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

    // เคลียร์ได้เมื่อส่วนต่างเป็น 0 เท่านั้น
    // (ยกเว้นงานที่ยกยอดไปงานอื่น หรืองานที่ถูกยกเลิก ซึ่งปิดยอดด้วยวิธีอื่นแล้ว)
    if (!existing.carryOverToJobId && !existing.isCancelled) {
      const driverOverall =
        Number(existing.advance ?? 0) +
        Number(existing.toll ?? 0) +
        Number(existing.pickupFee ?? 0) +
        Number(existing.returnFee ?? 0) +
        Number(existing.liftFee ?? 0) +
        Number(existing.storageFee ?? 0) +
        Number(existing.tire ?? 0) +
        Number(existing.other ?? 0) +
        Number(existing.fuelCashAmount ?? 0);
      const completedTransferSum = existing.transfers
        .filter((t) => t.isCompleted)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const difference =
        driverOverall - Number(existing.actualTransferPrev ?? 0) - completedTransferSum;

      if (Math.round(difference) !== 0) {
        return NextResponse.json(
          { error: "ส่วนต่างต้องเป็น 0 จึงจะเคลียร์งานได้" },
          { status: 400 }
        );
      }
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
