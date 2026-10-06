import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { reopenCoverage } from '@/lib/renewals/coverageService'
import { renewalErrorResponse } from '@/lib/renewals/http'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    await reopenCoverage(id, access.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
