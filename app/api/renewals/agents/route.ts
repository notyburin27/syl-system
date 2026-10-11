import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'

/** ชื่อตัวแทนที่เคยกรอก (ไม่ซ้ำ) — ใช้เป็นตัวเลือก AutoComplete ในฟอร์มงวด */
export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const rows = await prisma.vehicleCoverage.findMany({
    where: { agentName: { not: null } },
    distinct: ['agentName'],
    select: { agentName: true },
    orderBy: { agentName: 'asc' },
  })
  return NextResponse.json(rows.flatMap((r) => (r.agentName ? [r.agentName] : [])))
}
