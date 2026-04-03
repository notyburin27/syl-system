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
    const {
      jobType,
      size,
      pickupLocationId,
      factoryLocationId,
      returnLocationId,
      customerId,
    } = body;

    if (!jobType || !size || !pickupLocationId || !factoryLocationId || !returnLocationId || !customerId) {
      return NextResponse.json({ income: null });
    }

    const latestJob = await prisma.job.findFirst({
      where: {
        jobType,
        size,
        pickupLocationId,
        factoryLocationId,
        returnLocationId,
        customerId,
      },
      orderBy: { createdAt: "desc" },
      select: { income: true },
    });

    return NextResponse.json({ income: latestJob?.income ?? null });
  } catch (error) {
    console.error("Error calculating income:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
