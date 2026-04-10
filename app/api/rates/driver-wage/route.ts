import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rates = await prisma.rateDriverWage.findMany({
    include: {
      factoryLocation: { select: { id: true, name: true } },
    },
    orderBy: [{ jobType: "asc" }, { size: "asc" }],
  });
  return NextResponse.json(rates);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { jobType, size, factoryLocationId, driverWage } = await req.json();

    if (!jobType || !size || !factoryLocationId || driverWage == null) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }

    const existing = await prisma.rateDriverWage.findUnique({
      where: { jobType_size_factoryLocationId: { jobType, size, factoryLocationId } },
    });
    if (existing) return NextResponse.json({ error: "มีข้อมูลนี้อยู่แล้ว" }, { status: 400 });

    const rate = await prisma.rateDriverWage.create({
      data: { jobType, size, factoryLocationId, driverWage },
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
