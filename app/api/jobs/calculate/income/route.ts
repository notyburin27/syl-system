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
    const { jobType, size, factoryLocationId, customerId } = body;

    if (!jobType || !size || !factoryLocationId || !customerId) {
      return NextResponse.json({ income: null });
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
    });

    return NextResponse.json({ income: rate?.income ?? null });
  } catch (error) {
    console.error("Error calculating income:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
