import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import {
  conflict,
  isPrismaNotFound,
  isUniqueViolation,
  notFound,
  parseJsonBody,
  renewalErrorResponse,
} from '@/lib/renewals/http'
import { insurerUpdateSchema } from '@/lib/renewals/schemas'
import { toInsurerDto } from '@/lib/renewals/serialize'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const data = await parseJsonBody(req, insurerUpdateSchema)
    const row = await prisma.insurer.update({ where: { id }, data })
    return NextResponse.json(toInsurerDto(row))
  } catch (error) {
    if (isUniqueViolation(error)) return renewalErrorResponse(conflict('มีบริษัทประกันชื่อนี้อยู่แล้ว'))
    if (isPrismaNotFound(error)) return renewalErrorResponse(notFound('ไม่พบบริษัทประกัน'))
    return renewalErrorResponse(error)
  }
}
