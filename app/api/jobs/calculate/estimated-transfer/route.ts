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
    const { jobType, size, locationId } = body;

    if (!jobType || !size || !locationId) {
      return NextResponse.json({ pickupFee: null, returnFee: null });
    }

    const rate = await prisma.rateTransfer.findUnique({
      where: {
        jobType_size_locationId: { jobType, size, locationId },
      },
    });

    if (!rate) {
      return NextResponse.json({ pickupFee: null, returnFee: null });
    }

    return NextResponse.json({
      pickupFee: Number(rate.pickupFee),
      returnFee: Number(rate.returnFee),
    });
  } catch (error) {
    console.error("Error calculating estimated transfer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
