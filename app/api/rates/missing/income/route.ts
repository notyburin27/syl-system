import { NextResponse } from 'next/server'
import { requireApiRoles } from '@/lib/utils/roleGuard'
import { ADMIN_ROLES } from '@/lib/settingsNav'
import { prisma } from '@/lib/prisma'
import { buildIncomeRateData, previousMonth, validateIncomeInput, type PricedRange } from '@/lib/utils/missingRates'
import { fillIncomeGroup } from '@/lib/utils/missingRatesQuery'

class DuplicateError extends Error {}

export async function POST(req: Request) {
  const denied = await requireApiRoles(ADMIN_ROLES)
  if (denied) return denied

  try {
    const body = (await req.json()) as {
      jobType?: string; size?: string; factoryLocationId?: string; customerId?: string
      ranges?: PricedRange[]; basePrice?: number | null
    }
    const { jobType, size, factoryLocationId, customerId } = body
    if (!jobType || !size || !factoryLocationId || !customerId) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }
    const ranges = Array.isArray(body.ranges) ? body.ranges : []
    const basePrice = body.basePrice ?? null
    const invalid = validateIncomeInput(ranges, basePrice)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    const { income, surcharges } = buildIncomeRateData(ranges, basePrice)
    const key = { jobType, size, factoryLocationId, customerId }

    const filled = await prisma.$transaction(async (tx) => {
      const existing = await tx.rateIncome.findUnique({
        where: { jobType_size_factoryLocationId_customerId: key },
        select: { id: true },
      })
      if (existing) throw new DuplicateError()
      await tx.rateIncome.create({ data: { ...key, income, fuelSurcharges: { create: surcharges } } })
      return fillIncomeGroup(tx, previousMonth(new Date()), key)
    })
    return NextResponse.json({ filled }, { status: 201 })
  } catch (error) {
    if (error instanceof DuplicateError || (error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'มีข้อมูลนี้อยู่แล้ว' }, { status: 409 })
    }
    console.error(error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
