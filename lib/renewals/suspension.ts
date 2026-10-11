import type { CoverageTypeKey, VehicleStatusKey } from './constants'

/**
 * รถงดใช้ที่แจ้ง ม.89 (วันที่แจ้งสถานะ) ก่อนหรือตรงวันครบกำหนดภาษี → ไม่ต้องต่อภาษีงวดนั้น
 * แจ้งหลังวันครบกำหนด หรือยังไม่กรอกวันที่แจ้ง → ต่อภาษีตามปกติ
 */
export function isTaxWaivedBySuspension(
  vehicle: { status: VehicleStatusKey; statusDate: string | null },
  coverage: { type: CoverageTypeKey; endDate: string },
): boolean {
  return (
    vehicle.status === 'SUSPENDED' &&
    coverage.type === 'TAX' &&
    vehicle.statusDate !== null &&
    vehicle.statusDate <= coverage.endDate
  )
}
