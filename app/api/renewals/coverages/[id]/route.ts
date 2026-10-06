import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { deleteCoverage, updateCoverage } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { coverageFieldsSchema } from '@/lib/renewals/schemas'
import { removeObjectsBestEffort } from '@/lib/renewals/storage'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    await updateCoverage(id, await parseJsonBody(req, coverageFieldsSchema), access.user.id)
    return NextResponse.json({ id })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const fileKeys = await deleteCoverage(id, access.user.id)
    await removeObjectsBestEffort(fileKeys)
    return NextResponse.json({ success: true })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
