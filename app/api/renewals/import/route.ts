import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { badRequest, renewalErrorResponse } from '@/lib/renewals/http'
import { applyRenewalImport, loadImportSnapshot } from '@/lib/renewals/import/apply'
import { validateRenewalImport } from '@/lib/renewals/import/validate'
import { readRenewalWorkbook } from '@/lib/renewals/import/workbook'
import type { ImportCommitResponse, ImportPreviewResponse } from '@/types/renewals'

const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** preview = ตรวจอย่างเดียว; commit = ตรวจซ้ำกับข้อมูลล่าสุดแล้วบันทึก (ไฟล์มี error → 400 ไม่บันทึกอะไร) */
export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const mode = form?.get('mode')
    if (!(file instanceof File)) throw badRequest('กรุณาเลือกไฟล์')
    if (mode !== 'preview' && mode !== 'commit') throw badRequest('mode ต้องเป็น preview หรือ commit')
    if (file.size > MAX_IMPORT_BYTES) throw badRequest('ไฟล์ต้องไม่เกิน 5 MB')

    const parsed = await readRenewalWorkbook(await file.arrayBuffer())
    if ('error' in parsed) throw badRequest(parsed.error)
    const result = validateRenewalImport(parsed, await loadImportSnapshot())
    const preview: ImportPreviewResponse = {
      valid: result.errors.length === 0,
      errors: result.errors,
      unknownInsurers: result.unknownInsurers,
      summary: result.summary,
    }
    if (mode === 'preview') return NextResponse.json(preview)
    if (!preview.valid) return NextResponse.json(preview, { status: 400 })

    const body: ImportCommitResponse = { success: true, summary: await applyRenewalImport(result.plan, access.user.id) }
    return NextResponse.json(body, { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
