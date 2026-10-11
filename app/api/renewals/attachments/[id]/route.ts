import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { attachmentFileResponse } from '@/lib/renewals/attachmentHandlers'
import { isPrismaNotFound, notFound, renewalErrorResponse } from '@/lib/renewals/http'
import { removeObjectsBestEffort } from '@/lib/renewals/storage'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  return attachmentFileResponse(await prisma.coverageAttachment.findUnique({ where: { id } }))
}

/** ลบแถวก่อน แล้วลบ object แบบ best-effort */
export async function DELETE(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const row = await prisma.coverageAttachment.delete({ where: { id } }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) throw notFound('ไม่พบไฟล์')
      throw error
    })
    await removeObjectsBestEffort([row.fileKey])
    return NextResponse.json({ success: true })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
