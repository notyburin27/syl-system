import { getToken } from 'next-auth/jwt'

const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'] as const

/**
 * ถอด role จาก session cookie "ทุกชื่อ" ที่ client ส่งมา (ไม่ให้ client เลือกชื่อ cookie เอง)
 * - ถอดทีละชื่อ โดย salt = ชื่อ cookie นั้น
 * - มีหลาย role → INSURANCE ชนะ (เข้มสุด) ไม่งั้นใช้ตัวแรก
 * - มี cookie แต่ถอดไม่ได้ → warn และคืน undefined (fail-open เหมือนเดิม)
 */
export async function readSessionRole(
  req: Request | { headers: Headers },
  presentCookieNames: string[],
  secret: string | undefined,
): Promise<string | undefined> {
  const names = SESSION_COOKIES.filter((n) => presentCookieNames.includes(n))
  if (names.length === 0) return undefined

  const roles: string[] = []
  for (const name of names) {
    try {
      const token = await getToken({
        req: req as Parameters<typeof getToken>[0]['req'],
        secret,
        cookieName: name,
        salt: name,
        secureCookie: name.startsWith('__Secure-'),
      })
      if (typeof token?.role === 'string') roles.push(token.role)
    } catch {
      // ข้าม cookie ที่ถอดไม่ได้
    }
  }

  if (roles.length === 0) {
    console.warn('[renewals] session cookie present but role could not be decoded')
    return undefined
  }
  return roles.includes('INSURANCE') ? 'INSURANCE' : roles[0]
}
