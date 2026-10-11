import type { Vehicle } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { enforceCoverageRules } from './coverageService'
import { ymdToDate } from './dateOnly'
import { conflict, isPrismaNotFound, isUniqueViolation, notFound } from './http'
import type { VehicleInput } from './schemas'

const DUPLICATE_PLATE_ERROR = 'ทะเบียนนี้มีอยู่แล้ว'

function vehicleData(input: VehicleInput) {
  return {
    ...input,
    registrationDate: input.registrationDate ? ymdToDate(input.registrationDate) : null,
    statusDate: input.statusDate ? ymdToDate(input.statusDate) : null,
  }
}

async function withPlateGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_PLATE_ERROR)
    throw error
  }
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  return withPlateGuard(() => prisma.vehicle.create({ data: vehicleData(input) }))
}

/** เปลี่ยนเป็น "ขาย" → enforceCoverageRules ปิดงวดเปิดเป็น ไม่ต่อ/ขายรถ ใน transaction เดียวกัน */
export async function updateVehicle(id: string, input: VehicleInput, userId: string): Promise<Vehicle> {
  return withPlateGuard(() =>
    prisma.$transaction(async (tx) => {
      if (!(await tx.vehicle.findUnique({ where: { id }, select: { id: true } }))) throw notFound('ไม่พบรถ')
      const updated = await tx.vehicle.update({ where: { id }, data: vehicleData(input) })
      await enforceCoverageRules(tx, [id], userId)
      return updated
    }),
  )
}

/** แถวเอกสารสำเนารถลบตาม cascade — คืน fileKey ให้ caller ลบใน storage หลังลบสำเร็จ */
export async function deleteVehicle(id: string): Promise<string[]> {
  const used = await prisma.vehicleCoverage.count({ where: { OR: [{ vehicleId: id }, { pairedVehicleId: id }] } })
  if (used > 0) throw conflict('ลบไม่ได้ เพราะรถคันนี้มีงวดอยู่ — เปลี่ยนสถานะรถแทน')
  try {
    const deleted = await prisma.vehicle.delete({ where: { id }, include: { attachments: { select: { fileKey: true } } } })
    return deleted.attachments.map((a) => a.fileKey)
  } catch (error) {
    if (isPrismaNotFound(error)) throw notFound('ไม่พบรถ')
    throw error
  }
}
