import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { createCoverage } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { coverageCreateSchema } from '@/lib/renewals/schemas'

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const id = await createCoverage(await parseJsonBody(req, coverageCreateSchema), access.user.id)
    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
