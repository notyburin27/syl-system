import type { DueBucket } from './constants'
import { addDays, endOfMonth } from './dateOnly'

/** dashboard แสดงงวดเปิดที่หมดไม่เกินวันนี้ของฟังก์ชันนี้ */
export function endOfNextMonth(today: string): string {
  return endOfMonth(addDays(endOfMonth(today), 1))
}

export function dueBucket(endDate: string, today: string): DueBucket {
  if (endDate < today) return 'OVERDUE'
  if (endDate <= endOfMonth(today)) return 'THIS_MONTH'
  if (endDate <= endOfNextMonth(today)) return 'NEXT_MONTH'
  return 'LATER'
}

export const DUE_BUCKET_COLORS: Record<DueBucket, string> = {
  OVERDUE: 'red',
  THIS_MONTH: 'orange',
  NEXT_MONTH: 'blue',
  LATER: 'default',
}

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  OVERDUE: 'เลยกำหนด',
  THIS_MONTH: 'หมดเดือนนี้',
  NEXT_MONTH: 'หมดเดือนหน้า',
  LATER: 'หลังเดือนหน้า',
}
