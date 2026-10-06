import type {
  CoverageTypeKey,
  DueBucket,
  NotRenewedReasonKey,
  RenewalStatusKey,
  VehicleStatusKey,
} from '@/lib/renewals/constants'

// DTO ที่ API ส่งให้ UI — วันที่เป็น 'YYYY-MM-DD', เงินเป็น number

export interface VehicleSummaryDto {
  id: string
  plate: string
  fleetNumber: string | null
  ownerName: string
  vehicleType: string
  status: VehicleStatusKey
}

export interface VehicleDto extends VehicleSummaryDto {
  brand: string | null
  chassisNumber: string | null
  fuelType: string | null
  weightKg: number | null
  statusDate: string | null
  note: string | null
}

export interface VehicleListItemDto extends VehicleDto {
  /** วันสิ้นสุดของงวดล่าสุดแต่ละประเภท */
  latestEndDates: Partial<Record<CoverageTypeKey, string>>
}

export interface InsurerDto {
  id: string
  name: string
  isActive: boolean
}

export interface CoverageDto {
  id: string
  vehicleId: string
  type: CoverageTypeKey
  insurerId: string | null
  insurerName: string | null
  coverageClass: string | null
  policyNumber: string | null
  startDate: string | null
  endDate: string
  amount: number | null
  serviceFee: number | null
  pairedVehicleId: string | null
  pairedPlate: string | null
  renewalStatus: RenewalStatusKey
  notRenewedReason: NotRenewedReasonKey | null
  renewalNote: string | null
  renewedToId: string | null
  attachmentCount: number
  vehicle: VehicleSummaryDto
}

export interface VehicleDetailResponse {
  vehicle: VehicleDto
  coverages: CoverageDto[]
}

export interface DashboardItemDto extends CoverageDto {
  bucket: DueBucket
}

export interface DashboardResponse {
  today: string
  items: DashboardItemDto[]
}

export interface AttachmentDto {
  id: string
  coverageId: string
  fileName: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

export interface ImportErrorDto {
  sheet: string
  row: number
  field: string
  message: string
}

export interface ImportSummaryDto {
  vehiclesCreated: number
  vehiclesUpdated: number
  coveragesCreated: number
  coveragesUpdated: number
  coveragesAutoClosed: number
}

export interface ImportPreviewResponse {
  valid: boolean
  errors: ImportErrorDto[]
  unknownInsurers: string[]
  summary: ImportSummaryDto
}

export interface ImportCommitResponse {
  success: true
  summary: ImportSummaryDto
}
