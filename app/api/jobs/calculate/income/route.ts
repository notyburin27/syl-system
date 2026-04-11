import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { jobType, size, factoryLocationId, customerId, jobDate } = body;

    if (!jobType || !size || !factoryLocationId || !customerId) {
      return NextResponse.json({ income: null, fuelPrice: null });
    }

    const rate = await prisma.rateIncome.findUnique({
      where: {
        jobType_size_factoryLocationId_customerId: {
          jobType,
          size,
          factoryLocationId,
          customerId,
        },
      },
      include: {
        fuelSurcharges: { orderBy: { fuelPriceMin: "asc" } },
      },
    });

    if (!rate) {
      return NextResponse.json({ income: null, fuelPrice: null });
    }

    const baseIncome = Number(rate.income);

    // ดึงราคาน้ำมัน ณ วันที่งาน (วันล่าสุดที่ <= jobDate)
    let fuelPrice: number | null = null;
    let surcharge = 0;

    if (jobDate && rate.fuelSurcharges.length > 0) {
      const targetDate = new Date(jobDate);
      const fuelLog = await prisma.fuelPriceLog.findFirst({
        where: { effectiveDate: { lte: targetDate } },
        orderBy: { effectiveDate: "desc" },
      });

      if (fuelLog) {
        fuelPrice = Number(fuelLog.pricePerLiter);
        const matched = rate.fuelSurcharges.find(
          (s) => fuelPrice! >= Number(s.fuelPriceMin) && fuelPrice! < Number(s.fuelPriceMax)
        );
        if (matched) surcharge = Number(matched.surcharge);
      }
    }

    return NextResponse.json({
      income: baseIncome + surcharge,
      baseIncome,
      surcharge,
      fuelPrice,
    });
  } catch (error) {
    console.error("Error calculating income:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
