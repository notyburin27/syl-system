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
    const { size, factoryLocationId } = body;

    if (!size || !factoryLocationId) {
      return NextResponse.json({ driverWage: 0 });
    }

    // Find latest job with matching size + factory
    const latestJob = await prisma.job.findFirst({
      where: {
        size,
        factoryLocationId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        driverWage: true,
      },
    });

    if (!latestJob) {
      return NextResponse.json({ driverWage: 0 });
    }

    return NextResponse.json({ driverWage: Number(latestJob.driverWage || 0) });
  } catch (error) {
    console.error("Error calculating driver wage:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
