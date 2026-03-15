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

    if (!jobType || !size) {
      return NextResponse.json({ estimatedTransfer: 0 });
    }

    // Find latest job with matching criteria
    const latestJob = await prisma.job.findFirst({
      where: {
        jobType,
        size,
        ...(pickupLocationId ? { pickupLocationId } : {}),
        ...(returnLocationId ? { returnLocationId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        pickupFee: true,
        returnFee: true,
      },
    });

    if (!latestJob) {
      return NextResponse.json({ estimatedTransfer: 0 });
    }

    const estimatedTransfer =
      Number(latestJob.pickupFee || 0) + Number(latestJob.returnFee || 0);

    return NextResponse.json({ estimatedTransfer });
  } catch (error) {
    console.error("Error calculating estimated transfer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
