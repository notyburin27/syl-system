import { prisma } from "@/lib/prisma";
import { isTowingJobType } from "@/types/job";

/**
 * ชื่อสถานที่รับตู้ที่บอกว่า "ตู้อยู่บนหางอยู่แล้ว"
 * ไม่ใช่สถานที่จริง แต่เป็นสถานะที่เกิดจากทอยตู้ของวันก่อนหน้า
 */
export const ABSORB_PICKUP_NAMES = ["คาหาง", "รับเช้าเดินทาง"] as const;

export function isAbsorbPickupName(name: string | null | undefined): boolean {
  return !!name && (ABSORB_PICKUP_NAMES as readonly string[]).includes(name);
}

/** ข้อมูลขั้นต่ำที่ใช้ตัดสินการดูดซับ */
export interface AbsorbJob {
  id: string;
  jobDate: Date;
  jobType: string;
  size: string | null;
  driverId: string | null;
  customerId: string | null;
  createdAt: Date;
  isCancelled: boolean;
  clearStatus: boolean;
  /**
   * งานใบนี้เป็นฝั่งใดฝั่งหนึ่งของการจับคู่งาน (pairLinkAsPrimary/pairLinkAsSecondary) หรือไม่
   * ใช้ default false เพื่อไม่ให้ fixture เดิมที่ยังไม่รู้จัก field นี้พัง
   */
  hasPairLink?: boolean;
}

/** เทียบเฉพาะวัน — jobDate เก็บเป็น @db.Date อยู่แล้วแต่กันพลาด */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * ทอยตู้ใบนี้ถูกงานหลักใบนั้นดูดซับไหม
 *
 * ผู้เรียกต้องเช็คก่อนแล้วว่างานหลักมี pickupLocation เป็นคาหาง/รับเช้าเดินทาง
 * (ด้วย isAbsorbPickupName) เพราะฟังก์ชันนี้ไม่มีข้อมูลสถานที่
 */
export function isAbsorbedBy(towing: AbsorbJob, main: AbsorbJob): boolean {
  if (towing.id === main.id) return false;
  if (!isTowingJobType(towing.jobType)) return false;

  // ทอยตู้ที่ถูกจับคู่งานแล้ว (ไม่ว่าจะเป็น primary หรือ secondary) ต้องไม่ถูกดูดซับ —
  // เงินของมันถูกจัดการโดยระบบจับคู่งานอยู่แล้ว ห้ามให้การดูดซับมาแตะ driverWage/flag ซ้ำ
  // หมายเหตุ: เช็คเฉพาะฝั่งทอยตู้เท่านั้น งานหลัก (main) ที่ถูกจับคู่ไม่เกี่ยวกับกฎนี้
  if (towing.hasPairLink) return false;

  if (towing.isCancelled || main.isCancelled) return false;
  if (towing.clearStatus || main.clearStatus) return false;

  if (!towing.driverId || !main.driverId || towing.driverId !== main.driverId) return false;
  if (!towing.customerId || !main.customerId || towing.customerId !== main.customerId) return false;
  if (!towing.size || !main.size || towing.size !== main.size) return false;

  if (!isSameDay(towing.jobDate, main.jobDate)) return false;

  // ทอยตู้ต้องถูกบันทึกก่อนงานหลัก — ลากตู้มาคาไว้ก่อนแล้วค่อยวิ่งงาน
  if (towing.createdAt >= main.createdAt) return false;

  return true;
}

// ---------------------------------------------------------------------------
// ส่วนที่แตะ DB (server-only) — ส่วนบนของไฟล์ยังเป็น pure function ที่ test ได้
// ---------------------------------------------------------------------------

const RECALC_SELECT = {
  id: true,
  jobNumber: true,
  jobDate: true,
  jobType: true,
  size: true,
  driverId: true,
  customerId: true,
  createdAt: true,
  isCancelled: true,
  clearStatus: true,
  isTowingAbsorbed: true,
  // ต้องรู้ว่างานถูกจับคู่งานหรือไม่ (ไม่ว่าฝั่ง primary หรือ secondary) —
  // ถ้าเป็นทอยตู้ที่ถูกจับคู่ ห้ามให้ตรรกะดูดซับไปแตะ driverWage/flag เด็ดขาด
  pairLinkAsPrimary: { select: { id: true } },
  pairLinkAsSecondary: { select: { id: true } },
} as const;

type RecalcRow = {
  id: string;
  jobNumber: string;
  jobDate: Date;
  jobType: string;
  size: string | null;
  driverId: string | null;
  customerId: string | null;
  createdAt: Date;
  isCancelled: boolean;
  clearStatus: boolean;
  isTowingAbsorbed: boolean;
  pairLinkAsPrimary: { id: string } | null;
  pairLinkAsSecondary: { id: string } | null;
};

/** งานถูกจับคู่งานอยู่ไหม (ฝั่งใดฝั่งหนึ่งก็นับ) */
function hasPairLink(j: { pairLinkAsPrimary: { id: string } | null; pairLinkAsSecondary: { id: string } | null }): boolean {
  return !!j.pairLinkAsPrimary || !!j.pairLinkAsSecondary;
}

