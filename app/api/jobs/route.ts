import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // format: 2026-03
    const driverId = searchParams.get("driverId");

    if (!driverId) {
      return NextResponse.json(
        { error: "กรุณาระบุคนขับ" },
        { status: 400 }
      );
    }

    const where: {
      driverId: string;
      jobDate?: { gte: Date; lt: Date };
    } = { driverId };

    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const startDate = new Date(year, mon - 1, 1);
      const endDate = new Date(year, mon, 1);
      where.jobDate = { gte: startDate, lt: endDate };
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        customer: true,
        driver: true,
        pickupLocation: true,
        factoryLocation: true,
        returnLocation: true,
      },
      orderBy: [{ jobDate: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลงาน" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { jobType, jobNumber, customerId, driverId, jobDate, ...rest } = body;

    // Auto-generate job number for เบิกล่วงหน้า
    let finalJobNumber = jobNumber;
    if (jobType === "เบิกล่วงหน้า" && !jobNumber) {
      const existing = await prisma.job.findMany({
        where: { jobNumber: { startsWith: "ADV-" } },
        select: { jobNumber: true },
      });
      const maxSeq = existing.reduce((max, j) => {
        const n = parseInt(j.jobNumber.replace("ADV-", ""), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 0);
      finalJobNumber = `ADV-${String(maxSeq + 1).padStart(5, "0")}`;
    }

    if (!finalJobNumber) {
      return NextResponse.json(
        { error: "กรุณากรอกเลขที่งาน" },
        { status: 400 }
      );
    }

    if (!jobDate) {
      return NextResponse.json(
        { error: "กรุณาระบุวันที่" },
        { status: 400 }
      );
    }

    const job = await prisma.job.create({
      data: {
        jobDate: new Date(jobDate),
        jobType: jobType || "",
        customerId: customerId || null,
        jobNumber: finalJobNumber,
        driverId: driverId || null,
        size: rest.size || null,
        pickupLocationId: rest.pickupLocationId || null,
        factoryLocationId: rest.factoryLocationId || null,
        returnLocationId: rest.returnLocationId || null,
        income: rest.income ?? null,
        actualTransfer: rest.actualTransfer ?? null,
        advance: rest.advance ?? null,
        toll: rest.toll ?? null,
        pickupFee: rest.pickupFee ?? null,
        returnFee: rest.returnFee ?? null,
        liftFee: rest.liftFee ?? null,
        storageFee: rest.storageFee ?? null,
        tire: rest.tire ?? null,
        other: rest.other ?? null,
        mileage: rest.mileage ?? null,
        fuelOfficeLiters: rest.fuelOfficeLiters ?? null,
        fuelCashLiters: rest.fuelCashLiters ?? null,
        fuelCashAmount: rest.fuelCashAmount ?? null,
        fuelCreditLiters: rest.fuelCreditLiters ?? null,
        fuelCreditAmount: rest.fuelCreditAmount ?? null,
        createdById: session.user.id as string,
      },
      include: {
        customer: true,
        driver: true,
        pickupLocation: true,
        factoryLocation: true,
        returnLocation: true,
      },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "เลขที่งานนี้มีอยู่แล้ว" },
        { status: 400 }
      );
    }
    console.error("Error creating job:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างงาน" },
      { status: 500 }
    );
  }
}
