import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/rates/income/surcharge?rateIncomeId=xxx
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rateIncomeId = searchParams.get("rateIncomeId");

  if (!rateIncomeId) {
    return NextResponse.json({ error: "กรุณาระบุ rateIncomeId" }, { status: 400 });
  }

  const surcharges = await prisma.rateIncomeFuelSurcharge.findMany({
    where: { rateIncomeId },
    orderBy: { fuelPriceMin: "asc" },
  });
  return NextResponse.json(surcharges);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { rateIncomeId, fuelPriceMin, fuelPriceMax, surcharge } = await req.json();

    if (!rateIncomeId || fuelPriceMin == null || fuelPriceMax == null || surcharge == null) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }

    if (Number(fuelPriceMin) >= Number(fuelPriceMax)) {
      return NextResponse.json({ error: "ราคาต่ำสุดต้องน้อยกว่าราคาสูงสุด" }, { status: 400 });
    }

    const record = await prisma.rateIncomeFuelSurcharge.create({
      data: { rateIncomeId, fuelPriceMin, fuelPriceMax, surcharge },
    });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
