import { isPairableJobType, isPairableSize, isTowingJobType } from "@/types/job";

/** ข้อมูลขั้นต่ำที่ใช้ตัดสินว่าจับคู่ได้ไหม */
export interface PairableJob {
  id: string;
  jobDate: Date;
  jobType: string;
  size: string | null;
  driverId: string | null;
  factoryLocationId: string | null;
  isCancelled: boolean;
  clearStatus: boolean;
  /** true = ใบนี้อยู่ในคู่อื่นแล้ว */
  hasPairLink: boolean;
}

/** เทียบเฉพาะวัน ไม่สนเวลา — jobDate เก็บเป็น @db.Date อยู่แล้วแต่กันพลาด */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * ตรวจว่าสองใบจับคู่กันได้ไหม
 * คืน null = จับคู่ได้ / คืน string = เหตุผลภาษาไทยที่จับคู่ไม่ได้
 *
 * ใช้ร่วมกันทั้ง candidate query และ validation ตอน POST
 * เพื่อไม่ให้กฎสองฝั่งหลุดจากกัน
 */
export function checkPairable(a: PairableJob, b: PairableJob): string | null {
  if (a.id === b.id) return "จับคู่กับงานเดียวกันไม่ได้";

  if (a.hasPairLink || b.hasPairLink) return "งานนี้ถูกจับคู่ไปแล้ว";
  if (a.isCancelled || b.isCancelled) return "งานที่ยกเลิกแล้วจับคู่ไม่ได้";
  if (a.clearStatus || b.clearStatus) return "งานที่เคลียร์แล้วจับคู่ไม่ได้";

  if (!isPairableJobType(a.jobType) || !isPairableJobType(b.jobType)) {
    return "ลักษณะงานนี้จับคู่ไม่ได้";
  }
  if (a.jobType !== b.jobType) return "ลักษณะงานไม่ตรงกัน";

  if (!isPairableSize(a.size) || !isPairableSize(b.size)) {
    return "SIZE นี้จับคู่ไม่ได้";
  }
  if (a.size !== b.size) return "SIZE ไม่ตรงกัน";

  if (!a.driverId || !b.driverId || a.driverId !== b.driverId) {
    return "คนขับไม่ตรงกัน";
  }

  if (!isSameDay(a.jobDate, b.jobDate)) return "วันที่งานไม่ตรงกัน";

  // ทอยตู้/ทอยตู้หนักไม่ผูกโรงงาน — เช็คเฉพาะขาเข้า/ขาออก
  if (!isTowingJobType(a.jobType) && a.factoryLocationId !== b.factoryLocationId) {
    return "โรงงานไม่ตรงกัน";
  }

  return null;
}
