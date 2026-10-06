import type { Prisma } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { planAutoClose, type AutoCloseRow } from './autoClose'
import { OPEN_STATUSES, isOpenStatus, type CoverageTypeKey } from './constants'
import { dateToYmd, ymdToDate } from './dateOnly'
import { CLOSED_ERROR, DUPLICATE_PERIOD_ERROR, badRequest, conflict, isUniqueViolation, notFound } from './http'
import { validateNewPeriod } from './renewalDefaults'
import {
  sanitizeCoverageFields,
  type BulkRenewInput,
  type BulkStatusInput,
  type CoverageCreateInput,
  type CoverageFields,
} from './schemas'

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
      const row = await tx.vehicleCoverage.findUnique({ where: { id }, select: { vehicleId: true, type: true, renewedToId: true } })
      if (!row) throw notFound('ไม่พบงวด')
      const fields = sanitizeCoverageFields(row.type, input)
      await assertReferences(tx, fields, row.vehicleId)
      // กันย้ายวันสิ้นสุดข้ามงวดที่ผูกกัน (จะเกิดวงวน renewedTo)
      const [prev, next] = await Promise.all([
        tx.vehicleCoverage.findFirst({ where: { renewedToId: id }, select: { endDate: true } }),
        row.renewedToId
          ? tx.vehicleCoverage.findUnique({ where: { id: row.renewedToId }, select: { endDate: true } })
          : null,
      ])
      if (prev && fields.endDate <= dateToYmd(prev.endDate)) {
        throw badRequest('วันสิ้นสุดต้องหลังวันสิ้นสุดของงวดก่อนหน้า')
      }
      if (next && fields.endDate >= dateToYmd(next.endDate)) {
        throw badRequest('วันสิ้นสุดต้องก่อนวันสิ้นสุดของงวดถัดไป')
      }
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

/** ปิดงวดเดิมแบบมีเงื่อนไข (กันกดซ้ำ/พร้อมกัน) แล้วสร้างงวดใหม่และผูก renewedToId */
async function createNextPeriod(
  tx: Tx,
  old: { id: string; vehicleId: string; type: CoverageTypeKey },
  fields: PeriodData,
  userId: string,
): Promise<string> {
  const claimed = await tx.vehicleCoverage.updateMany({
    where: { id: old.id, renewalStatus: OPEN_FILTER },
    data: { renewalStatus: 'RENEWED', notRenewedReason: null, statusUpdatedAt: new Date(), statusUpdatedById: userId },
  })
  if (claimed.count !== 1) throw conflict(CLOSED_ERROR)
  const created = await tx.vehicleCoverage.create({
    data: { vehicleId: old.vehicleId, type: old.type, ...coverageData(fields), createdById: userId },
  })
  await tx.vehicleCoverage.update({ where: { id: old.id }, data: { renewedToId: created.id } })
  return created.id
}

export async function renewCoverage(id: string, input: CoverageFields, userId: string): Promise<string> {
  return withDuplicateGuard(() =>
    prisma.$transaction(async (tx) => {
      const old = await tx.vehicleCoverage.findUnique({
        where: { id },
        select: { id: true, vehicleId: true, type: true, endDate: true, renewalStatus: true },
      })
      if (!old) throw notFound('ไม่พบงวด')
      if (!isOpenStatus(old.renewalStatus)) throw conflict(CLOSED_ERROR)
      const periodError = validateNewPeriod(dateToYmd(old.endDate), input.startDate, input.endDate)
      if (periodError) throw badRequest(periodError)
      const fields = sanitizeCoverageFields(old.type, input)
      await assertReferences(tx, fields, old.vehicleId)
      return createNextPeriod(tx, old, fields, userId)
    }),
  )
}

