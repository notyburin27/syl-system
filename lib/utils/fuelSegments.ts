import { getPairedSize, isTowingJobType } from "@/types/job";

/** ลักษณะงานที่ไม่ใช่การวิ่งรถ — ไม่นับทั้งมาตรฐานและลิตรที่เติม */
export const FUEL_EXCLUDED_JOB_TYPES = ["noJob", "advance"] as const;

/** run = งานวิ่ง (key ด้วยโรงงาน), towing = งานทอย (key ด้วยสถานที่รับตู้) */
export type FuelStandardKind = "run" | "towing";

export const FUEL_STANDARD_KINDS: readonly FuelStandardKind[] = ["run", "towing"];

export function fuelStandardKindOf(jobType: string): FuelStandardKind {
  return isTowingJobType(jobType) ? "towing" : "run";
}

/** สถานที่แหลมฉบังดูจากชื่อ — ท่าเรืออื่นทั้งหมดถือเป็นโซนกรุงเทพ */
export function isLaemChabangName(name: string | null | undefined): boolean {
  return !!name && name.includes("แหลม");
}

export interface FuelJob {
  id: string;
  jobNumber: string;
  /** 'YYYY-MM-DD' */
  jobDate: string;
  jobType: string;
  isCancelled: boolean;
  /** ทอยที่ถูกงานหลักดูดซับ — มาตรฐาน 0 เพราะค่าเที่ยวรวมอยู่กับงานหลักแล้ว */
  isTowingAbsorbed: boolean;
  size: string | null;
  pickupLocationId: string | null;
  factoryLocationId: string | null;
  /** สถานที่รับตู้เป็นแหลมฉบัง — คำนวณจากชื่อด้วย isLaemChabangName */
  pickupLaemChabang: boolean;
  /** สถานที่คืนตู้เป็นแหลมฉบัง */
  returnLaemChabang: boolean;
  /** OFF + สด + เครดิต — มากกว่า 0 คือจุดเติมเต็มถัง */
  fuelLiters: number;
  pairRole: "primary" | "secondary" | null;
  /** id ของอีกใบในคู่ (null เมื่อไม่จับคู่) */
  pairPartnerId: string | null;
}

export interface FuelStandardKey {
  kind: FuelStandardKind;
  /** size ที่ใช้หา — งานจับคู่ใบหลักเป็น paired size (2x20DC) */
  size: string | null;
  /** run = โรงงาน, towing = สถานที่รับตู้ */
  locationId: string | null;
  pickupLaemChabang: boolean;
  returnLaemChabang: boolean;
}

export interface FuelStandardEntry extends FuelStandardKey {
  size: string;
  locationId: string;
  liters: number;
}

export interface FuelMissingRoute extends FuelStandardKey {
  jobNumbers: string[];
}

export type FuelSegmentStatus = "ok" | "missing_standard" | "no_previous_fill";

/** job หนึ่งใบในช่วง — standardLiters null = หาค่ามาตรฐานไม่เจอ */
export interface FuelSegmentJob {
  id: string;
  standardLiters: number | null;
}

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
  /** job ทุกใบในช่วงตามลำดับที่ใช้ตัดช่วง */
  jobs: FuelSegmentJob[];
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

const keyString = (k: FuelStandardKey) =>
  [k.kind, k.size ?? "", k.locationId ?? "", k.pickupLaemChabang ? "1" : "0", k.returnLaemChabang ? "1" : "0"].join("|");

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

/** key ที่ job นี้ใช้หามาตรฐาน — งานวิ่งดูโรงงาน (+ รับ/คืนแหลมฉบัง), งานทอยดูสถานที่รับตู้ */
export function fuelStandardKeyOf(job: FuelJob): FuelStandardKey {
  const kind = fuelStandardKindOf(job.jobType);
  const size = job.pairRole === "primary" ? getPairedSize(job.size) ?? job.size : job.size;
  return kind === "towing"
    ? { kind, size, locationId: job.pickupLocationId, pickupLaemChabang: false, returnLaemChabang: false }
    : {
        kind,
        size,
        locationId: job.factoryLocationId,
        pickupLaemChabang: job.pickupLaemChabang,
        returnLaemChabang: job.returnLaemChabang,
      };
}

/** ลิตรมาตรฐานของ job (null = หาไม่เจอ) */
function resolveStandard(job: FuelJob, litersByKey: Map<string, number>): { key: FuelStandardKey; liters: number | null } {
  const key = fuelStandardKeyOf(job);
  // ใบรองของงานจับคู่วิ่งเที่ยวเดียวกับใบหลัก, ทอยที่ถูกดูดซับรวมอยู่กับงานหลัก
  if (job.pairRole === "secondary" || job.isTowingAbsorbed) return { key, liters: 0 };
  if (!key.size || !key.locationId) return { key, liters: null };
  return { key, liters: litersByKey.get(keyString(key)) ?? null };
}

/**
 * ใบรองต้องมาอยู่ถัดจากใบหลักเสมอ — ใบหลักสร้างทีหลังจึงถูกเรียงหลังใบรอง
 * ถ้าไม่ย้าย การเติมที่ใบรองจะปิดช่วงก่อนมาตรฐาน 2x ของใบหลัก (ผลต่างเพี้ยนตามว่าลิตรอยู่ใบไหน)
 */
function placeSecondariesAfterPrimary(jobs: FuelJob[]): FuelJob[] {
  const ids = new Set(jobs.map((j) => j.id));
  const secondaryOf = new Map<string, FuelJob>();
  for (const j of jobs) {
    if (j.pairRole === "secondary" && j.pairPartnerId && ids.has(j.pairPartnerId)) {
      secondaryOf.set(j.pairPartnerId, j);
    }
  }
  const moved = new Set(secondaryOf.values());
  const out: FuelJob[] = [];
  for (const j of jobs) {
    if (moved.has(j)) continue;
    out.push(j);
    const sec = secondaryOf.get(j.id);
    if (sec && j.pairRole === "primary") out.push(sec);
  }
  return out;
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
  const segmentJobs: FuelSegmentJob[] = [];

  for (const job of jobs) {
    const { key, liters } = resolveStandard(job, litersByKey);
    segmentJobs.push({ id: job.id, standardLiters: liters });
    if (liters != null) {
      standard += liters;
      continue;
    }
    const route = missing.get(keyString(key)) ?? { ...key, jobNumbers: [] };
    route.jobNumbers.push(job.jobNumber);
    missing.set(keyString(key), route);
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
    jobs: segmentJobs,
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
  const litersByKey = new Map(standards.map((s) => [keyString(s), s.liters]));

  const segments: FuelSegment[] = [];
  let current: FuelJob[] = [];
  for (const job of placeSecondariesAfterPrimary(jobs.filter(isFuelCountedJob))) {
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
