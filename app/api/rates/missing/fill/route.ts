import { NextResponse } from 'next/server'
import { requireApiRoles } from '@/lib/utils/roleGuard'
import { ADMIN_ROLES } from '@/lib/settingsNav'
import { prisma } from '@/lib/prisma'
import { previousMonth } from '@/lib/utils/missingRates'
import { fillIncomeGroup, fillWageGroup } from '@/lib/utils/missingRatesQuery'
import { isTowingJobType } from '@/types/job'

type Body =
  | { kind?: 'income'; jobType?: string; size?: string; factoryLocationId?: string; customerId?: string }
  | { kind?: 'driverWage'; jobType?: string; size?: string; factoryLocationId?: string | null }

/** เติมงานจากอัตราที่มีอยู่แล้ว — คืน null ถ้าไม่พบอัตรา */
export async function POST(req: Request) {
  const denied = await requireApiRoles(ADMIN_ROLES)
  if (denied) return denied

  try {
    const body = (await req.json()) as Body & { customerId?: string }
    const { kind, jobType, size } = body
    const month = previousMonth(new Date())
    const bad = () => NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    const notFound = () => NextResponse.json({ error: 'ไม่พบอัตรา' }, { status: 404 })

    if (kind === 'income') {
      const { factoryLocationId, customerId } = body as { factoryLocationId?: string; customerId?: string }
      if (!jobType || !size || !factoryLocationId || !customerId) return bad()
      const key = { jobType, size, factoryLocationId, customerId }
      const exists = await prisma.rateIncome.findUnique({
        where: { jobType_size_factoryLocationId_customerId: key }, select: { id: true },
      })
      if (!exists) return notFound()
      const filled = await prisma.$transaction((tx) => fillIncomeGroup(tx, month, key))
      return NextResponse.json({ filled })
    }

    if (kind === 'driverWage') {
      const factoryLocationId = (body as { factoryLocationId?: string | null }).factoryLocationId || null
      if (!jobType || !size || (!factoryLocationId && !isTowingJobType(jobType))) return bad()
      const key = { jobType, size, factoryLocationId }
      const exists = await prisma.rateDriverWage.findFirst({ where: key, select: { id: true } })
      if (!exists) return notFound()
      const filled = await prisma.$transaction((tx) => fillWageGroup(tx, month, key))
      return NextResponse.json({ filled })
    }

    return bad()
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
