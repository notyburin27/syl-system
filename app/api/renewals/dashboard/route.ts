import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { OPEN_STATUSES } from '@/lib/renewals/constants'
import { todayInBangkok, ymdToDate } from '@/lib/renewals/dateOnly'
import { dueBucket, endOfNextMonth } from '@/lib/renewals/dueWindow'
import { COVERAGE_INCLUDE, toCoverageDto } from '@/lib/renewals/serialize'
import type { DashboardItemDto, DashboardResponse } from '@/types/renewals'

/** งวดเปิดทั้งหมดที่หมดภายในสิ้นเดือนหน้า (รวมที่เลยกำหนด) — ตัวกรอง/นับ/ยอดรวมทำฝั่ง client */
export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const today = todayInBangkok()
  const rows = await prisma.vehicleCoverage.findMany({
    where: { renewalStatus: { in: [...OPEN_STATUSES] }, endDate: { lte: ymdToDate(endOfNextMonth(today)) } },
    include: COVERAGE_INCLUDE,
  })
  const items: DashboardItemDto[] = rows
    .map((r) => {
      const dto = toCoverageDto(r)
      return { ...dto, bucket: dueBucket(dto.endDate, today) }
    })
    .sort(
      (a, b) =>
        a.endDate.localeCompare(b.endDate) ||
        (a.vehicle.fleetNumber ?? '').localeCompare(b.vehicle.fleetNumber ?? '', 'th', { numeric: true }),
    )
  const body: DashboardResponse = { today, items }
  return NextResponse.json(body)
}
