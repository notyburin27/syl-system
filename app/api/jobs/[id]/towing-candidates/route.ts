import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/jobs/[id]/towing-candidates?slot=1|2
// หา towing jobs ที่ eligible สำหรับลิ้งกับ main job
// slot=1: รับตู้ (xxx→SYL) — pickupLocation != SYL, returnLocation = SYL
// slot=2: คืนตู้ (SYL→xxx) — pickupLocation = SYL, returnLocation != SYL
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const slot = searchParams.get("slot"); // "1" or "2"

  if (slot !== "1" && slot !== "2") {
    return NextResponse.json({ error: "slot ต้องเป็น 1 หรือ 2" }, { status: 400 });
  }

  const mainJob = await prisma.job.findUnique({
    where: { id },
    include: { pickupLocation: true, returnLocation: true },
  });

  if (!mainJob) {
    return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
  }

  if (!mainJob.driverId) {
    return NextResponse.json([]);
  }

  // หา SYL location
  const sylLocation = await prisma.location.findFirst({
    where: { name: "SYL" },
  });

  if (!sylLocation) {
    return NextResponse.json([]);
  }

  // towing jobs ต้อง: driver เดียวกัน, วันที่ >= mainJob.jobDate, ยังไม่มี main ผูก
  const baseCandidates = await prisma.job.findMany({
    where: {
      jobType: "towing",
      driverId: mainJob.driverId,
      jobDate: { gte: mainJob.jobDate },
      towingLinkAsTowing: null, // ยังไม่มีใครผูก
      id: { not: id },
    },
    include: {
      pickupLocation: true,
      returnLocation: true,
    },
    orderBy: { jobDate: "asc" },
  });

  // filter ตาม slot
  const candidates = baseCandidates.filter((j) => {
    if (slot === "1") {
      // รับตู้: มาส่งที่ SYL (return = SYL, pickup != SYL)
      return (
        j.returnLocationId === sylLocation.id &&
        j.pickupLocationId !== sylLocation.id
      );
    } else {
      // คืนตู้: ออกจาก SYL (pickup = SYL, return != SYL)
      return (
        j.pickupLocationId === sylLocation.id &&
        j.returnLocationId !== sylLocation.id
      );
    }
  });

  return NextResponse.json(
    candidates.map((j) => ({
      id: j.id,
      jobNumber: j.jobNumber,
      jobDate: j.jobDate,
      size: j.size,
      pickupLocation: j.pickupLocation,
      returnLocation: j.returnLocation,
    }))
  );
}
