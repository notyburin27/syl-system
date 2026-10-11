import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import type { CoverageTypeKey } from '@/lib/renewals/constants'
import { dateToYmd } from '@/lib/renewals/dateOnly'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { vehicleInputSchema } from '@/lib/renewals/schemas'
import { toVehicleDto } from '@/lib/renewals/serialize'
import { createVehicle } from '@/lib/renewals/vehicleService'
import type { VehicleListItemDto } from '@/types/renewals'

export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const [vehicles, latest] = await Promise.all([
    prisma.vehicle.findMany({ orderBy: [{ ownerName: 'asc' }, { plate: 'asc' }] }),
    prisma.vehicleCoverage.groupBy({ by: ['vehicleId', 'type'], _max: { endDate: true } }),
  ])
  const latestByVehicle = new Map<string, Partial<Record<CoverageTypeKey, string>>>()
  for (const g of latest) {
    if (!g._max.endDate) continue
    latestByVehicle.set(g.vehicleId, { ...latestByVehicle.get(g.vehicleId), [g.type]: dateToYmd(g._max.endDate) })
  }
  const body: VehicleListItemDto[] = vehicles.map((v) => ({
    ...toVehicleDto(v),
    latestEndDates: latestByVehicle.get(v.id) ?? {},
  }))
  return NextResponse.json(body)
}

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const vehicle = await createVehicle(await parseJsonBody(req, vehicleInputSchema))
    return NextResponse.json(toVehicleDto(vehicle), { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
