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

    // Get all active drivers
    const drivers = await prisma.driver.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    // Build date filter
    let dateFilter: { gte: Date; lt: Date } | undefined;
    if (month) {
      const [year, mon] = month.split("-").map(Number);
      dateFilter = {
        gte: new Date(year, mon - 1, 1),
        lt: new Date(year, mon, 1),
      };
    }

    // Get job counts and totals per driver
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
            income: true,
            actualTransfer: true,
          },
        });

        const jobCount = jobs.length;
        const totalIncome = jobs.reduce((sum, j) => sum + Number(j.income || 0), 0);
        const totalTransfer = jobs.reduce(
          (sum, j) => sum + Number(j.actualTransfer || 0),
          0
        );

        return {
          driverId: driver.id,
          driverName: driver.name,
          jobCount,
          totalIncome,
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
