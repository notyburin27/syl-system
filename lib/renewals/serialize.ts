import type { CoverageAttachment, Insurer, Prisma, Vehicle } from '@/app/generated/prisma/client'
import type { AttachmentDto, CoverageDto, InsurerDto, VehicleDto } from '@/types/renewals'
import { dateToYmd } from './dateOnly'

export const COVERAGE_INCLUDE = {
  vehicle: { select: { id: true, plate: true, fleetNumber: true, ownerName: true, vehicleType: true, status: true } },
  insurer: { select: { id: true, name: true } },
  pairedVehicle: { select: { id: true, plate: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.VehicleCoverageInclude

export type CoverageWithRelations = Prisma.VehicleCoverageGetPayload<{ include: typeof COVERAGE_INCLUDE }>

const toNumber = (v: Prisma.Decimal | null) => (v === null ? null : Number(v))

export function toCoverageDto(r: CoverageWithRelations): CoverageDto {
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    type: r.type,
    insurerId: r.insurerId,
    insurerName: r.insurer?.name ?? null,
    coverageClass: r.coverageClass,
    policyNumber: r.policyNumber,
    startDate: r.startDate ? dateToYmd(r.startDate) : null,
    endDate: dateToYmd(r.endDate),
    amount: toNumber(r.amount),
    serviceFee: toNumber(r.serviceFee),
    pairedVehicleId: r.pairedVehicleId,
    pairedPlate: r.pairedVehicle?.plate ?? null,
    renewalStatus: r.renewalStatus,
    notRenewedReason: r.notRenewedReason,
    renewalNote: r.renewalNote,
    renewedToId: r.renewedToId,
    attachmentCount: r._count.attachments,
    vehicle: r.vehicle,
  }
}

export function toVehicleDto(v: Vehicle): VehicleDto {
  return {
    id: v.id,
    plate: v.plate,
    fleetNumber: v.fleetNumber,
    ownerName: v.ownerName,
    vehicleType: v.vehicleType,
    status: v.status,
    brand: v.brand,
    chassisNumber: v.chassisNumber,
    fuelType: v.fuelType,
    weightKg: v.weightKg,
    statusDate: v.statusDate ? dateToYmd(v.statusDate) : null,
    note: v.note,
  }
}

export function toInsurerDto(i: Insurer): InsurerDto {
  return { id: i.id, name: i.name, isActive: i.isActive }
}

export function toAttachmentDto(a: CoverageAttachment): AttachmentDto {
  return {
    id: a.id,
    coverageId: a.coverageId,
    fileName: a.fileName,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
  }
}
