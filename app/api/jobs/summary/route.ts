import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAIN_JOB_TYPES = ["inbound", "outbound", "flatbed"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // format: 2026-03

    let dateFilter: { gte: Date; lt: Date } | undefined;
    if (month) {
      const [year, mon] = month.split("-").map(Number);
      dateFilter = {
        gte: new Date(year, mon - 1, 1),
        lt: new Date(year, mon, 1),
      };
    }

    // คนขับที่ลาออกแล้วจะไม่แสดงในเดือนถัดจากเดือนที่ลาออก
    // (ลาออก ส.ค. → ยังเห็นในเดือน ส.ค. แต่ไม่เห็นตั้งแต่ ก.ย. เป็นต้นไป)
    const driverWhere: {
      isActive: boolean;
      OR?: Array<{ resignedAt: null } | { resignedAt: { gte: Date } }>;
    } = { isActive: true };
    if (dateFilter) {
      driverWhere.OR = [
        { resignedAt: null },
        { resignedAt: { gte: dateFilter.gte } },
      ];
    }

    const drivers = await prisma.driver.findMany({
      where: driverWhere,
      orderBy: { name: "asc" },
    });

    const summary = await Promise.all(
      drivers.map(async (driver) => {
        const where: { driverId: string; jobDate?: { gte: Date; lt: Date } } = {
          driverId: driver.id,
        };
        if (dateFilter) {
          where.jobDate = dateFilter;
        }

        const jobs = await prisma.job.findMany({
          where,
          select: {
            jobType: true,
            advance: true,
            toll: true,
            pickupFee: true,
            returnFee: true,
            liftFee: true,
            storageFee: true,
            tire: true,
            other: true,
            fuelCashAmount: true,
            driverWage: true,
          },
        });

        const computeTotal = (j: typeof jobs[0]) =>
          Number(j.advance || 0) +
          Number(j.toll || 0) +
          Number(j.pickupFee || 0) +
          Number(j.returnFee || 0) +
          Number(j.liftFee || 0) +
          Number(j.storageFee || 0) +
          Number(j.tire || 0) +
          Number(j.other || 0) +
          Number(j.fuelCashAmount || 0);

        const mainJobs = jobs.filter((j) => MAIN_JOB_TYPES.includes(j.jobType));
        const towingJobs = jobs.filter((j) => j.jobType === "towing");
        const advanceJobs = jobs.filter((j) => j.jobType === "advance");

        const mainTransfer = mainJobs.reduce((sum, j) => sum + computeTotal(j), 0);
        const towingTransfer = towingJobs.reduce((sum, j) => sum + computeTotal(j), 0);
        const advanceAmount = advanceJobs.reduce((sum, j) => sum + computeTotal(j), 0);
        const driverWageAmount = jobs.reduce((sum, j) => sum + Number(j.driverWage || 0), 0);
        const totalTransfer = jobs.reduce((sum, j) => sum + computeTotal(j), 0);

        return {
          driverId: driver.id,
          driverName: driver.name,
          vehicleNumber: driver.vehicleNumber,
          groupName: driver.groupName,
          mainJobCount: mainJobs.length,
          mainTransfer,
          towingJobCount: towingJobs.length,
          towingTransfer,
          advanceJobCount: advanceJobs.length,
          advanceAmount,
          driverWageAmount,
          totalTransfer,
        };
      })
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error fetching job summary:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป" },
      { status: 500 }
    );
  }
}
