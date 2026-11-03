import { prisma } from "@/lib/prisma";
import {
  computeFuelSegments,
  totalFuelLiters,
  FUEL_EXCLUDED_JOB_TYPES,
  isLaemChabangName,
  type FuelJob,
  type FuelStandardKind,
  type FuelSegmentResult,
  type FuelStandardEntry,
} from "@/lib/utils/fuelSegments";
import type { FuelSegmentJobView, FuelStandardSummary } from "@/types/job";

const num = (v: { toString(): string } | null) => (v != null ? Number(v) : null);

/**
 * job ที่นับเป็นจุดเติม — ช่องลิตรใดช่องหนึ่ง > 0 และไม่ใช่ job ที่ถูกข้าม
 * "ช่องใดช่องหนึ่ง > 0" เท่ากับ "ผลรวม > 0" (ที่ calculator ใช้) ก็ต่อเมื่อลิตรไม่ติดลบ ซึ่ง API/ฟอร์มกันไว้แล้ว
 */
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
): Promise<{ result: FuelSegmentResult; jobInfo: Map<string, Omit<FuelSegmentJobView, "standardLiters">> }> {
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
      isTowingAbsorbed: true,
      size: true,
      pickupLocationId: true,
      factoryLocationId: true,
      pickupLocation: { select: { name: true } },
      factoryLocation: { select: { name: true } },
      returnLocation: { select: { name: true } },
      fuelOfficeLiters: true,
      fuelCashLiters: true,
      fuelCreditLiters: true,
      pairLinkAsPrimary: { select: { secondaryJobId: true } },
      pairLinkAsSecondary: { select: { primaryJobId: true } },
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
    isTowingAbsorbed: r.isTowingAbsorbed,
    size: r.size,
    pickupLocationId: r.pickupLocationId,
    factoryLocationId: r.factoryLocationId,
    pickupLaemChabang: isLaemChabangName(r.pickupLocation?.name),
    returnLaemChabang: isLaemChabangName(r.returnLocation?.name),
    fuelLiters: totalFuelLiters({
      fuelOfficeLiters: num(r.fuelOfficeLiters),
      fuelCashLiters: num(r.fuelCashLiters),
      fuelCreditLiters: num(r.fuelCreditLiters),
    }),
    pairRole: r.pairLinkAsPrimary ? "primary" : r.pairLinkAsSecondary ? "secondary" : null,
    pairPartnerId: r.pairLinkAsPrimary?.secondaryJobId ?? r.pairLinkAsSecondary?.primaryJobId ?? null,
  }));

  // ข้อมูลแสดงผลของแต่ละ job — ใช้เฉพาะตอนขอ includeJobs
  const jobInfo = new Map(
    rows.slice(start).map((r, i) => {
      const j = jobs[i];
      const note: FuelSegmentJobView["note"] =
        j.pairRole === "secondary" ? "pair_secondary" : j.isTowingAbsorbed ? "towing_absorbed" : null;
      return [
        r.id,
        {
          id: r.id,
          jobNumber: r.jobNumber,
          jobDate: j.jobDate,
          jobType: r.jobType,
          size: r.size,
          pickupLocationName: r.pickupLocation?.name ?? null,
          factoryLocationName: r.factoryLocation?.name ?? null,
          returnLocationName: r.returnLocation?.name ?? null,
          fuelLiters: j.fuelLiters,
          note,
        },
      ] as const;
    })
  );

  return { result: computeFuelSegments(jobs, standards, { month, hasPreviousFill: !!prevFill }), jobInfo };
}

/** น้ำมันเกินมาตรฐานของเดือนต่อคนขับ — คำนวณสดจาก job และตาราง fuel_standard */
export async function buildFuelStandardSummaries(
  month: string,
  driverIds: string[],
  /** includeJobs: แนบรายการ job ของแต่ละช่วง (หน้าช่วงน้ำมัน) — การ์ดสรุปไม่ต้องใช้ */
  opts: { includeJobs?: boolean } = {}
): Promise<Map<string, FuelStandardSummary>> {
  const result = new Map<string, FuelStandardSummary>();
  if (driverIds.length === 0) return result;

  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, mon - 1, 1));
  const monthEnd = new Date(Date.UTC(year, mon, 1));

  const standards: FuelStandardEntry[] = (await prisma.fuelStandard.findMany()).map((s) => ({
    kind: s.kind as FuelStandardKind,
    size: s.size,
    locationId: s.locationId,
    pickupLaemChabang: s.pickupLaemChabang,
    returnLaemChabang: s.returnLaemChabang,
    liters: Number(s.liters),
  }));

  const perDriver = await Promise.all(
    driverIds.map(
      async (id) => [id, await computeForDriver(id, month, monthStart, monthEnd, standards)] as const
    )
  );

  const locationIds = new Set<string>();
  for (const [, { result: r }] of perDriver)
    for (const s of r.segments)
      for (const m of s.missingRoutes) if (m.locationId) locationIds.add(m.locationId);
  const locations = locationIds.size
    ? await prisma.location.findMany({ where: { id: { in: [...locationIds] } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(locations.map((l) => [l.id, l.name]));

  for (const [driverId, { result: r, jobInfo }] of perDriver) {
    result.set(driverId, {
      excessLiters: r.excessLiters,
      netDiffLiters: r.netDiffLiters,
      pendingJobCount: r.pendingJobCount,
      segments: r.segments.map(({ jobs, ...s }) => ({
        ...s,
        missingRoutes: s.missingRoutes.map((m) => ({
          ...m,
          locationName: m.locationId ? nameById.get(m.locationId) ?? null : null,
        })),
        ...(opts.includeJobs
          ? { jobs: jobs.map((j) => ({ ...jobInfo.get(j.id)!, standardLiters: j.standardLiters })) }
          : {}),
      })),
    });
  }
  return result;
}
