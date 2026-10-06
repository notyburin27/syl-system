import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { conflict, isUniqueViolation, parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { insurerCreateSchema } from '@/lib/renewals/schemas'
import { toInsurerDto } from '@/lib/renewals/serialize'

const DUPLICATE_INSURER_ERROR = 'มีบริษัทประกันชื่อนี้อยู่แล้ว'

export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const rows = await prisma.insurer.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] })
  return NextResponse.json(rows.map(toInsurerDto))
}

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const input = await parseJsonBody(req, insurerCreateSchema)
    if (input.names) {
      // ชื่อที่มีอยู่แล้วข้ามไป (ใช้จากหน้า import)
      const result = await prisma.insurer.createMany({
        data: [...new Set(input.names)].map((name) => ({ name })),
        skipDuplicates: true,
      })
      return NextResponse.json({ created: result.count }, { status: 201 })
    }
    const row = await prisma.insurer.create({ data: { name: input.name! } })
    return NextResponse.json(toInsurerDto(row), { status: 201 })
  } catch (error) {
    if (isUniqueViolation(error)) return renewalErrorResponse(conflict(DUPLICATE_INSURER_ERROR))
    return renewalErrorResponse(error)
  }
}