/** ต่อแล้วหลายรายการ (ประเภทเดียวกัน) — ทั้งชุดสำเร็จหรือไม่สำเร็จพร้อมกัน; เบี้ย/ค่าบริการคัดลอกจากงวดเดิมรายคัน */
export async function bulkRenew(input: BulkRenewInput, userId: string): Promise<number> {
  const ids = [...new Set(input.ids)]
  return withDuplicateGuard(() =>
    prisma.$transaction(
      async (tx) => {
        const olds = await tx.vehicleCoverage.findMany({
          where: { id: { in: ids } },
          orderBy: { id: 'asc' },
          include: { vehicle: { select: { plate: true } } },
        })
        if (olds.length !== ids.length) throw notFound('ไม่พบบางรายการ — โหลดหน้าใหม่แล้วลองอีกครั้ง')
        if (new Set(olds.map((o) => o.type)).size > 1) throw badRequest('ต่อแล้วแบบหลายรายการต้องเป็นประเภทเดียวกัน')
        const plates = (rows: typeof olds) => rows.map((o) => o.vehicle.plate).join(', ')
        const closed = olds.filter((o) => !isOpenStatus(o.renewalStatus))
        if (closed.length > 0) throw conflict(`งวดถูกปิดไปแล้ว: ${plates(closed)}`)
        const invalid = olds.filter(
          (o) => validateNewPeriod(dateToYmd(o.endDate), input.startDate, input.endDate) !== null,
        )
        if (invalid.length > 0) throw badRequest(`วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม: ${plates(invalid)}`)
        if (input.insurerId && !(await tx.insurer.findUnique({ where: { id: input.insurerId }, select: { id: true } }))) {
          throw badRequest('ไม่พบบริษัทประกัน')
        }
        for (const old of olds) {
          const fields = sanitizeCoverageFields(old.type, {
            insurerId: input.insurerId ?? old.insurerId,
            coverageClass: old.coverageClass,
            policyNumber: null,
            startDate: input.startDate,
            endDate: input.endDate,
            amount: old.amount === null ? null : Number(old.amount),
            serviceFee: old.serviceFee === null ? null : Number(old.serviceFee),
            pairedVehicleId: old.pairedVehicleId,
            renewalNote: null,
          })
          await createNextPeriod(tx, old, fields, userId)
        }
        return olds.length
      },
      { timeout: 30_000 },
    ),
  )
}

/** รอต่อ ↔ กำลังดำเนินการ / ไม่ต่อ (หลายรายการ) — ทั้งชุดสำเร็จหรือไม่สำเร็จพร้อมกัน */
export async function bulkSetStatus(input: BulkStatusInput, userId: string): Promise<number> {
  const ids = [...new Set(input.ids)]
  return prisma.$transaction(async (tx) => {
    const olds = await tx.vehicleCoverage.findMany({
      where: { id: { in: ids } },
      select: { renewalStatus: true, vehicle: { select: { plate: true } } },
    })
    if (olds.length !== ids.length) throw notFound('ไม่พบบางรายการ — โหลดหน้าใหม่แล้วลองอีกครั้ง')
    const closed = olds.filter((o) => !isOpenStatus(o.renewalStatus))
    if (closed.length > 0) throw conflict(`งวดถูกปิดไปแล้ว: ${closed.map((o) => o.vehicle.plate).join(', ')}`)

    const statusData =
      input.status === 'NOT_RENEWED'
        ? { renewalStatus: 'NOT_RENEWED' as const, notRenewedReason: input.reason, ...(input.note ? { renewalNote: input.note } : {}) }
        : { renewalStatus: input.status, notRenewedReason: null }
    const res = await tx.vehicleCoverage.updateMany({
      where: { id: { in: ids }, renewalStatus: OPEN_FILTER },
      data: { ...statusData, statusUpdatedAt: new Date(), statusUpdatedById: userId },
    })
    if (res.count !== ids.length) throw conflict(CLOSED_ERROR)
    return res.count
  })
}

/** ไม่ต่อ → รอต่อ (เช่น รถซ่อมเสร็จกลับมาใช้) */
export async function reopenCoverage(id: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.vehicleCoverage.findUnique({
      where: { id },
      select: { vehicleId: true, type: true, endDate: true, renewalStatus: true, vehicle: { select: { status: true } } },
    })
    if (!row) throw notFound('ไม่พบงวด')
    if (row.renewalStatus !== 'NOT_RENEWED') throw conflict('เปิดใหม่ได้เฉพาะงวดที่ไม่ต่อ')
    if (row.vehicle.status === 'SOLD') throw conflict('รถคันนี้ขายแล้ว เปิดงวดใหม่ไม่ได้')
    const newer = await tx.vehicleCoverage.findFirst({
      where: { vehicleId: row.vehicleId, type: row.type, endDate: { gt: row.endDate } },
      select: { id: true },
    })
    if (newer) throw conflict('เปิดใหม่ไม่ได้ เพราะมีงวดที่หมดช้ากว่าแล้ว')
    const res = await tx.vehicleCoverage.updateMany({
      where: { id, renewalStatus: 'NOT_RENEWED' },
      data: { renewalStatus: 'PENDING', notRenewedReason: null, statusUpdatedAt: new Date(), statusUpdatedById: userId },
    })
    if (res.count !== 1) throw conflict(CLOSED_ERROR)
  })
}
