import dayjs, { type Dayjs } from 'dayjs'

/**
 * วันครบกำหนดชำระเริ่มต้น = วันที่ `day` ของเดือนถัดจาก `from`
 * ถ้าเดือนนั้นไม่มีวันที่นั้น (เช่น 31 ในเดือน ก.พ.) ใช้วันสุดท้ายของเดือนแทน
 */
export function nextMonthDueDate(day: number, from: Dayjs = dayjs()): Dayjs {
  const nextMonth = from.startOf('month').add(1, 'month')
  return nextMonth.date(Math.min(day, nextMonth.daysInMonth()))
}

/** ค่า defaultDueDay ที่รับได้: null (ไม่ตั้ง) หรือจำนวนเต็ม 1–31 */
export function isValidDueDay(value: unknown): value is number | null | undefined {
  return value == null || (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 31)
}
