import dayjs, { type Dayjs } from 'dayjs'
import type { CoverageDto } from '@/types/renewals'

/** format ของ ThaiDatePicker — YYYY แสดง/รับเป็นปี พ.ศ. (ดู lib/renewals/buddhistDate.ts) */
export const DATE_FORMAT = 'DD/MM/YYYY'

export interface CoverageFormValues {
  insurerId?: string | null
  agentName?: string | null
  coverageClass?: string | null
  policyNumber?: string | null
  startDate?: Dayjs | null
  endDate?: Dayjs | null
  amount?: number | null
  serviceFee?: number | null
  pairedVehicleId?: string | null
  renewalNote?: string | null
}

export interface CoverageFieldsBody {
  insurerId: string | null
  agentName: string | null
  coverageClass: string | null
  policyNumber: string | null
  startDate: string | null
  endDate: string
  amount: number | null
  serviceFee: number | null
  pairedVehicleId: string | null
  renewalNote: string | null
}

const toYmd = (d: Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : null)

/** endDate เป็นช่องบังคับใน Form (rules) จึงมีค่าเสมอหลัง validateFields */
export function formValuesToBody(v: CoverageFormValues): CoverageFieldsBody {
  return {
    insurerId: v.insurerId ?? null,
    agentName: v.agentName?.trim() || null,
    coverageClass: v.coverageClass ?? null,
    policyNumber: v.policyNumber?.trim() || null,
    startDate: toYmd(v.startDate),
    endDate: toYmd(v.endDate) ?? '',
    amount: v.amount ?? null,
    serviceFee: v.serviceFee ?? null,
    pairedVehicleId: v.pairedVehicleId ?? null,
    renewalNote: v.renewalNote?.trim() || null,
  }
}

export function dtoToFormValues(dto: CoverageDto): CoverageFormValues {
  return {
    insurerId: dto.insurerId,
    agentName: dto.agentName,
    coverageClass: dto.coverageClass,
    policyNumber: dto.policyNumber,
    startDate: dto.startDate ? dayjs(dto.startDate) : null,
    endDate: dayjs(dto.endDate),
    amount: dto.amount,
    serviceFee: dto.serviceFee,
    pairedVehicleId: dto.pairedVehicleId,
    renewalNote: dto.renewalNote,
  }
}

/** body สำหรับ PATCH งวดจาก DTO เดิม (ใช้ตอนแก้เฉพาะหมายเหตุ) */
export function dtoToBody(dto: CoverageDto): CoverageFieldsBody {
  return {
    insurerId: dto.insurerId,
    agentName: dto.agentName,
    coverageClass: dto.coverageClass,
    policyNumber: dto.policyNumber,
    startDate: dto.startDate,
    endDate: dto.endDate,
    amount: dto.amount,
    serviceFee: dto.serviceFee,
    pairedVehicleId: dto.pairedVehicleId,
    renewalNote: dto.renewalNote,
  }
}
