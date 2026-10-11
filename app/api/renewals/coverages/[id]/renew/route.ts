import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { renewCoverage } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { coverageFieldsSchema } from '@/lib/renewals/schemas'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const newId = await renewCoverage(id, await parseJsonBody(req, coverageFieldsSchema), access.user.id)
    return NextResponse.json({ id: newId }, { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
