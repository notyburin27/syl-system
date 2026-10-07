import type { ImportErrorDto, ImportSummaryDto } from '@/types/renewals'
import { planAutoClose, type AutoCloseRow } from '../autoClose'
import {
  COVERAGE_CLASSES,
  COVERAGE_TYPE_LABELS,
  NOT_RENEWED_REASON_LABELS,
  VEHICLE_STATUS_LABELS,
  isOpenStatus,
  type CoverageTypeKey,
  type NotRenewedReasonKey,
  type RenewalStatusKey,
  type VehicleStatusKey,
} from '../constants'
import { normalizePlate } from '../plate'
import { cellText, lookupLabel, parseImportDate, parseImportInt, parseImportMoney, parseImportProvince } from './cells'
import {
  COVERAGE_COLUMNS,
  COVERAGE_SHEET,
  IMPORT_STATUS_LABELS,
  VEHICLE_COLUMNS,
  VEHICLE_SHEET,
  type CoverageColumnKey,
  type ImportStatusKey,
  type RawRow,
  type VehicleColumnKey,
} from './columns'

/** ข้อมูลเดิมใน DB ที่ใช้ตรวจ (โหลดครั้งเดียวโดย loadImportSnapshot) */
export interface ExistingSnapshot {
  vehicles: { id: string; plate: string; status: VehicleStatusKey }[]
  insurers: { id: string; name: string; isActive: boolean }[]
  coverages: {
    id: string
    vehicleId: string
    type: CoverageTypeKey
    endDate: string
    renewalStatus: RenewalStatusKey
    renewedToId: string | null
  }[]
}

export interface VehicleUpsert {
  plate: string
  existingId: string | null
  /** เฉพาะช่องที่กรอก — ช่องว่างไม่อยู่ใน data (คงค่าเดิม) */
  data: {
    plateProvince?: string
    registrationDate?: string
    fleetNumber?: string
    ownerName?: string
    vehicleType?: string
    brand?: string
    modelName?: string
    color?: string
    chassisNumber?: string
    chassisPosition?: string
    engineNumber?: string
    fuelType?: string
    note?: string
    engineCylinders?: number
    engineHorsepower?: number
    axleCount?: number
    weightKg?: number
    status?: VehicleStatusKey
    statusDate?: string
  }
}

export interface CoverageUpsert {
  plate: string
  type: CoverageTypeKey
  endDate: string
  existingId: string | null
  /** สถานะของงวดเดิมตอน snapshot (null = งวดใหม่) — apply ใช้เป็นเงื่อนไขกันชนกับการแก้จากหน้าจอ */
  existingStatus: RenewalStatusKey | null
  data: {
    insurerId?: string
    coverageClass?: string
    policyNumber?: string
    startDate?: string
    amount?: number
    serviceFee?: number
    pairedPlate?: string
    renewalStatus?: ImportStatusKey
    notRenewedReason?: NotRenewedReasonKey
    renewalNote?: string
  }
}

export interface ImportPlan {
  vehicles: VehicleUpsert[]
  coverages: CoverageUpsert[]
}

export interface ImportValidation {
  errors: ImportErrorDto[]
  unknownInsurers: string[]
  plan: ImportPlan
  summary: ImportSummaryDto
}

const VEHICLE_TEXT_FIELDS = [
  'fleetNumber',
  'ownerName',
  'vehicleType',
  'brand',
  'modelName',
  'color',
  'chassisNumber',
  'chassisPosition',
  'engineNumber',
  'fuelType',
  'note',
] as const

/** ค่าสูงสุดเท่ากับ vehicleInputSchema */
const VEHICLE_INT_MAX = { engineCylinders: 100, engineHorsepower: 10_000, axleCount: 20, weightKg: 100_000 } as const
const VEHICLE_DATE_FIELDS = ['registrationDate', 'statusDate'] as const

const choices = (labels: Record<string, string>) => `ต้องเป็น ${Object.values(labels).join(' / ')}`

function pushDuplicates(
  seen: Map<string, number[]>,
  sheet: string,
  field: string,
  describe: (key: string) => string,
  errors: ImportErrorDto[],
) {
  for (const [key, rows] of seen) {
    if (rows.length < 2) continue
    for (const row of rows) errors.push({ sheet, row, field, message: `${describe(key)} ซ้ำในไฟล์ (แถว ${rows.join(', ')})` })
  }
}

