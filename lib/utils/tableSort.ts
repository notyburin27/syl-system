import dayjs from 'dayjs'
import type { SortOrder } from 'antd/es/table/interface'

// ไม่มีวันที่อยู่ท้ายเสมอ — antd กลับผล compare ตอน descend จึงต้องกลับเองด้วย
export function compareDateNullsLast(a: string | null | undefined, b: string | null | undefined, sortOrder?: SortOrder) {
  if (!a || !b) {
    if (!a && !b) return 0
    const nullLast = a ? -1 : 1
    return sortOrder === 'descend' ? -nullLast : nullLast
  }
  return dayjs(a).valueOf() - dayjs(b).valueOf()
}
