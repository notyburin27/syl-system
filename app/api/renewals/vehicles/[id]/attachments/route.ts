import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { readUploadFiles, storeUploads } from '@/lib/renewals/attachmentHandlers'
import { notFound, renewalErrorResponse } from '@/lib/renewals/http'
import { toVehicleAttachmentDto } from '@/lib/renewals/serialize'

type Params = { params: Promise<{ id: string }> }

/** เอกสารสำเนารถ */
export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  const rows = await prisma.vehicleAttachment.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json(rows.map(toVehicleAttachmentDto))
}

export async function POST(req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const uploads = await readUploadFiles(req)
    if (!(await prisma.vehicle.findUnique({ where: { id }, select: { id: true } }))) throw notFound('ไม่พบรถ')

    const created = await storeUploads(uploads, 'vehicle-documents', (stored) =>
      prisma.vehicleAttachment.create({ data: { ...stored, vehicleId: id, uploadedById: access.user.id } }),
    )
    return NextResponse.json(created.map(toVehicleAttachmentDto), { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