function validateVehicles(
  rows: RawRow<VehicleColumnKey>[],
  vehicleByPlate: Map<string, ExistingSnapshot['vehicles'][number]>,
  errors: ImportErrorDto[],
): VehicleUpsert[] {
  const result: VehicleUpsert[] = []
  const seen = new Map<string, number[]>()
  for (const r of rows) {
    const err = (field: VehicleColumnKey, message: string) =>
      errors.push({ sheet: VEHICLE_SHEET, row: r.row, field: VEHICLE_COLUMNS[field], message })
    const plate = normalizePlate(cellText(r.values.plate))
    if (!plate) {
      err('plate', 'กรุณากรอกทะเบียน')
      continue
    }
    seen.set(plate, [...(seen.get(plate) ?? []), r.row])

    const data: VehicleUpsert['data'] = {}
    for (const field of VEHICLE_TEXT_FIELDS) {
      const text = cellText(r.values[field])
      if (text) data[field] = text
    }
    for (const field of Object.keys(VEHICLE_INT_MAX) as (keyof typeof VEHICLE_INT_MAX)[]) {
      const n = parseImportInt(r.values[field], VEHICLE_INT_MAX[field])
      if ('error' in n) err(field, n.error)
      else if (n.value !== null) data[field] = n.value
    }
    const province = parseImportProvince(r.values.plateProvince)
    if ('error' in province) err('plateProvince', province.error)
    else if (province.value) data.plateProvince = province.value
    const status = lookupLabel(VEHICLE_STATUS_LABELS, r.values.status)
    if (status === undefined) err('status', choices(VEHICLE_STATUS_LABELS))
    else if (status) data.status = status
    for (const field of VEHICLE_DATE_FIELDS) {
      const date = parseImportDate(r.values[field])
      if ('error' in date) err(field, date.error)
      else if (date.value) data[field] = date.value
    }

    const current = vehicleByPlate.get(plate)
    if (!current) {
      if (!data.ownerName) err('ownerName', 'รถใหม่ต้องกรอกบริษัท')
      if (!data.vehicleType) err('vehicleType', 'รถใหม่ต้องกรอกลักษณะ')
    }
    result.push({ plate, existingId: current?.id ?? null, data })
  }
  pushDuplicates(seen, VEHICLE_SHEET, VEHICLE_COLUMNS.plate, (plate) => `ทะเบียน ${plate}`, errors)
  return result
}

