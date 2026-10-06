import { isRenewalRole } from './constants'

export type RouteDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'forbidden' }

const ALLOW: RouteDecision = { kind: 'allow' }

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/**
 * สิทธิ์ path ของฟีเจอร์ต่ออายุรถ — middleware เรียกหลังถอด JWT
 * - INSURANCE เห็นเฉพาะ /renewals และ /api/renewals
 * - role อื่นที่ไม่อยู่ใน RENEWAL_ROLES เข้า /renewals ไม่ได้
 * - ไม่รู้ role (ถอด token ไม่ได้) → ปล่อยผ่าน ให้ page/route เช็กเอง (พฤติกรรมเดิม)
 */
export function renewalRouteDecision(role: string | undefined, pathname: string): RouteDecision {
  if (!role) return ALLOW
  const isApi = isUnder(pathname, '/api')
  const isRenewal = isUnder(pathname, '/renewals') || isUnder(pathname, '/api/renewals')

  if (role === 'INSURANCE') {
    if (isRenewal || isUnder(pathname, '/api/auth')) return ALLOW
    return isApi ? { kind: 'forbidden' } : { kind: 'redirect', to: '/renewals' }
  }

  if (isRenewal && !isRenewalRole(role)) {
    if (isApi) return { kind: 'forbidden' }
    return { kind: 'redirect', to: role === 'STAFF' ? '/line-images' : '/jobs' }
  }

  return ALLOW
}
