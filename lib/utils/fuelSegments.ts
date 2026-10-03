import { getPairedSize } from "@/types/job";

/** ลักษณะงานที่ไม่ใช่การวิ่งรถ — ไม่นับทั้งมาตรฐานและลิตรที่เติม */
export const FUEL_EXCLUDED_JOB_TYPES = ["noJob", "advance"] as const;

export interface FuelJob {
  id: string;
  jobNumber: string;
  /** 'YYYY-MM-DD' */
  jobDate: string;
  jobType: string;
  isCancelled: boolean;
  size: string | null;
  pickupLocationId: string | null;
  factoryLocationId: string | null;
  returnLocationId: string | null;
  /** OFF + สด + เครดิต — มากกว่า 0 คือจุดเติมเต็มถัง */
  fuelLiters: number;
  pairRole: "primary" | "secondary" | null;
}

export interface FuelStandardEntry {
  size: string;
  pickupLocationId: string;
  factoryLocationId: string | null;
  returnLocationId: string;
  liters: number;
}

export interface FuelMissingRoute {
  /** size ที่ใช้หา — งานจับคู่ใบหลักเป็น paired size (2x20DC) */
  size: string | null;
  pickupLocationId: string | null;
  factoryLocationId: string | null;
  returnLocationId: string | null;
  jobNumbers: string[];
}

export type FuelSegmentStatus = "ok" | "missing_standard" | "no_previous_fill";

export interface FuelSegment {
  startDate: string;
  endDate: string;
  closingJobNumber: string;
  jobCount: number;
  actualLiters: number;
  /** null เมื่อ status ไม่ใช่ ok */
  standardLiters: number | null;
  /** ใช้จริง − มาตรฐาน; null เมื่อ status ไม่ใช่ ok */
  diffLiters: number | null;
  status: FuelSegmentStatus;
  /** job ในช่วงที่หาค่ามาตรฐานไม่เจอ (มีได้ทุก status — ใช้ทำ quick-add) */
  missingRoutes: FuelMissingRoute[];
}

export interface FuelSegmentResult {
  /** เฉพาะช่วงที่ปิดภายในเดือนที่ขอ */
  segments: FuelSegment[];
  /** job ในเดือนที่ขอซึ่งอยู่หลังจุดเติมสุดท้าย — ยังรอปิดช่วง */
  pendingJobCount: number;
  /** Σ ส่วนต่างที่ > 0 ของช่วงที่คำนวณได้ */
  excessLiters: number;
  /** Σ ส่วนต่างทุกช่วงที่คำนวณได้ (หักลบช่วงที่ประหยัด) */
  netDiffLiters: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const routeKey = (
  size: string | null,
  pickupLocationId: string | null,
  factoryLocationId: string | null,
  returnLocationId: string | null
) => [size ?? "", pickupLocationId ?? "", factoryLocationId ?? "", returnLocationId ?? ""].join("|");

export function totalFuelLiters(j: {
  fuelOfficeLiters: number | null;
  fuelCashLiters: number | null;
  fuelCreditLiters: number | null;
}): number {
  return round2((j.fuelOfficeLiters ?? 0) + (j.fuelCashLiters ?? 0) + (j.fuelCreditLiters ?? 0));
}

function isFuelCountedJob(job: FuelJob): boolean {
  return !job.isCancelled && !(FUEL_EXCLUDED_JOB_TYPES as readonly string[]).includes(job.jobType);
}

/** size ที่ใช้หามาตรฐาน + ลิตร (null = หาไม่เจอ) — ใบรองของงานจับคู่นับ 0 เพราะวิ่งเที่ยวเดียวกับใบหลัก */
function resolveStandard(
  job: FuelJob,
  litersByKey: Map<string, number>
): { lookupSize: string | null; liters: number | null } {
  if (job.pairRole === "secondary") return { lookupSize: job.size, liters: 0 };
  const lookupSize = job.pairRole === "primary" ? getPairedSize(job.size) ?? job.size : job.size;
  if (!lookupSize || !job.pickupLocationId || !job.returnLocationId) return { lookupSize, liters: null };
  const liters = litersByKey.get(
    routeKey(lookupSize, job.pickupLocationId, job.factoryLocationId, job.returnLocationId)
  );
  return { lookupSize, liters: liters ?? null };
}

function buildSegment(
  jobs: FuelJob[],
  litersByKey: Map<string, number>,
  noPreviousFill: boolean
): FuelSegment {
  const closing = jobs[jobs.length - 1];
  const actual = round2(closing.fuelLiters);
  let standard = 0;
  const missing = new Map<string, FuelMissingRoute>();

  for (const job of jobs) {
    const { lookupSize, liters } = resolveStandard(job, litersByKey);
    if (liters != null) {
      standard += liters;
      continue;
    }
    const key = routeKey(lookupSize, job.pickupLocationId, job.factoryLocationId, job.returnLocationId);
    const route = missing.get(key) ?? {
      size: lookupSize,
      pickupLocationId: job.pickupLocationId,
      factoryLocationId: job.factoryLocationId,
      returnLocationId: job.returnLocationId,
      jobNumbers: [],
    };
    route.jobNumbers.push(job.jobNumber);
    missing.set(key, route);
  }

  const status: FuelSegmentStatus = noPreviousFill
    ? "no_previous_fill"
    : missing.size > 0
      ? "missing_standard"
      : "ok";
  const complete = status === "ok";

  return {
    startDate: jobs[0].jobDate,
    endDate: closing.jobDate,
    closingJobNumber: closing.jobNumber,
    jobCount: jobs.length,
    actualLiters: actual,
    standardLiters: complete ? round2(standard) : null,
    diffLiters: complete ? round2(actual - standard) : null,
    status,
    missingRoutes: [...missing.values()],
  };
}

/**
 * ตัด job ของรถหนึ่งคันเป็นช่วงตามจุดเติม (เติมเต็มถังทุกครั้ง) แล้วเทียบลิตรที่เติมกับมาตรฐานรวมของช่วง
 * ช่วง = job ถัดจากจุดเติมก่อนหน้า ถึงจุดเติมนี้ (รวมจุดเติมนี้)
 *
 * @param jobs เรียง jobDate, createdAt แล้ว — เริ่มที่ job ถัดจากจุดเติมก่อนหน้า (ถ้ามี)
 */
export function computeFuelSegments(
  jobs: FuelJob[],
  standards: FuelStandardEntry[],
  opts: { month: string; hasPreviousFill: boolean }
): FuelSegmentResult {
  const litersByKey = new Map(
    standards.map((s) => [
      routeKey(s.size, s.pickupLocationId, s.factoryLocationId, s.returnLocationId),
      s.liters,
    ])
  );

  const segments: FuelSegment[] = [];
  let current: FuelJob[] = [];
  for (const job of jobs.filter(isFuelCountedJob)) {
    current.push(job);
    if (job.fuelLiters > 0) {
      segments.push(buildSegment(current, litersByKey, segments.length === 0 && !opts.hasPreviousFill));
      current = [];
    }
  }

  const inMonth = (date: string) => date.startsWith(opts.month);
  const monthSegments = segments.filter((s) => inMonth(s.endDate));
  const diffs = monthSegments.filter((s) => s.status === "ok").map((s) => s.diffLiters ?? 0);

  return {
    segments: monthSegments,
    pendingJobCount: current.filter((j) => inMonth(j.jobDate)).length,
    excessLiters: round2(diffs.reduce((sum, d) => sum + Math.max(0, d), 0)),
    netDiffLiters: round2(diffs.reduce((sum, d) => sum + d, 0)),
  };
}
