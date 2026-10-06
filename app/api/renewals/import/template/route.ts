import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { buildRenewalTemplate } from '@/lib/renewals/import/workbook'

export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const buffer = await buildRenewalTemplate()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="renewals_template.xlsx"',
    },
  })
}
