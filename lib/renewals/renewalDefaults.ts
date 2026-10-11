import { addDays, addYears, isValidYmd } from './dateOnly'

/** ค่าเริ่มต้นของงวดใหม่ตอนกด "ต่อแล้ว" */
export function nextPeriodDefaults(oldEndDate: string): { startDate: string; endDate: string } {
  return { startDate: addDays(oldEndDate, 1), endDate: addYears(oldEndDate, 1) }
}

/** คืนข้อความ error ภาษาไทย หรือ null ถ้าผ่าน */
export function validateNewPeriod(oldEndDate: string, startDate: string | null, endDate: string): string | null {
  if (!isValidYmd(endDate)) return 'วันสิ้นสุดไม่ถูกต้อง'
  if (startDate !== null && !isValidYmd(startDate)) return 'วันเริ่มไม่ถูกต้อง'
  if (endDate <= oldEndDate) return 'วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม'
  if (startDate !== null && endDate < startDate) return 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'
  return null
}
