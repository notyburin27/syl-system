import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import {
  MAX_FILES_PER_UPLOAD,
  buildAttachmentKey,
  inlineContentDisposition,
  validateAttachment,
  type AttachmentExt,
  type AttachmentFolder,
} from './attachmentRules'
import { badRequest } from './http'
import { getAttachmentStorage, removeObjectsBestEffort } from './storage'

export interface StoredFile {
  fileKey: string
  fileName: string
  contentType: string
  sizeBytes: number
}

/** อ่านไฟล์จาก multipart แล้วตรวจทุกไฟล์ก่อน — ไฟล์ใดไม่ผ่านโยน 400 รวมทุกข้อความ */
export async function readUploadFiles(req: Request): Promise<{ file: File; ext: AttachmentExt }[]> {
  const form = await req.formData().catch(() => null)
  if (!form) throw badRequest('อ่านไฟล์ไม่สำเร็จ — ไฟล์อาจใหญ่เกิน 10 MB')
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) throw badRequest('กรุณาเลือกไฟล์')
  if (files.length > MAX_FILES_PER_UPLOAD) throw badRequest(`อัปโหลดได้ครั้งละไม่เกิน ${MAX_FILES_PER_UPLOAD} ไฟล์`)

  const checked = files.map((file) => ({ file, result: validateAttachment(file.name, file.type, file.size) }))
  const errors = checked.flatMap(({ result }) => ('error' in result ? [result.error] : []))
  if (errors.length > 0) throw badRequest(errors.join('\n'))
  return checked.flatMap(({ file, result }) => ('error' in result ? [] : [{ file, ext: result.ext }]))
}

/** put object ก่อนสร้างแถว — สร้างแถวไม่สำเร็จ → ลบ object ทิ้ง */
export async function storeUploads<T>(
  uploads: { file: File; ext: AttachmentExt }[],
  folder: AttachmentFolder,
  createRow: (stored: StoredFile) => Promise<T>,
): Promise<T[]> {
  const storage = getAttachmentStorage()
  const created: T[] = []
  for (const { file, ext } of uploads) {
    const key = buildAttachmentKey(new Date(), randomUUID(), ext, folder)
    await storage.put(key, new Uint8Array(await file.arrayBuffer()), file.type)
    try {
      created.push(await createRow({ fileKey: key, fileName: file.name, contentType: file.type, sizeBytes: file.size }))
    } catch (error) {
      await removeObjectsBestEffort([key])
      throw error
    }
  }
  return created
}

/** ไฟล์เป็น private — ส่งผ่าน route ที่เช็กสิทธิ์แล้วเท่านั้น */
export async function attachmentFileResponse(row: StoredFile | null): Promise<NextResponse> {
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
