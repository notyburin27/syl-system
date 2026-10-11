import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { firstZodError } from './schemas'

export const CLOSED_ERROR = 'งวดนี้ถูกปิดไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง'
export const DUPLICATE_PERIOD_ERROR = 'มีงวดประเภทนี้ที่หมดวันเดียวกันอยู่แล้ว'

/** error ที่ตั้งใจให้ผู้ใช้เห็น (ข้อความไทย + status) — route แปลงเป็น response ด้วย renewalErrorResponse */
export class RenewalError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (message: string) => new RenewalError(400, message)
export const notFound = (message: string) => new RenewalError(404, message)
export const conflict = (message: string) => new RenewalError(409, message)

export const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'
export const isPrismaNotFound = (error: unknown) => (error as { code?: string } | null)?.code === 'P2025'

/** อ่าน JSON body แล้ว validate — JSON เสียหรือไม่ผ่าน schema → 400 ข้อความไทย */
export async function parseJsonBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw badRequest('รูปแบบข้อมูลไม่ถูกต้อง')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw badRequest(firstZodError(parsed.error))
  return parsed.data
}

export function renewalErrorResponse(error: unknown): NextResponse {
  if (error instanceof RenewalError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('[renewals]', error)
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
}
