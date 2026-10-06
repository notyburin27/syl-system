import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import type { CoverageAttachment } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { MAX_FILES_PER_UPLOAD, buildAttachmentKey, validateAttachment } from '@/lib/renewals/attachmentRules'
import { badRequest, notFound, renewalErrorResponse } from '@/lib/renewals/http'
import { toAttachmentDto } from '@/lib/renewals/serialize'
import { getAttachmentStorage, removeObjectsBestEffort } from '@/lib/renewals/storage'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  const rows = await prisma.coverageAttachment.findMany({ where: { coverageId: id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json(rows.map(toAttachmentDto))
}

/** ตรวจทุกไฟล์ก่อน แล้ว put object ก่อนสร้างแถว — สร้างแถวไม่สำเร็จ → ลบ object ทิ้ง */
export async function POST(req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const form = await req.formData().catch(() => null)
    const files = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File)
    if (files.length === 0) throw badRequest('กรุณาเลือกไฟล์')
    if (files.length > MAX_FILES_PER_UPLOAD) throw badRequest(`อัปโหลดได้ครั้งละไม่เกิน ${MAX_FILES_PER_UPLOAD} ไฟล์`)

    const checked = files.map((file) => ({ file, result: validateAttachment(file.name, file.type, file.size) }))
    const errors = checked.flatMap(({ result }) => ('error' in result ? [result.error] : []))
    if (errors.length > 0) throw badRequest(errors.join('\n'))
    if (!(await prisma.vehicleCoverage.findUnique({ where: { id }, select: { id: true } }))) throw notFound('ไม่พบงวด')

    const storage = getAttachmentStorage()
    const created: CoverageAttachment[] = []
    for (const { file, result } of checked) {
      if ('error' in result) continue
      const key = buildAttachmentKey(new Date(), randomUUID(), result.ext)
      await storage.put(key, new Uint8Array(await file.arrayBuffer()), file.type)
      try {
        created.push(
          await prisma.coverageAttachment.create({
            data: {
              coverageId: id,
              fileKey: key,
              fileName: file.name,
              contentType: file.type,
              sizeBytes: file.size,
              uploadedById: access.user.id,
            },
          }),
        )
      } catch (error) {
        await removeObjectsBestEffort([key])
        throw error
      }
    }
    return NextResponse.json(created.map(toAttachmentDto), { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