function validateCoverages(
  rows: RawRow<CoverageColumnKey>[],
  existing: ExistingSnapshot,
  knownPlates: Set<string>,
  errors: ImportErrorDto[],
  unknownInsurers: Set<string>,
): CoverageUpsert[] {
  const vehicleIdByPlate = new Map(existing.vehicles.map((v) => [v.plate, v.id]))
  const insurerByName = new Map(existing.insurers.map((i) => [i.name, i]))
  const coverageByKey = new Map(existing.coverages.map((c) => [`${c.vehicleId}|${c.type}|${c.endDate}`, c]))
  const result: CoverageUpsert[] = []
  const seen = new Map<string, number[]>()

  for (const r of rows) {
    const err = (field: CoverageColumnKey, message: string) =>
      errors.push({ sheet: COVERAGE_SHEET, row: r.row, field: COVERAGE_COLUMNS[field], message })

    const plate = normalizePlate(cellText(r.values.plate))
    const type = lookupLabel(COVERAGE_TYPE_LABELS, r.values.type)
    const endDate = parseImportDate(r.values.endDate)
    const end = 'error' in endDate ? null : endDate.value
    if (!plate) err('plate', 'กรุณากรอกทะเบียน')
    else if (!knownPlates.has(plate)) err('plate', `ไม่พบรถทะเบียน ${plate} — เพิ่มในชีต "${VEHICLE_SHEET}" ก่อน`)
    if (type === null) err('type', 'กรุณาเลือกประเภท')
    else if (type === undefined) err('type', choices(COVERAGE_TYPE_LABELS))
    if ('error' in endDate) err('endDate', endDate.error)
    else if (end === null) err('endDate', 'กรุณากรอกวันสิ้นสุด')
    // ช่อง key ไม่ครบ → ข้ามการตรวจช่องอื่นของแถวนี้ (แก้ key แล้วตรวจใหม่)
    if (!plate || !knownPlates.has(plate) || !type || !end) continue

    const key = `${plate}|${type}|${end}`
    seen.set(key, [...(seen.get(key) ?? []), r.row])
    const isMotor = type === 'MOTOR_INSURANCE'
    const data: CoverageUpsert['data'] = {}

    const insurerName = cellText(r.values.insurer)
    if (insurerName) {
      const insurer = insurerByName.get(insurerName)
      if (type === 'TAX') err('insurer', 'ภาษีไม่ต้องกรอกบริษัทประกัน')
      else if (!insurer) {
        unknownInsurers.add(insurerName)
        err('insurer', `ไม่พบบริษัทประกัน "${insurerName}" ในระบบ`)
      } else if (!insurer.isActive) err('insurer', `บริษัทประกัน "${insurerName}" ถูกปิดใช้งาน`)
      else data.insurerId = insurer.id
    }

    const coverageClass = cellText(r.values.coverageClass)
    if (coverageClass) {
      if (!isMotor) err('coverageClass', 'กรอกชั้นได้เฉพาะประกันรถยนต์')
      else if (!(COVERAGE_CLASSES as readonly string[]).includes(coverageClass)) {
        err('coverageClass', `ชั้นต้องเป็น ${COVERAGE_CLASSES.join(' / ')}`)
      } else data.coverageClass = coverageClass
    }

    const pairedPlate = normalizePlate(cellText(r.values.pairedPlate))
    if (pairedPlate) {
      if (!isMotor) err('pairedPlate', 'กรอกหางคู่ได้เฉพาะประกันรถยนต์')
      else if (pairedPlate === plate) err('pairedPlate', 'หางคู่ต้องเป็นรถคนละคัน')
      else if (!knownPlates.has(pairedPlate)) err('pairedPlate', `ไม่พบรถทะเบียน ${pairedPlate}`)
      else data.pairedPlate = pairedPlate
    }

    const policyNumber = cellText(r.values.policyNumber)
    if (policyNumber) data.policyNumber = policyNumber
    const startDate = parseImportDate(r.values.startDate)
    if ('error' in startDate) err('startDate', startDate.error)
    else if (startDate.value && startDate.value > end) err('startDate', 'วันเริ่มต้องไม่หลังวันสิ้นสุด')
    else if (startDate.value) data.startDate = startDate.value
    for (const field of ['amount', 'serviceFee'] as const) {
      const money = parseImportMoney(r.values[field])
      if ('error' in money) err(field, money.error)
      else if (money.value !== null) data[field] = money.value
    }
    const note = cellText(r.values.renewalNote)
    if (note) data.renewalNote = note

    const status = lookupLabel(IMPORT_STATUS_LABELS, r.values.renewalStatus)
    if (status === undefined) {
      const isRenewed = cellText(r.values.renewalStatus).replace(/\s/g, '') === 'ต่อแล้ว'
      err('renewalStatus', isRenewed ? 'ไม่รับสถานะ "ต่อแล้ว" — ระบบปิดงวดเก่าให้เองเมื่อมีงวดใหม่' : choices(IMPORT_STATUS_LABELS))
    } else if (status) data.renewalStatus = status

    const reason = lookupLabel(NOT_RENEWED_REASON_LABELS, r.values.notRenewedReason)
    if (reason === undefined) err('notRenewedReason', choices(NOT_RENEWED_REASON_LABELS))
    else if (reason && status !== 'NOT_RENEWED') err('notRenewedReason', 'กรอกเหตุผลได้เฉพาะสถานะ "ไม่ต่อ"')
    else if (reason) data.notRenewedReason = reason
    if (status === 'NOT_RENEWED' && reason === null) err('notRenewedReason', 'สถานะ "ไม่ต่อ" ต้องกรอกเหตุผล')
    if (reason === 'OTHER' && !note) err('renewalNote', 'เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ')

    const vehicleId = vehicleIdByPlate.get(plate)
    const current = vehicleId ? coverageByKey.get(`${vehicleId}|${type}|${end}`) : undefined
    if (current && status && !isOpenStatus(current.renewalStatus) && current.renewalStatus !== status) {
      err('renewalStatus', 'งวดนี้ปิดแล้ว — เปลี่ยนสถานะผ่านหน้าจอ')
    }
    result.push({ plate, type, endDate: end, existingId: current?.id ?? null, existingStatus: current?.renewalStatus ?? null, data })
  }

  pushDuplicates(seen, COVERAGE_SHEET, COVERAGE_COLUMNS.endDate, (key) => {
    const [plate, type, end] = key.split('|')
    return `งวด ${plate} ${COVERAGE_TYPE_LABELS[type as CoverageTypeKey]} หมด ${end}`
  }, errors)
  return result
}

