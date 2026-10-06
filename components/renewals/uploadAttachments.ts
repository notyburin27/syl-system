import { validateAttachment } from '@/lib/renewals/attachmentRules'
import { SESSION_EXPIRED_ERROR, handleSessionExpired } from './api'

/** ตรวจทุกไฟล์ก่อนส่ง (ไม่ส่งสักไฟล์ถ้ามีไฟล์ไม่ผ่าน) แล้วอัปโหลดทีละไฟล์ — middleware จำกัด body ต่อ request (ตั้งไว้ 12mb ใน next.config.js) */
export async function uploadAttachments(
  coverageId: string,
  files: File[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const file of files) {
    const checked = validateAttachment(file.name, file.type, file.size)
    if ('error' in checked) return { ok: false, error: checked.error }
  }
  for (const file of files) {
    const form = new FormData()
    form.append('files', file)
    try {
      const res = await fetch(`/api/renewals/coverages/${coverageId}/attachments`, { method: 'POST', body: form })
      if (handleSessionExpired(res, res.ok ? (res.headers.get('content-type') ?? '').includes('json') : true)) {
        return { ok: false, error: SESSION_EXPIRED_ERROR }
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        return { ok: false, error: json.error || `อัปโหลด ${file.name} ไม่สำเร็จ` }
      }
    } catch {
      return { ok: false, error: `อัปโหลด ${file.name} ไม่สำเร็จ` }
    }
  }
  return { ok: true }
}
