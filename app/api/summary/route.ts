import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDriverSummary } from "@/lib/utils/summaryCalculator";
import type { DriverMonthlySummary } from "@/types/job";

/** ดึงสรุปของคนขับหลายคนในเดือนเดียว — ใช้ร่วมกับ export route */
export async function buildMonthSummaries(
  month: string,
  driverIds?: string[]
): Promise<DriverMonthlySummary[]> {
  const [year, mon] = month.split("-").map(Number);
  const gte = new Date(Date.UTC(year, mon - 1, 1));
  const lt = new Date(Date.UTC(year, mon, 1));

  // คนขับที่ลาออกแล้วยังเห็นในเดือนที่ลาออก แต่ไม่เห็นตั้งแต่เดือนถัดไป
  const drivers = await prisma.driver.findMany({
    where: {
      isActive: true,
      ...(driverIds ? { id: { in: driverIds } } : {}),
      OR: [{ resignedAt: null }, { resignedAt: { gte } }],
    },
    select: {
      id: true,
      name: true,
      vehicleNumber: true,
      groupName: true,
      startDate: true,
      baseSalary: true,
      resignedAt: true,
    },
    orderBy: [{ groupName: "asc" }, { name: "asc" }],
  });

  // ราคาน้ำมัน: record ล่าสุดที่มีผลภายในเดือนนั้น
  const fuelLog = await prisma.fuelPriceLog.findFirst({
    where: { effectiveDate: { gte, lt } },
    orderBy: { effectiveDate: "desc" },
  });
  const fuelPricePerLiter = fuelLog ? Number(fuelLog.pricePerLiter) : null;

  const driverIdList = drivers.map((d) => d.id);

  const [jobs, leaves] = await Promise.all([
    prisma.job.findMany({
      where: { driverId: { in: driverIdList }, jobDate: { gte, lt } },
      select: {
        driverId: true,
        jobType: true,
        noJobReason: true,
        isCancelled: true,
        income: true,
        driverWage: true,
        fuelOfficeLiters: true,
        fuelCashLiters: true,
        fuelCreditLiters: true,
      },
    }),
    prisma.driverLeave.groupBy({
      by: ["driverId"],
      where: { driverId: { in: driverIdList }, leaveDate: { gte, lt } },
      _count: { _all: true },
    }),
  ]);

  const jobsByDriver = new Map<string, typeof jobs>();
  for (const job of jobs) {
    if (!job.driverId) continue;
    const list = jobsByDriver.get(job.driverId) ?? [];
    list.push(job);
    jobsByDriver.set(job.driverId, list);
  }

  const leaveByDriver = new Map(leaves.map((l) => [l.driverId, l._count._all]));

  return drivers.map((driver) =>
    calculateDriverSummary({
      month,
      driver: {
        id: driver.id,
        name: driver.name,
        vehicleNumber: driver.vehicleNumber,
        groupName: driver.groupName,
        startDate: driver.startDate ? driver.startDate.toISOString() : null,
        baseSalary: driver.baseSalary != null ? Number(driver.baseSalary) : null,
      },
      jobs: (jobsByDriver.get(driver.id) ?? []).map((j) => ({
        jobType: j.jobType,
        noJobReason: j.noJobReason,
        isCancelled: j.isCancelled,
        income: j.income != null ? Number(j.income) : null,
        driverWage: j.driverWage != null ? Number(j.driverWage) : null,
        fuelOfficeLiters: j.fuelOfficeLiters != null ? Number(j.fuelOfficeLiters) : null,
        fuelCashLiters: j.fuelCashLiters != null ? Number(j.fuelCashLiters) : null,
        fuelCreditLiters: j.fuelCreditLiters != null ? Number(j.fuelCreditLiters) : null,
      })),
      leaveCount: leaveByDriver.get(driver.id) ?? 0,
      fuelPricePerLiter,
    })
  );
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "กรุณาระบุเดือนให้ถูกต้อง (YYYY-MM)" }, { status: 400 });
    }

    return NextResponse.json(await buildMonthSummaries(month));
  } catch (error) {
    console.error("Error fetching summary:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป" }, { status: 500 });
  }
}
