import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { RATE_ROLES } from "@/lib/settingsNav";
import { prisma } from "@/lib/prisma";
import { isTowingJobType } from "@/types/job";

export async function GET() {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  const rates = await prisma.rateDriverWage.findMany({
    include: {
      factoryLocation: { select: { id: true, name: true } },
    },
    orderBy: [{ jobType: "asc" }, { size: "asc" }],
  });
  return NextResponse.json(rates);
}

export async function POST(req: Request) {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  try {
    const { jobType, size, factoryLocationId, driverWage } = await req.json();

    // ทอยตู้/ทอยตู้หนักตั้งอัตราแบบไม่ระบุโรงงานได้ (ข้อมูลเดิม + CSV import) — ลักษณะงานอื่นต้องมีโรงงาน
    const isTowing = isTowingJobType(jobType ?? "");
    if (!jobType || !size || (!isTowing && !factoryLocationId) || driverWage == null) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }

    const resolvedFactoryId = factoryLocationId ?? null;
    const existing = await prisma.rateDriverWage.findFirst({
      where: { jobType, size, factoryLocationId: resolvedFactoryId === null ? { equals: null } : resolvedFactoryId },
    });
    if (existing) return NextResponse.json({ error: "มีข้อมูลนี้อยู่แล้ว" }, { status: 400 });

    const rate = await prisma.rateDriverWage.create({
      data: { jobType, size, factoryLocationId: resolvedFactoryId, driverWage },
      include: {
        factoryLocation: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(rate, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
