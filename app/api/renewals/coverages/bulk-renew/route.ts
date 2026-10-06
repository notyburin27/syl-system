import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { bulkRenew } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { bulkRenewSchema } from '@/lib/renewals/schemas'

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const count = await bulkRenew(await parseJsonBody(req, bulkRenewSchema), access.user.id)
    return NextResponse.json({ count })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
