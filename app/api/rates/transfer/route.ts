import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { MASTER_DATA_ROLES } from "@/lib/settingsNav";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const denied = await requireApiRoles(MASTER_DATA_ROLES);
  if (denied) return denied;

  const rates = await prisma.rateTransfer.findMany({
    include: {
      location: { select: { id: true, name: true } },
    },
    orderBy: [{ location: { name: "asc" } }, { jobType: "asc" }, { size: "asc" }],
  });
  return NextResponse.json(rates);
}

export async function POST(req: Request) {
  const denied = await requireApiRoles(MASTER_DATA_ROLES);
  if (denied) return denied;

  try {
    const { jobType, size, locationId, pickupFee, returnFee } = await req.json();

    if (!jobType || !size || !locationId || pickupFee == null || returnFee == null) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }

    const existing = await prisma.rateTransfer.findUnique({
      where: { jobType_size_locationId: { jobType, size, locationId } },
    });
    if (existing) return NextResponse.json({ error: "มีข้อมูลนี้อยู่แล้ว" }, { status: 400 });

    const rate = await prisma.rateTransfer.create({
      data: { jobType, size, locationId, pickupFee, returnFee },
      include: {
        location: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(rate, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
