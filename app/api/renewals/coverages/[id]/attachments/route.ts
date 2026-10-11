import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { readUploadFiles, storeUploads } from '@/lib/renewals/attachmentHandlers'
import { notFound, renewalErrorResponse } from '@/lib/renewals/http'
import { toAttachmentDto } from '@/lib/renewals/serialize'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  const rows = await prisma.coverageAttachment.findMany({ where: { coverageId: id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json(rows.map(toAttachmentDto))
}

export async function POST(req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const uploads = await readUploadFiles(req)
    if (!(await prisma.vehicleCoverage.findUnique({ where: { id }, select: { id: true } }))) throw notFound('ไม่พบงวด')

    const created = await storeUploads(uploads, 'vehicle-coverages', (stored) =>
      prisma.coverageAttachment.create({ data: { ...stored, coverageId: id, uploadedById: access.user.id } }),
    )
    return NextResponse.json(created.map(toAttachmentDto), { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
