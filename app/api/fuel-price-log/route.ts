import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await prisma.fuelPriceLog.findMany({
    orderBy: { effectiveDate: "desc" },
  });
  return NextResponse.json(logs);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { effectiveDate, pricePerLiter, note } = await req.json();

    if (!effectiveDate || pricePerLiter == null) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }

    const existing = await prisma.fuelPriceLog.findUnique({
      where: { effectiveDate: new Date(effectiveDate) },
    });
    if (existing) {
      return NextResponse.json({ error: "มีราคาน้ำมันของวันนี้อยู่แล้ว" }, { status: 400 });
    }

    const log = await prisma.fuelPriceLog.create({
      data: { effectiveDate: new Date(effectiveDate), pricePerLiter, note },
    });
    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
