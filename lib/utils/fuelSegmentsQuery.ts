import { prisma } from "@/lib/prisma";
import {
  computeFuelSegments,
  totalFuelLiters,
  FUEL_EXCLUDED_JOB_TYPES,
  type FuelJob,
  type FuelSegmentResult,
  type FuelStandardEntry,
} from "@/lib/utils/fuelSegments";
import type { FuelStandardSummary } from "@/types/job";

const num = (v: { toString(): string } | null) => (v != null ? Number(v) : null);

/** job ที่นับเป็นจุดเติม — ช่องลิตรใดช่องหนึ่ง > 0 และไม่ใช่ job ที่ถูกข้าม */
const FILL_WHERE = {
  isCancelled: false,
  jobType: { notIn: [...FUEL_EXCLUDED_JOB_TYPES] },
  OR: [{ fuelOfficeLiters: { gt: 0 } }, { fuelCashLiters: { gt: 0 } }, { fuelCreditLiters: { gt: 0 } }],
};

async function computeForDriver(
  driverId: string,
  month: string,
  monthStart: Date,
  monthEnd: Date,
  standards: FuelStandardEntry[]
): Promise<FuelSegmentResult> {
  // ช่วงแรกของเดือนเริ่มหลังจุดเติมล่าสุดก่อนต้นเดือน — ต้องย้อนไปหาก่อน
  const prevFill = await prisma.job.findFirst({
    where: { driverId, jobDate: { lt: monthStart }, ...FILL_WHERE },
    orderBy: [{ jobDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, jobDate: true },
  });

  const rows = await prisma.job.findMany({
    where: { driverId, jobDate: { gte: prevFill?.jobDate ?? monthStart, lt: monthEnd } },
    orderBy: [{ jobDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      jobNumber: true,
      jobDate: true,
      jobType: true,
      isCancelled: true,
      size: true,
      pickupLocationId: true,
      factoryLocationId: true,
      returnLocationId: true,
      fuelOfficeLiters: true,
      fuelCashLiters: true,
      fuelCreditLiters: true,
      pairLinkAsPrimary: { select: { id: true } },
      pairLinkAsSecondary: { select: { id: true } },
    },
  });

  // ตัดด้วยตำแหน่งของจุดเติม ไม่ใช่วันที่ — วันเดียวกันอาจมี job ที่สร้างก่อนจุดเติม
  const start = prevFill ? rows.findIndex((r) => r.id === prevFill.id) + 1 : 0;
  const jobs: FuelJob[] = rows.slice(start).map((r) => ({
    id: r.id,
    jobNumber: r.jobNumber,
    jobDate: r.jobDate.toISOString().slice(0, 10),
    jobType: r.jobType,
    isCancelled: r.isCancelled,
    size: r.size,
    pickupLocationId: r.pickupLocationId,
    factoryLocationId: r.factoryLocationId,
    returnLocationId: r.returnLocationId,
    fuelLiters: totalFuelLiters({
      fuelOfficeLiters: num(r.fuelOfficeLiters),
      fuelCashLiters: num(r.fuelCashLiters),
      fuelCreditLiters: num(r.fuelCreditLiters),
    }),
    pairRole: r.pairLinkAsPrimary ? "primary" : r.pairLinkAsSecondary ? "secondary" : null,
  }));

  return computeFuelSegments(jobs, standards, { month, hasPreviousFill: !!prevFill });
}

/** น้ำมันเกินมาตรฐานของเดือนต่อคนขับ — คำนวณสดจาก job และตาราง fuel_standard */
export async function buildFuelStandardSummaries(
  month: string,
  driverIds: string[]
): Promise<Map<string, FuelStandardSummary>> {
  const result = new Map<string, FuelStandardSummary>();
  if (driverIds.length === 0) return result;

  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, mon - 1, 1));
  const monthEnd = new Date(Date.UTC(year, mon, 1));

  const standards: FuelStandardEntry[] = (await prisma.fuelStandard.findMany()).map((s) => ({
    size: s.size,
    pickupLocationId: s.pickupLocationId,
    factoryLocationId: s.factoryLocationId,
    returnLocationId: s.returnLocationId,
    liters: Number(s.liters),
  }));

  const perDriver = await Promise.all(
    driverIds.map(
      async (id) => [id, await computeForDriver(id, month, monthStart, monthEnd, standards)] as const
    )
  );

  const locationIds = new Set<string>();
  for (const [, r] of perDriver)
    for (const s of r.segments)
      for (const m of s.missingRoutes)
        for (const id of [m.pickupLocationId, m.factoryLocationId, m.returnLocationId]) if (id) locationIds.add(id);
  const locations = locationIds.size
    ? await prisma.location.findMany({ where: { id: { in: [...locationIds] } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(locations.map((l) => [l.id, l.name]));
  const name = (id: string | null) => (id ? nameById.get(id) ?? null : null);

  for (const [driverId, r] of perDriver) {
    result.set(driverId, {
      excessLiters: r.excessLiters,
      netDiffLiters: r.netDiffLiters,
      pendingJobCount: r.pendingJobCount,
      segments: r.segments.map((s) => ({
        ...s,
        missingRoutes: s.missingRoutes.map((m) => ({
          ...m,
          pickupLocationName: name(m.pickupLocationId),
          factoryLocationName: name(m.factoryLocationId),
          returnLocationName: name(m.returnLocationId),
        })),
      })),
    });
  }
  return result;
}
