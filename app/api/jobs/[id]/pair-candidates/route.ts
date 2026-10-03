import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPairable, type PairableJob } from "@/lib/utils/jobPairing";
import { isPairableJobType, isPairableSize, isTowingJobType } from "@/types/job";

const PAIR_ROLES = ["ADMIN", "SENIOR_STAFF"];

// GET /api/jobs/[id]/pair-candidates
// หางานที่จับคู่กับใบนี้ได้ — วันเดียวกัน คนขับเดียวกัน ลักษณะงาน/SIZE ตรงกัน
// ขาเข้า/ขาออก ต้องโรงงานเดียวกันด้วย
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!role || !PAIR_ROLES.includes(role)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
  }

  const { id } = await params;
  const isAdmin = role === "ADMIN";

  const job = await prisma.job.findUnique({
    where: { id },
    include: { pairLinkAsPrimary: true, pairLinkAsSecondary: true },
  });

  if (!job) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  // ใบนี้เองต้องจับคู่ได้ก่อน ไม่งั้นไม่ต้องหา candidate
  if (
    !isPairableJobType(job.jobType) ||
    !isPairableSize(job.size) ||
    !job.driverId ||
    job.isCancelled ||
    job.clearStatus ||
    job.pairLinkAsPrimary ||
    job.pairLinkAsSecondary
  ) {
    return NextResponse.json({ jobs: [] });
  }

  // narrow ให้ query แคบที่สุดก่อน แล้วค่อยกรองด้วย checkPairable
  const candidates = await prisma.job.findMany({
    where: {
      id: { not: id },
      jobDate: job.jobDate,
      driverId: job.driverId,
      jobType: job.jobType,
      size: job.size,
      isCancelled: false,
      clearStatus: false,
      pairLinkAsPrimary: null,
      pairLinkAsSecondary: null,
      ...(isTowingJobType(job.jobType)
        ? {}
        : { factoryLocationId: job.factoryLocationId }),
    },
    include: {
      customer: { select: { name: true } },
      factoryLocation: { select: { name: true } },
      pairLinkAsPrimary: { select: { id: true } },
      pairLinkAsSecondary: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const toPairable = (j: {
    id: string; jobDate: Date; jobType: string; size: string | null;
    driverId: string | null; factoryLocationId: string | null;
    isCancelled: boolean; clearStatus: boolean;
    pairLinkAsPrimary?: unknown; pairLinkAsSecondary?: unknown;
  }): PairableJob => ({
    id: j.id,
    jobDate: j.jobDate,
    jobType: j.jobType,
    size: j.size,
    driverId: j.driverId,
    factoryLocationId: j.factoryLocationId,
    isCancelled: j.isCancelled,
    clearStatus: j.clearStatus,
    hasPairLink: !!j.pairLinkAsPrimary || !!j.pairLinkAsSecondary,
  });

  const self = toPairable(job);

  const result = candidates
    .filter((c) => checkPairable(self, toPairable(c)) === null)
    .map((c) => ({
      id: c.id,
      jobNumber: c.jobNumber,
      jobDate: c.jobDate,
      size: c.size,
      customer: c.customer,
      factoryLocation: c.factoryLocation,
      // role ที่ไม่ใช่ ADMIN ไม่เห็นตัวเลขยอด — ตรงกับคอลัมน์การเงินในตาราง
      ...(isAdmin
        ? {
            income: c.income != null ? Number(c.income) : null,
            driverWage: c.driverWage != null ? Number(c.driverWage) : null,
          }
        : {}),
      // ใบที่ createdAt ใหม่กว่าเป็นคนถือยอด
      willBePrimary: c.createdAt > job.createdAt,
    }));

  return NextResponse.json({ jobs: result });
}
