import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isAbsorbPickupName,
  isAbsorbedBy,
  type AbsorbJob,
} from "@/lib/utils/towingAbsorb";

const ABSORB_SELECT = {
  id: true,
  jobNumber: true,
  jobDate: true,
  jobType: true,
  size: true,
  driverId: true,
  customerId: true,
  createdAt: true,
  isCancelled: true,
  clearStatus: true,
  isTowingAbsorbed: true,
} as const;

type JobRow = {
  id: string; jobNumber: string; jobDate: Date; jobType: string; size: string | null;
  driverId: string | null; customerId: string | null; createdAt: Date;
  isCancelled: boolean; clearStatus: boolean; isTowingAbsorbed: boolean;
};

const toAbsorbJob = (j: JobRow): AbsorbJob => ({
  id: j.id,
  jobDate: j.jobDate,
  jobType: j.jobType,
  size: j.size,
  driverId: j.driverId,
  customerId: j.customerId,
  createdAt: j.createdAt,
  isCancelled: j.isCancelled,
  clearStatus: j.clearStatus,
});

// POST /api/jobs/[id]/absorb-towing
// คำนวณการดูดซับใหม่ทั้งหมดสำหรับงานหลักใบนี้
// - ทอยตู้ที่เข้าเกณฑ์ → ล้างค่าเที่ยว + ติดธง
// - ทอยตู้ที่เคยติดธงจากใบนี้แต่ไม่เข้าเกณฑ์แล้ว → ปลดธง (ไม่คืนค่าเที่ยว)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "ADMIN") return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });

  const { id } = await params;

  const main = await prisma.job.findUnique({
    where: { id },
    select: { ...ABSORB_SELECT, pickupLocation: { select: { name: true } } },
  });

  if (!main) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  // ทอยตู้ของคนขับคนเดียวกันในวันเดียวกัน — ดึงมาทั้งวันแล้วค่อยกรองด้วย isAbsorbedBy
  const sameDayTowing = main.driverId
    ? await prisma.job.findMany({
        where: {
          driverId: main.driverId,
          jobDate: main.jobDate,
          jobType: { in: ["towing", "towingHeavy"] },
          id: { not: id },
        },
        select: ABSORB_SELECT,
      })
    : [];

  // งานหลักทุกใบของคนขับคนนี้ในวันนี้ที่รับตู้จากคาหาง/รับเช้าเดินทาง
  // ต้องดูทั้งหมด ไม่งั้นการปลดธงจากใบหนึ่งจะไปลบธงที่อีกใบเป็นคนติด
  const sameDayMains = main.driverId
    ? await prisma.job.findMany({
        where: {
          driverId: main.driverId,
          jobDate: main.jobDate,
          jobType: { in: ["inbound", "outbound"] },
        },
        select: { ...ABSORB_SELECT, pickupLocation: { select: { name: true } } },
      })
    : [];

  const absorbers = sameDayMains
    .filter((m) => isAbsorbPickupName(m.pickupLocation?.name))
    .map((m) => toAbsorbJob(m as JobRow));

  const toAbsorb: JobRow[] = [];
  const toRelease: JobRow[] = [];

  for (const t of sameDayTowing as JobRow[]) {
    const tj = toAbsorbJob(t);
    const qualifies = absorbers.some((m) => isAbsorbedBy(tj, m));
    if (qualifies && !t.isTowingAbsorbed) toAbsorb.push(t);
    // ปลดธงเฉพาะใบที่ไม่เข้าเกณฑ์แล้ว และยังแก้ได้ (ไม่เคลียร์/ไม่ยกเลิก)
    if (!qualifies && t.isTowingAbsorbed && !t.clearStatus && !t.isCancelled) toRelease.push(t);
  }

  if (toAbsorb.length > 0 || toRelease.length > 0) {
    await prisma.$transaction([
      ...(toAbsorb.length > 0
        ? [
            prisma.job.updateMany({
              where: { id: { in: toAbsorb.map((t) => t.id) } },
              data: { driverWage: null, isTowingAbsorbed: true },
            }),
          ]
        : []),
      ...(toRelease.length > 0
        ? [
            prisma.job.updateMany({
              where: { id: { in: toRelease.map((t) => t.id) } },
              data: { isTowingAbsorbed: false },
            }),
          ]
        : []),
    ]);
  }

  return NextResponse.json({
    absorbed: toAbsorb.length,
    released: toRelease.length,
    jobNumbers: toAbsorb.map((t) => t.jobNumber),
  });
}
