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
