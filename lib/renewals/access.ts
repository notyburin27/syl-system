import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isRenewalRole } from './constants'

export interface RenewalUser {
  id: string
  role: string
}

/** ทุก route ใต้ /api/renewals เรียกก่อนทำงาน — คืน response 401/403 หรือ user */
export async function requireRenewalAccess(): Promise<{ user: RenewalUser } | { response: NextResponse }> {
  const session = await auth()
  if (!session?.user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isRenewalRole(session.user.role)) {
    return { response: NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' }, { status: 403 }) }
  }
  return { user: { id: session.user.id, role: session.user.role } }
}
