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

    if (!jobType || !size || (!pickupLocationId && !returnLocationId)) {
      return NextResponse.json({ pickupFee: null, returnFee: null });
    }

    const [pickupRate, returnRate] = await Promise.all([
      pickupLocationId
        ? prisma.rateTransfer.findUnique({
            where: {
              jobType_size_locationId: { jobType, size, locationId: pickupLocationId },
            },
          })
        : null,
      returnLocationId
        ? prisma.rateTransfer.findUnique({
            where: {
              jobType_size_locationId: { jobType, size, locationId: returnLocationId },
            },
          })
        : null,
    ]);

    return NextResponse.json({
      pickupFee: pickupRate ? Number(pickupRate.pickupFee) : null,
      returnFee: returnRate ? Number(returnRate.returnFee) : null,
    });
  } catch (error) {
    console.error("Error calculating estimated transfer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
