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

    if (!jobType) {
      return NextResponse.json({ income: 0 });
    }

    // Find latest job with matching criteria
    const where: Record<string, unknown> = { jobType };
    if (size) where.size = size;
    if (pickupLocationId) where.pickupLocationId = pickupLocationId;
    if (factoryLocationId) where.factoryLocationId = factoryLocationId;
    if (returnLocationId) where.returnLocationId = returnLocationId;
    if (customerId) where.customerId = customerId;

    const latestJob = await prisma.job.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { income: true },
    });

    return NextResponse.json({ income: latestJob?.income || 0 });
  } catch (error) {
    console.error("Error calculating income:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการคำนวณ" },
      { status: 500 }
    );
  }
}
