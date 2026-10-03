import { prisma } from "@/lib/prisma";
import { calculateDriverSummary } from "@/lib/utils/summaryCalculator";
import type { DriverMonthlySummary } from "@/types/job";

/** ดึงสรุปของคนขับหลายคนในเดือนเดียว — ใช้ร่วมกันโดย /api/summary และ /api/summary/[driverId] */
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
      isGasVehicle: true,
      resignedAt: true,
    },
    orderBy: [{ groupName: "asc" }, { name: "asc" }],
  });

  // ราคาน้ำมัน: ค่าเฉลี่ยของทุก record ที่มีผลภายในเดือนนั้น (ไม่ใช่ราคาล่าสุด — อ้างอิง Excel ที่ user ให้มาใช้ราคาเฉลี่ยรายเดือนตัวเดียวทั้งเดือน)
  const fuelAgg = await prisma.fuelPriceLog.aggregate({
    where: { effectiveDate: { gte, lt } },
    _avg: { pricePerLiter: true },
  });
  const fuelPricePerLiter =
    fuelAgg._avg.pricePerLiter != null ? Number(fuelAgg._avg.pricePerLiter) : null;

  const driverIdList = drivers.map((d) => d.id);

  const [jobs, leaves, entries] = await Promise.all([
    prisma.job.findMany({
      where: { driverId: { in: driverIdList }, jobDate: { gte, lt } },
      select: {
        driverId: true,
        jobType: true,
        noJobReason: true,
        isCancelled: true,
        isCarry: true,
        income: true,
        driverWage: true,
        fuelOfficeLiters: true,
        fuelCashLiters: true,
        fuelCreditLiters: true,
        toll: true,
        liftFee: true,
        storageFee: true,
        tire: true,
        other: true,
        pairLinkAsSecondary: { select: { id: true } },
        isTowingAbsorbed: true,
      },
    }),
    // แยกนับลาป่วย/ลากิจ — leaveType อื่นที่ไม่ใช่ "sick" นับเป็นลากิจ
    prisma.driverLeave.groupBy({
      by: ["driverId", "leaveType"],
      where: { driverId: { in: driverIdList }, leaveDate: { gte, lt } },
      _count: { _all: true },
    }),
    prisma.driverMonthlyEntry.findMany({
      where: { driverId: { in: driverIdList }, month },
      select: {
        driverId: true,
        carryTrips: true,
        fuelDeduction: true,
        otherExpenses: true,
        driverPayout: true,
      },
    }),
  ]);

  const jobsByDriver = new Map<string, typeof jobs>();
  for (const job of jobs) {
    if (!job.driverId) continue;
    const list = jobsByDriver.get(job.driverId) ?? [];
    list.push(job);
    jobsByDriver.set(job.driverId, list);
  }

  const sickLeaveByDriver = new Map<string, number>();
  const personalLeaveByDriver = new Map<string, number>();
  for (const l of leaves) {
    const target = l.leaveType === "sick" ? sickLeaveByDriver : personalLeaveByDriver;
    target.set(l.driverId, (target.get(l.driverId) ?? 0) + l._count._all);
  }

  // ค่ากรอกมือรายเดือน — Decimal ต้องแปลงเป็น number ตรงนี้ และคง null ไว้ถ้ายังไม่กรอก
  const entryByDriver = new Map(
    entries.map((e) => [
      e.driverId,
      {
        carryTrips: e.carryTrips,
        fuelDeduction: e.fuelDeduction != null ? Number(e.fuelDeduction) : null,
        otherExpenses: e.otherExpenses != null ? Number(e.otherExpenses) : null,
        driverPayout: e.driverPayout != null ? Number(e.driverPayout) : null,
      },
    ])
  );

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
        isGasVehicle: driver.isGasVehicle,
      },
      jobs: (jobsByDriver.get(driver.id) ?? []).map((j) => ({
        jobType: j.jobType,
        noJobReason: j.noJobReason,
        isCancelled: j.isCancelled,
        isCarry: j.isCarry,
        income: j.income != null ? Number(j.income) : null,
        driverWage: j.driverWage != null ? Number(j.driverWage) : null,
        fuelOfficeLiters: j.fuelOfficeLiters != null ? Number(j.fuelOfficeLiters) : null,
        fuelCashLiters: j.fuelCashLiters != null ? Number(j.fuelCashLiters) : null,
        fuelCreditLiters: j.fuelCreditLiters != null ? Number(j.fuelCreditLiters) : null,
        toll: j.toll != null ? Number(j.toll) : null,
        liftFee: j.liftFee != null ? Number(j.liftFee) : null,
        storageFee: j.storageFee != null ? Number(j.storageFee) : null,
        tire: j.tire != null ? Number(j.tire) : null,
        other: j.other != null ? Number(j.other) : null,
        isPairSecondary: !!j.pairLinkAsSecondary,
        isTowingAbsorbed: j.isTowingAbsorbed,
      })),
      sickLeaveCount: sickLeaveByDriver.get(driver.id) ?? 0,
      personalLeaveCount: personalLeaveByDriver.get(driver.id) ?? 0,
      entry: entryByDriver.get(driver.id) ?? null,
      fuelPricePerLiter,
    })
  );
}
