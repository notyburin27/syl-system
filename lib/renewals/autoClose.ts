import { isOpenStatus, type RenewalStatusKey } from './constants'

export interface AutoCloseRow {
  id: string
  endDate: string
  renewalStatus: RenewalStatusKey
  renewedToId: string | null
}

export interface AutoCloseAction {
  id: string
  linkToId: string | null
}

/**
 * รถ 1 คัน 1 ประเภท (rows ต้องเป็นกลุ่มเดียวกัน): งวดเปิดได้เฉพาะงวดที่ endDate มากที่สุด
 * งวดเปิดที่เก่ากว่า → ปิดเป็น RENEWED และผูกกับงวดถัดไป ถ้างวดนั้นยังไม่มีงวดก่อนหน้าชี้อยู่
 */
export function planAutoClose(rows: AutoCloseRow[]): AutoCloseAction[] {
  const sorted = [...rows].sort((a, b) => a.endDate.localeCompare(b.endDate))
  const taken = new Set(rows.map((r) => r.renewedToId).filter((id): id is string => id !== null))
  const actions: AutoCloseAction[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]
    if (!isOpenStatus(current.renewalStatus)) continue
    const next = sorted[i + 1]
    const linkToId = taken.has(next.id) ? null : next.id
    if (linkToId) taken.add(linkToId)
    actions.push({ id: current.id, linkToId })
  }
  return actions
}
