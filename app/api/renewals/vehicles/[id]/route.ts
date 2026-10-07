import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { vehicleInputSchema } from '@/lib/renewals/schemas'
import { COVERAGE_INCLUDE, toCoverageDto, toVehicleDto } from '@/lib/renewals/serialize'
import { removeObjectsBestEffort } from '@/lib/renewals/storage'
import { deleteVehicle, updateVehicle } from '@/lib/renewals/vehicleService'
import type { VehicleDetailResponse } from '@/types/renewals'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { coverages: { include: COVERAGE_INCLUDE, orderBy: [{ type: 'asc' }, { endDate: 'desc' }] } },
  })
  if (!vehicle) return NextResponse.json({ error: 'ไม่พบรถ' }, { status: 404 })
  const { coverages, ...rest } = vehicle
  const body: VehicleDetailResponse = { vehicle: toVehicleDto(rest), coverages: coverages.map(toCoverageDto) }
  return NextResponse.json(body)
}

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const vehicle = await updateVehicle(id, await parseJsonBody(req, vehicleInputSchema), access.user.id)
    return NextResponse.json(toVehicleDto(vehicle))
  } catch (error) {
    return renewalErrorResponse(error)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    await removeObjectsBestEffort(await deleteVehicle(id))
    return NextResponse.json({ success: true })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
