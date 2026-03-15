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
      orderBy: { jobDate: "asc" },
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
      const count = await prisma.job.count({
        where: { jobType: "เบิกล่วงหน้า" },
      });
      finalJobNumber = `ADV-${String(count + 1).padStart(5, "0")}`;
    }

    if (!finalJobNumber) {
      return NextResponse.json(
        { error: "กรุณากรอกเลขที่งาน" },
        { status: 400 }
      );
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "กรุณาเลือกลูกค้า" },
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
        customerId,
        jobNumber: finalJobNumber,
        driverId: driverId || null,
        size: rest.size || null,
        pickupLocationId: rest.pickupLocationId || null,
        factoryLocationId: rest.factoryLocationId || null,
        returnLocationId: rest.returnLocationId || null,
        estimatedTransfer: rest.estimatedTransfer ?? 0,
        income: rest.income ?? 0,
        actualTransfer: rest.actualTransfer ?? 0,
        advance: rest.advance ?? 0,
        toll: rest.toll ?? 0,
        pickupFee: rest.pickupFee ?? 0,
        returnFee: rest.returnFee ?? 0,
        liftFee: rest.liftFee ?? 0,
        storageFee: rest.storageFee ?? 0,
        tire: rest.tire ?? 0,
        other: rest.other ?? 0,
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
