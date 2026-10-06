// ค่าคงที่ของฟีเจอร์ต่ออายุรถ — middleware import ไฟล์นี้ จึงต้อง edge-safe (ห้าม import prisma / auth / fs)

export const RENEWAL_ROLES = ['ADMIN', 'MANAGER', 'INSURANCE'] as const

export const COVERAGE_TYPES = ['PRB', 'TAX', 'MOTOR_INSURANCE', 'CARGO_INSURANCE'] as const
export type CoverageTypeKey = (typeof COVERAGE_TYPES)[number]

export const RENEWAL_STATUSES = ['PENDING', 'IN_PROGRESS', 'RENEWED', 'NOT_RENEWED'] as const
export type RenewalStatusKey = (typeof RENEWAL_STATUSES)[number]

export const NOT_RENEWED_REASONS = ['SOLD', 'SUSPENDED', 'ACCIDENT', 'REPAIR', 'OTHER'] as const
export type NotRenewedReasonKey = (typeof NOT_RENEWED_REASONS)[number]

export const VEHICLE_STATUSES = ['ACTIVE', 'SUSPENDED', 'SOLD'] as const
export type VehicleStatusKey = (typeof VEHICLE_STATUSES)[number]

/** งวดที่ยังต้องดำเนินการ — ขึ้น dashboard และเปลี่ยนสถานะต่อได้ */
export const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS'] as const

/** ช่วงวันหมดเทียบกับวันนี้ (ดู dueWindow.ts) */
export type DueBucket = 'OVERDUE' | 'THIS_MONTH' | 'NEXT_MONTH' | 'LATER'

export const COVERAGE_CLASSES = ['ป.1', 'ป.2+', 'ป.3', 'ป.3+'] as const

export const COVERAGE_TYPE_LABELS: Record<CoverageTypeKey, string> = {
  PRB: 'พรบ.',
  TAX: 'ภาษี',
  MOTOR_INSURANCE: 'ประกันรถยนต์',
  CARGO_INSURANCE: 'ประกันสินค้า',
}

export const RENEWAL_STATUS_LABELS: Record<RenewalStatusKey, string> = {
  PENDING: 'รอต่อ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RENEWED: 'ต่อแล้ว',
  NOT_RENEWED: 'ไม่ต่อ',
}

export const RENEWAL_STATUS_COLORS: Record<RenewalStatusKey, string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  RENEWED: 'success',
  NOT_RENEWED: 'error',
}

export const NOT_RENEWED_REASON_LABELS: Record<NotRenewedReasonKey, string> = {
  SOLD: 'ขายรถ',
  SUSPENDED: 'งดใช้',
  ACCIDENT: 'รถเกิดอุบัติเหตุ',
  REPAIR: 'รถซ่อม',
  OTHER: 'อื่นๆ',
}

export const VEHICLE_STATUS_LABELS: Record<VehicleStatusKey, string> = {
  ACTIVE: 'ใช้งาน',
  SUSPENDED: 'งดใช้',
  SOLD: 'ขาย',
}

export const VEHICLE_STATUS_COLORS: Record<VehicleStatusKey, string> = {
  ACTIVE: 'green',
  SUSPENDED: 'gold',
  SOLD: 'default',
}

/** จำนวนแถวสูงสุดต่อ bulk action */
export const BULK_LIMIT = 500

/** Decimal(10,2) */
export const MAX_MONEY = 99_999_999.99

export function isRenewalRole(role: string | null | undefined): boolean {
  return !!role && (RENEWAL_ROLES as readonly string[]).includes(role)
}

export function isOpenStatus(status: RenewalStatusKey): boolean {
  return (OPEN_STATUSES as readonly RenewalStatusKey[]).includes(status)
}