export interface RecalcResult {
  absorbed: number;
  released: number;
  jobNumbers: string[];
}

const EMPTY_RESULT: RecalcResult = { absorbed: 0, released: 0, jobNumbers: [] };

// jobDate/createdAt ต้องเป็นค่าดิบจาก Prisma — isAbsorbedBy เทียบด้วย UTC getters
// ห้ามแปลงผ่าน new Date(...)/toISOString() เพราะจะเพี้ยน timezone
const toAbsorbJob = (j: RecalcRow): AbsorbJob => ({
  id: j.id,
  jobDate: j.jobDate,
  jobType: j.jobType,
  size: j.size,
  driverId: j.driverId,
  customerId: j.customerId,
  createdAt: j.createdAt,
  isCancelled: j.isCancelled,
  clearStatus: j.clearStatus,
  hasPairLink: hasPairLink(j),
});

/**
 * คำนวณการดูดซับใหม่ทั้งหมดของคนขับ+วันที่ระบุ
 *
 * ดูงานหลัก "ทุกใบ" ของคนขับในวันนั้น ไม่ใช่แค่ใบที่เป็นต้นเหตุให้คำนวณ —
 * ไม่งั้นการปลดธงจากมุมมองของใบหนึ่ง จะไปลบธงที่อีกใบเป็นคนติดไว้อย่างถูกต้อง
 */
export async function recalcAbsorbForDriverDay(
  driverId: string | null | undefined,
  jobDate: Date | null | undefined
): Promise<RecalcResult> {
  if (!driverId || !jobDate) return EMPTY_RESULT;

  const [mains, towings] = await Promise.all([
    prisma.job.findMany({
      where: {
        driverId,
        jobDate,
        jobType: { in: ["inbound", "outbound"] },
      },
      select: { ...RECALC_SELECT, pickupLocation: { select: { name: true } } },
    }),
    prisma.job.findMany({
      where: {
        driverId,
        jobDate,
        jobType: { in: ["towing", "towingHeavy"] },
      },
      select: RECALC_SELECT,
    }),
  ]);

  // งานหลักที่รับตู้จากคาหาง/รับเช้าเดินทางเท่านั้นที่ดูดซับได้
  const absorbers = mains
    .filter((m) => isAbsorbPickupName(m.pickupLocation?.name))
    .map(toAbsorbJob);

  const toAbsorb: { id: string; jobNumber: string }[] = [];
  const toRelease: string[] = [];

  for (const t of towings) {
    // ทอยตู้ที่ถูกจับคู่งานแล้ว (ฝั่งใดฝั่งหนึ่ง) ห้ามให้โค้ดดูดซับแตะเลย —
    // ทั้งห้ามดูดซับใหม่ และห้ามปลดธงเดิม เพราะเงินของมันเป็นเรื่องของระบบจับคู่งาน
    if (hasPairLink(t)) continue;

    const tj = toAbsorbJob(t);
    // เข้าเกณฑ์ถ้ามีงานหลัก "ใบใดใบหนึ่ง" ดูดซับได้
    const qualifies = absorbers.some((m) => isAbsorbedBy(tj, m));
    if (qualifies && !t.isTowingAbsorbed) {
      toAbsorb.push({ id: t.id, jobNumber: t.jobNumber });
    }
    // ปลดธงเฉพาะใบที่ไม่เข้าเกณฑ์แล้ว และยังแก้ได้ (ไม่เคลียร์/ไม่ยกเลิก)
    if (!qualifies && t.isTowingAbsorbed && !t.clearStatus && !t.isCancelled) {
      toRelease.push(t.id);
    }
  }

  if (toAbsorb.length > 0 || toRelease.length > 0) {
    await prisma.$transaction([
      ...(toAbsorb.length > 0
        ? [
            prisma.job.updateMany({
              where: { id: { in: toAbsorb.map((t) => t.id) } },
              data: { driverWage: null, isTowingAbsorbed: true },
            }),
          ]
        : []),
      ...(toRelease.length > 0
        ? [
            prisma.job.updateMany({
              where: { id: { in: toRelease } },
              data: { isTowingAbsorbed: false },
            }),
          ]
        : []),
    ]);
  }

  return {
    absorbed: toAbsorb.length,
    released: toRelease.length,
    jobNumbers: toAbsorb.map((t) => t.jobNumber),
  };
}

/**
 * คำนวณการดูดซับใหม่ โดยอิงคนขับ+วันของงานหลักใบที่ระบุ
 * คืน null ถ้าไม่พบงาน — ผู้เรียกที่เป็น endpoint จะได้ตอบ 404 ได้
 */
export async function recalcAbsorbForMain(
  mainJobId: string
): Promise<RecalcResult | null> {
  const main = await prisma.job.findUnique({
    where: { id: mainJobId },
    select: { driverId: true, jobDate: true },
  });
  if (!main) return null;
  return recalcAbsorbForDriverDay(main.driverId, main.jobDate);
}
