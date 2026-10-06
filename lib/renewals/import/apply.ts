import { prisma } from '@/lib/prisma'
import type { ImportSummaryDto } from '@/types/renewals'
import { enforceCoverageRules } from '../coverageService'
import { dateToYmd, ymdToDate } from '../dateOnly'
import type { ExistingSnapshot, ImportPlan } from './validate'

/** โหลดข้อมูลเดิมครั้งเดียว (นอก transaction) สำหรับ validateRenewalImport */
export async function loadImportSnapshot(): Promise<ExistingSnapshot> {
  const [vehicles, insurers, coverages] = await Promise.all([
    prisma.vehicle.findMany({ select: { id: true, plate: true, status: true } }),
    prisma.insurer.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.vehicleCoverage.findMany({
      select: { id: true, vehicleId: true, type: true, endDate: true, renewalStatus: true, renewedToId: true },
    }),
  ])
  return { vehicles, insurers, coverages: coverages.map((c) => ({ ...c, endDate: dateToYmd(c.endDate) })) }
}

/**
 * บันทึกแผนจาก validateRenewalImport (ต้องไม่มี error) ใน transaction เดียว
 * แล้วบังคับกติกางวด (ปิดงวดเก่า / รถขาย) กับรถที่ไฟล์แตะ
 */
export async function applyRenewalImport(plan: ImportPlan, userId: string): Promise<ImportSummaryDto> {
  return prisma.$transaction(
    async (tx) => {
      const summary: ImportSummaryDto = {
        vehiclesCreated: 0,
        vehiclesUpdated: 0,
        coveragesCreated: 0,
        coveragesUpdated: 0,
        coveragesAutoClosed: 0,
      }
      const plates = [
        ...new Set([
          ...plan.vehicles.map((v) => v.plate),
          ...plan.coverages.map((c) => c.plate),
          ...plan.coverages.flatMap((c) => (c.data.pairedPlate ? [c.data.pairedPlate] : [])),
        ]),
      ]
      const idByPlate = new Map(
        (await tx.vehicle.findMany({ where: { plate: { in: plates } }, select: { id: true, plate: true } })).map((v) => [v.plate, v.id]),
      )

      for (const v of plan.vehicles) {
        const { statusDate, ...rest } = v.data
        const data = { ...rest, ...(statusDate ? { statusDate: ymdToDate(statusDate) } : {}) }
        if (v.existingId) {
          await tx.vehicle.update({ where: { id: v.existingId }, data })
          summary.vehiclesUpdated++
        } else {
          // รถใหม่มี ownerName / vehicleType เสมอ (validate บังคับแล้ว)
          const created = await tx.vehicle.create({
            data: { ...data, plate: v.plate, ownerName: rest.ownerName ?? '', vehicleType: rest.vehicleType ?? '' },
          })
          idByPlate.set(v.plate, created.id)
          summary.vehiclesCreated++
        }
      }

      const now = new Date()
      const touched = new Set(plan.vehicles.map((v) => idByPlate.get(v.plate)).filter((id): id is string => !!id))
      for (const c of plan.coverages) {
        const vehicleId = idByPlate.get(c.plate)
        if (!vehicleId) throw new Error(`[renewals import] ไม่พบรถ ${c.plate}`) // validate รับประกันแล้ว
        touched.add(vehicleId)
        const { pairedPlate, startDate, renewalStatus, notRenewedReason, ...rest } = c.data
        const data = {
          ...rest,
          ...(startDate ? { startDate: ymdToDate(startDate) } : {}),
          ...(pairedPlate ? { pairedVehicleId: idByPlate.get(pairedPlate) } : {}),
          ...(renewalStatus
            ? {
                renewalStatus,
                notRenewedReason: renewalStatus === 'NOT_RENEWED' ? (notRenewedReason ?? null) : null,
                statusUpdatedAt: now,
                statusUpdatedById: userId,
              }
            : {}),
        }
        if (c.existingId) {
          await tx.vehicleCoverage.update({ where: { id: c.existingId }, data })
          summary.coveragesUpdated++
        } else {
          await tx.vehicleCoverage.create({
            data: { ...data, vehicleId, type: c.type, endDate: ymdToDate(c.endDate), createdById: userId },
          })
          summary.coveragesCreated++
        }
      }

      summary.coveragesAutoClosed = await enforceCoverageRules(tx, [...touched], userId)
      return summary
    },
    { timeout: 60_000 },
  )
}
