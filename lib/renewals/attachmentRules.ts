import { todayInBangkok } from './dateOnly'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_FILES_PER_UPLOAD = 10

export type AttachmentExt = 'pdf' | 'jpg' | 'png'

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** ตรวจทั้งนามสกุลและ MIME — ข้อความ error ขึ้นต้นด้วยชื่อไฟล์เพื่อให้รู้ว่าไฟล์ไหน */
export function validateAttachment(
  fileName: string,
  mime: string,
  size: number,
): { ext: AttachmentExt } | { error: string } {
  const dot = fileName.lastIndexOf('.')
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  const expected = EXT_TO_MIME[ext]
  if (!expected) return { error: `${fileName}: รองรับเฉพาะไฟล์ PDF, JPG, PNG` }
  if (mime !== expected) return { error: `${fileName}: ชนิดไฟล์ไม่ตรงกับนามสกุล` }
  if (size <= 0) return { error: `${fileName}: ไฟล์ว่าง` }
  if (size > MAX_ATTACHMENT_BYTES) return { error: `${fileName}: ไฟล์ต้องไม่เกิน 10 MB` }
  return { ext: ext === 'jpeg' ? 'jpg' : (ext as AttachmentExt) }
}

/** โฟลเดอร์ใน bucket — ไฟล์แนบของงวด / เอกสารสำเนารถ */
export type AttachmentFolder = 'vehicle-coverages' | 'vehicle-documents'

export function buildAttachmentKey(now: Date, uuid: string, ext: AttachmentExt, folder: AttachmentFolder = 'vehicle-coverages'): string {
  return `${folder}/${todayInBangkok(now).slice(0, 7)}/${uuid}.${ext}`
}

/** RFC 5987: encodeURIComponent ไม่ encode ' ( ) * ซึ่งใช้ใน filename* ไม่ได้ */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** header แบบ inline ที่ชื่อไฟล์ภาษาไทยไม่ทำ header พัง — filename= เป็น ASCII ล้วน, ชื่อจริงอยู่ใน filename* */
export function inlineContentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(fileName)}`
}
