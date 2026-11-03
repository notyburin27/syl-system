import { NextResponse } from 'next/server'
import { requireApiRoles } from '@/lib/utils/roleGuard'
import { ADMIN_ROLES } from '@/lib/settingsNav'
import { previousMonth } from '@/lib/utils/missingRates'
import { loadMissingRates } from '@/lib/utils/missingRatesQuery'

export async function GET() {
  const denied = await requireApiRoles(ADMIN_ROLES)
  if (denied) return denied
  try {
    return NextResponse.json(await loadMissingRates(previousMonth(new Date())))
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
