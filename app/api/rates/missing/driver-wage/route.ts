import { NextResponse } from 'next/server'
import { requireApiRoles } from '@/lib/utils/roleGuard'
import { ADMIN_ROLES } from '@/lib/settingsNav'
import { prisma } from '@/lib/prisma'
import { previousMonth } from '@/lib/utils/missingRates'
import { fillWageGroup } from '@/lib/utils/missingRatesQuery'
import { isTowingJobType } from '@/types/job'

class DuplicateError extends Error {}

export async function POST(req: Request) {
  const denied = await requireApiRoles(ADMIN_ROLES)
  if (denied) return denied

  try {
    const body = (await req.json()) as {
      jobType?: string; size?: string; factoryLocationId?: string | null; driverWage?: number
    }
    const { jobType, size } = body
    const factoryLocationId = body.factoryLocationId || null
    if (!jobType || !size || (!factoryLocationId && !isTowingJobType(jobType))) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }
    const { driverWage } = body
    if (typeof driverWage !== 'number' || !Number.isFinite(driverWage) || driverWage < 0) {
      return NextResponse.json({ error: 'ค่าเที่ยวต้องไม่ติดลบ' }, { status: 400 })
    }
    const key = { jobType, size, factoryLocationId }

    const filled = await prisma.$transaction(async (tx) => {
      // unique ที่มี NULL ชนกันเองไม่ได้ ต้องเช็คเอง
      const existing = await tx.rateDriverWage.findFirst({ where: key, select: { id: true } })
      if (existing) throw new DuplicateError()
      await tx.rateDriverWage.create({ data: { ...key, driverWage } })
      return fillWageGroup(tx, previousMonth(new Date()), key)
    }, { timeout: 30000 })
    return NextResponse.json({ filled }, { status: 201 })
  } catch (error) {
    if (error instanceof DuplicateError || (error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'มีข้อมูลนี้อยู่แล้ว' }, { status: 409 })
    }
    console.error(error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
