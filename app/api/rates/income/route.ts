import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { RATE_ROLES } from "@/lib/settingsNav";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  const [rates, fuelLog] = await Promise.all([
    prisma.rateIncome.findMany({
      include: {
        factoryLocation: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        fuelSurcharges: { orderBy: { fuelPriceMin: "asc" } },
      },
      orderBy: [{ customer: { name: "asc" } }, { factoryLocation: { name: "asc" } }, { jobType: "asc" }, { size: "asc" }],
    }),
    prisma.fuelPriceLog.findFirst({
      where: { effectiveDate: { lte: new Date() } },
      orderBy: { effectiveDate: "desc" },
    }),
  ]);

  return NextResponse.json({
    rates,
    fuelPrice: fuelLog
      ? { pricePerLiter: Number(fuelLog.pricePerLiter), effectiveDate: fuelLog.effectiveDate }
      : null,
  });
}

export async function POST(req: Request) {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  try {
    const { jobType, size, factoryLocationId, customerId, income } = await req.json();

    if (!jobType || !size || !factoryLocationId || !customerId || income == null) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }

    const existing = await prisma.rateIncome.findUnique({
      where: { jobType_size_factoryLocationId_customerId: { jobType, size, factoryLocationId, customerId } },
    });
    if (existing) return NextResponse.json({ error: "มีข้อมูลนี้อยู่แล้ว" }, { status: 400 });

    const rate = await prisma.rateIncome.create({
      data: { jobType, size, factoryLocationId, customerId, income },
      include: {
        factoryLocation: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(rate, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