/** จำลองผลสำหรับ preview — ต้องตรงกับ applyRenewalImport (upsert แล้ว enforceCoverageRules กับรถที่ไฟล์แตะ) */
function simulateSummary(plan: ImportPlan, existing: ExistingSnapshot): ImportSummaryDto {
  const vehicleByPlate = new Map(existing.vehicles.map((v) => [v.plate, v]))
  const idOf = (plate: string) => vehicleByPlate.get(plate)?.id ?? `new:${plate}`
  const finalStatus = new Map<string, VehicleStatusKey>(existing.vehicles.map((v) => [v.id, v.status]))
  for (const v of plan.vehicles) if (v.data.status) finalStatus.set(idOf(v.plate), v.data.status)

  type SimRow = AutoCloseRow & { vehicleId: string; type: CoverageTypeKey }
  const rows = new Map<string, SimRow>(existing.coverages.map((c) => [c.id, { ...c }]))
  plan.coverages.forEach((c, i) => {
    const current = c.existingId ? rows.get(c.existingId) : undefined
    if (current) {
      if (c.data.renewalStatus) current.renewalStatus = c.data.renewalStatus
      return
    }
    const id = `new:${i}`
    rows.set(id, {
      id,
      vehicleId: idOf(c.plate),
      type: c.type,
      endDate: c.endDate,
      renewalStatus: c.data.renewalStatus ?? 'PENDING',
      renewedToId: null,
    })
  })

  const touched = new Set([...plan.vehicles.map((v) => idOf(v.plate)), ...plan.coverages.map((c) => idOf(c.plate))])
  const groups = new Map<string, SimRow[]>()
  for (const row of rows.values()) {
    if (!touched.has(row.vehicleId)) continue
    const key = `${row.vehicleId}|${row.type}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  let autoClosed = 0
  for (const group of groups.values()) {
    const sold = finalStatus.get(group[0].vehicleId) === 'SOLD'
    autoClosed += sold ? group.filter((r) => isOpenStatus(r.renewalStatus)).length : planAutoClose(group).length
  }

  return {
    vehiclesCreated: plan.vehicles.filter((v) => !v.existingId).length,
    vehiclesUpdated: plan.vehicles.filter((v) => v.existingId).length,
    coveragesCreated: plan.coverages.filter((c) => !c.existingId).length,
    coveragesUpdated: plan.coverages.filter((c) => c.existingId).length,
    coveragesAutoClosed: autoClosed,
  }
}

export function validateRenewalImport(
  input: { vehicles: RawRow<VehicleColumnKey>[]; coverages: RawRow<CoverageColumnKey>[] },
  existing: ExistingSnapshot,
): ImportValidation {
  const errors: ImportErrorDto[] = []
  const unknownInsurers = new Set<string>()
  const vehicleByPlate = new Map(existing.vehicles.map((v) => [v.plate, v]))
  const vehicles = validateVehicles(input.vehicles, vehicleByPlate, errors)
  const knownPlates = new Set([...vehicleByPlate.keys(), ...vehicles.map((v) => v.plate)])
  const coverages = validateCoverages(input.coverages, existing, knownPlates, errors, unknownInsurers)
  const plan = { vehicles, coverages }
  // ชีตรถก่อน แล้วเรียงตามแถว (sort เสถียร — ช่องในแถวเดียวกันคงลำดับเดิม)
  errors.sort((a, b) => (a.sheet === b.sheet ? a.row - b.row : a.sheet === VEHICLE_SHEET ? -1 : 1))
  return {
    errors,
    unknownInsurers: [...unknownInsurers].sort((a, b) => a.localeCompare(b, 'th')),
    plan,
    summary: simulateSummary(plan, existing),
  }
}
