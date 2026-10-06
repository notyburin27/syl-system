export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  const json: unknown = await res.json().catch(() => ({}))
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
