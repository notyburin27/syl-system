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
    const { jobType, size, pickupLocationId, returnLocationId } = body;

    if (!jobType || !size || !pickupLocationId || !returnLocationId) {
      return NextResponse.json({ estimatedTransfer: null });
    }

    const rate = await prisma.rateTransfer.findUnique({
      where: {
        jobType_size_pickupLocationId_returnLocationId: {
          jobType,
          size,
          pickupLocationId,
          returnLocationId,
        },
      },
    });

    if (!rate) {
      return NextResponse.json({ estimatedTransfer: null });
    }

    const pickupFee = Number(rate.pickupFee);
    const returnFee = Number(rate.returnFee);
    const estimatedTransfer = pickupFee + returnFee;

    return NextResponse.json({ estimatedTransfer, pickupFee, returnFee });
  } catch (error) {
    console.error("Error calculating estimated transfer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
