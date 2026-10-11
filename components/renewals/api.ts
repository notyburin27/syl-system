export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const SESSION_EXPIRED_ERROR = 'เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่'

/**
 * JWT หมดอายุ → middleware redirect /api/* ไป /login แล้ว fetch ตามไปได้ HTML 200
 * ตรวจจาก redirect ไปหน้า login หรือ body ที่ไม่ใช่ JSON ทั้งที่ res.ok — ถ้าใช่ พาไปหน้า login
 * (คืน true) ผู้เรียกต้องไม่ถือว่าสำเร็จและไม่อ่าน body ต่อ
 */
export function handleSessionExpired(res: Response, bodyIsJson = true): boolean {
  let redirectedToLogin = false
  if (res.redirected) {
    try {
      redirectedToLogin = new URL(res.url).pathname.startsWith('/login')
    } catch {
      redirectedToLogin = false
    }
  }
  if (!redirectedToLogin && !(res.ok && !bodyIsJson)) return false
  if (typeof window !== 'undefined') {
    window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`
  }
  return true
}

async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  let json: unknown
  let bodyIsJson = true
  try {
    json = await res.json()
  } catch {
    json = {}
    bodyIsJson = false
  }
  if (handleSessionExpired(res, bodyIsJson)) return { ok: false, error: SESSION_EXPIRED_ERROR }
  if (res.ok) return { ok: true, data: json as T }
  return { ok: false, error: (json as { error?: string }).error || 'เกิดข้อผิดพลาด' }
}

export async function getJson<T>(url: string): Promise<ApiResult<T>> {
  try {
    return await toResult<T>(await fetch(url))
  } catch {
    return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }
  }
}

export async function sendJson<T = unknown>(
  url: string,
  body?: unknown,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return await toResult<T>(res)
  } catch {
    return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }
  }
}
