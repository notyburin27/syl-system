import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { inlineContentDisposition } from '@/lib/renewals/attachmentRules'
import { isPrismaNotFound, notFound, renewalErrorResponse } from '@/lib/renewals/http'
import { getAttachmentStorage, removeObjectsBestEffort } from '@/lib/renewals/storage'

type Params = { params: Promise<{ id: string }> }

/** ไฟล์เป็น private — เปิดได้ผ่าน route นี้ที่เช็กสิทธิ์เท่านั้น */
export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  const row = await prisma.coverageAttachment.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  const body = await getAttachmentStorage().get(row.fileKey)
  if (!body) return NextResponse.json({ error: 'ไม่พบไฟล์ในที่เก็บ' }, { status: 404 })

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': row.contentType,
      'Content-Disposition': inlineContentDisposition(row.fileName),
      'Cache-Control': 'private, no-store',
      // content type มาจาก client ตอนอัปโหลด และเปิดแบบ inline — กัน browser เดา type เอง
      'X-Content-Type-Options': 'nosniff',
    },
  })
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
