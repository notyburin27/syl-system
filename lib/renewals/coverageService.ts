import type { Prisma } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { planAutoClose, type AutoCloseRow } from './autoClose'
import { OPEN_STATUSES } from './constants'
import { dateToYmd, ymdToDate } from './dateOnly'
import { DUPLICATE_PERIOD_ERROR, badRequest, conflict, isUniqueViolation, notFound } from './http'
import { sanitizeCoverageFields, type CoverageCreateInput, type CoverageFields } from './schemas'

export type Tx = Prisma.TransactionClient

/** ข้อมูลงวดที่บันทึกลง DB (CoverageFields ใช้ได้ตรงๆ; coverageClass จาก DB เป็น string) */
export type PeriodData = {
  insurerId: string | null
  coverageClass: string | null
  policyNumber: string | null
  startDate: string | null
  endDate: string
  amount: number | null
  serviceFee: number | null
  pairedVehicleId: string | null
  renewalNote: string | null
}

export const OPEN_FILTER = { in: [...OPEN_STATUSES] }

export function coverageData(f: PeriodData) {
  return {
    insurerId: f.insurerId,
    coverageClass: f.coverageClass,
    policyNumber: f.policyNumber,
    startDate: f.startDate ? ymdToDate(f.startDate) : null,
    endDate: ymdToDate(f.endDate),
    amount: f.amount,
    serviceFee: f.serviceFee,
    pairedVehicleId: f.pairedVehicleId,
    renewalNote: f.renewalNote,
  }
}

export async function assertReferences(tx: Tx, f: PeriodData, vehicleId: string): Promise<void> {
  if (f.insurerId && !(await tx.insurer.findUnique({ where: { id: f.insurerId }, select: { id: true } }))) {
    throw badRequest('ไม่พบบริษัทประกัน')
  }
  if (f.pairedVehicleId) {
    if (f.pairedVehicleId === vehicleId) throw badRequest('หางคู่ต้องเป็นรถคนละคัน')
    if (!(await tx.vehicle.findUnique({ where: { id: f.pairedVehicleId }, select: { id: true } }))) {
      throw badRequest('ไม่พบรถหางคู่')
    }
  }
}

/** P2002 จาก unique (vehicleId, type, endDate) → 409 ข้อความไทย */
export async function withDuplicateGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_PERIOD_ERROR)
    throw error
  }
}

/**
 * บังคับกติกางวดของรถที่ระบุ — เรียกทุกครั้งหลังแก้รถ/งวด (รวม import)
 * - รถสถานะขาย: ไม่มีงวดเปิด → ปิดเป็น ไม่ต่อ/ขายรถ
 * - รถอื่น: 1 คัน 1 ประเภท เปิดได้เฉพาะงวดที่หมดช้าสุด (planAutoClose)
 * คืนจำนวนงวดที่ถูกปิด
 */
export async function enforceCoverageRules(tx: Tx, vehicleIds: string[], userId: string): Promise<number> {
  const ids = [...new Set(vehicleIds)]
  if (ids.length === 0) return 0
  const now = new Date()
  let closed = 0

  const soldIds = (
    await tx.vehicle.findMany({ where: { id: { in: ids }, status: 'SOLD' }, select: { id: true } })
  ).map((v) => v.id)
  if (soldIds.length > 0) {
    const res = await tx.vehicleCoverage.updateMany({
      where: { vehicleId: { in: soldIds }, renewalStatus: OPEN_FILTER },
      data: { renewalStatus: 'NOT_RENEWED', notRenewedReason: 'SOLD', statusUpdatedAt: now, statusUpdatedById: userId },
    })
    closed += res.count
  }

  const otherIds = ids.filter((id) => !soldIds.includes(id))
  if (otherIds.length === 0) return closed
  const rows = await tx.vehicleCoverage.findMany({
    where: { vehicleId: { in: otherIds } },
    select: { id: true, vehicleId: true, type: true, endDate: true, renewalStatus: true, renewedToId: true },
  })
  const groups = new Map<string, AutoCloseRow[]>()
  for (const r of rows) {
    const key = `${r.vehicleId}|${r.type}`
    const item = { id: r.id, endDate: dateToYmd(r.endDate), renewalStatus: r.renewalStatus, renewedToId: r.renewedToId }
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  for (const group of groups.values()) {
    for (const action of planAutoClose(group)) {
      await tx.vehicleCoverage.update({
        where: { id: action.id },
        data: {
          renewalStatus: 'RENEWED',
          notRenewedReason: null,
          renewedToId: action.linkToId,
          statusUpdatedAt: now,
          statusUpdatedById: userId,
        },
      })
      closed++
    }
  }
  return closed
}

export async function createCoverage(input: CoverageCreateInput, userId: string): Promise<string> {
  const { vehicleId, type, ...rest } = input
  const fields = sanitizeCoverageFields(type, rest)
  return withDuplicateGuard(() =>
    prisma.$transaction(async (tx) => {
      if (!(await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } }))) throw notFound('ไม่พบรถ')
      await assertReferences(tx, fields, vehicleId)
      const created = await tx.vehicleCoverage.create({
        data: { vehicleId, type, ...coverageData(fields), createdById: userId },
      })
      await enforceCoverageRules(tx, [vehicleId], userId)
      return created.id
    }),
  )
}

/** แก้ข้อมูลงวด (ไม่รวมสถานะการต่อ — ใช้ endpoint เฉพาะ) */
export async function updateCoverage(id: string, input: CoverageFields, userId: string): Promise<void> {
  await withDuplicateGuard(() =>
    prisma.$transaction(async (tx) => {
      const row = await tx.vehicleCoverage.findUnique({ where: { id }, select: { vehicleId: true, type: true } })
      if (!row) throw notFound('ไม่พบงวด')
      const fields = sanitizeCoverageFields(row.type, input)
      await assertReferences(tx, fields, row.vehicleId)
      await tx.vehicleCoverage.update({ where: { id }, data: coverageData(fields) })
      await enforceCoverageRules(tx, [row.vehicleId], userId)
    }),
  )
}

/**
 * ลบงวด — งวดก่อนหน้าที่ต่อมาเป็นงวดนี้กลับเป็นรอต่อ (กรณีกด "ต่อแล้ว" ผิด)
 * คืน fileKey ของไฟล์แนบ ให้ caller ลบใน storage หลัง transaction สำเร็จ
 */
export async function deleteCoverage(id: string, userId: string): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.vehicleCoverage.findUnique({
      where: { id },
      select: { vehicleId: true, attachments: { select: { fileKey: true } } },
    })
    if (!row) throw notFound('ไม่พบงวด')
    await tx.vehicleCoverage.updateMany({
      where: { renewedToId: id },
      data: {
        renewalStatus: 'PENDING',
        renewedToId: null,
        notRenewedReason: null,
        statusUpdatedAt: new Date(),
        statusUpdatedById: userId,
      },
    })
    await tx.vehicleCoverage.delete({ where: { id } })
    await enforceCoverageRules(tx, [row.vehicleId], userId)
    return row.attachments.map((a) => a.fileKey)
  })
}
