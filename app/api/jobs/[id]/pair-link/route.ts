import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPairable, type PairableJob } from "@/lib/utils/jobPairing";

const PAIR_ROLES = ["ADMIN", "SENIOR_STAFF"];

const PAIR_SELECT = {
  id: true,
  jobNumber: true,
  jobDate: true,
  jobType: true,
  size: true,
  driverId: true,
  factoryLocationId: true,
  isCancelled: true,
  clearStatus: true,
  createdAt: true,
  pairLinkAsPrimary: { select: { id: true } },
  pairLinkAsSecondary: { select: { id: true } },
} as const;

type JobRow = {
  id: string; jobNumber: string; jobDate: Date; jobType: string; size: string | null;
  driverId: string | null; factoryLocationId: string | null;
  isCancelled: boolean; clearStatus: boolean; createdAt: Date;
  pairLinkAsPrimary: { id: string } | null;
  pairLinkAsSecondary: { id: string } | null;
};

const toPairable = (j: JobRow): PairableJob => ({
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

async function guard() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!role || !PAIR_ROLES.includes(role)) {
    return { error: NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 }) };
  }
  return { error: null };
}

// POST /api/jobs/[id]/pair-link — จับคู่งาน
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }
  const otherJobId =
    body && typeof body === "object" && "otherJobId" in body
      ? (body as { otherJobId?: unknown }).otherJobId
      : undefined;
  if (!otherJobId || typeof otherJobId !== "string") {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  const [a, b] = await Promise.all([
    prisma.job.findUnique({ where: { id }, select: PAIR_SELECT }),
    prisma.job.findUnique({ where: { id: otherJobId }, select: PAIR_SELECT }),
  ]);

  if (!a || !b) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  const reason = checkPairable(toPairable(a as JobRow), toPairable(b as JobRow));
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });

  // ใบที่สร้างทีหลังถือยอด
  const [primary, secondary] = a.createdAt > b.createdAt ? [a, b] : [b, a];

  try {
    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.jobPairLink.create({
        data: { primaryJobId: primary.id, secondaryJobId: secondary.id },
      });
      // ล้างยอดทั้งสองใบ — ยอดเดิมเป็นอัตราตู้เดียว ใช้กับคู่ไม่ได้
      // primary ต้องว่างด้วย ไม่งั้นปุ่ม "ดึงข้อมูล" จะข้ามมัน (เติมเฉพาะช่องที่ null)
      // แล้วทริปนี้จะค้างอยู่ที่ราคาตู้เดียวตลอดไป
      // (update ตรงนี้ไม่ผ่าน PATCH endpoint จึงไม่ติด guard ของตัวเอง)
      await tx.job.updateMany({
        where: { id: { in: [primary.id, secondary.id] } },
        data: { income: null, driverWage: null },
      });
      return created;
    });

    return NextResponse.json({
      id: link.id,
      primaryJobId: link.primaryJobId,
      secondaryJobId: link.secondaryJobId,
      createdAt: link.createdAt,
      primaryJobNumber: primary.jobNumber,
      secondaryJobNumber: secondary.jobNumber,
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "งานนี้ถูกจับคู่ไปแล้ว" }, { status: 409 });
    }
    console.error("pair-link POST error:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

// DELETE /api/jobs/[id]/pair-link — ปลดคู่
// ไม่คืนยอดให้ secondary และไม่ล้างยอด primary — ผู้ใช้จัดการเอง
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      clearStatus: true,
      pairLinkAsPrimary: { select: { id: true, secondaryJob: { select: { clearStatus: true } } } },
      pairLinkAsSecondary: { select: { id: true, primaryJob: { select: { clearStatus: true } } } },
    },
  });

  if (!job) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  const link = job.pairLinkAsPrimary ?? job.pairLinkAsSecondary;
  if (!link) return NextResponse.json({ error: "งานนี้ยังไม่ได้จับคู่" }, { status: 400 });

  const otherCleared =
    job.pairLinkAsPrimary?.secondaryJob.clearStatus ??
    job.pairLinkAsSecondary?.primaryJob.clearStatus ??
    false;

  if (job.clearStatus || otherCleared) {
    return NextResponse.json({ error: "งานที่เคลียร์แล้วปลดคู่ไม่ได้" }, { status: 400 });
  }

  await prisma.jobPairLink.delete({ where: { id: link.id } });
  return NextResponse.json({ ok: true });
}
