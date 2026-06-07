import { prisma } from '@/lib/prisma'

interface WebhookLogEntry {
  level: 'error' | 'alert' | 'info'
  source: 'line-webhook' | 'watchdog'
  messageId?: string
  groupId?: string
  detail: string
}

// เขียน log ลง DB แบบ best-effort — ถ้าเขียนไม่สำเร็จจะ fallback ไป console
// เพื่อไม่ให้การ log ทำ webhook พังตาม
export async function writeWebhookLog(entry: WebhookLogEntry): Promise<void> {
  try {
    await prisma.lineWebhookLog.create({ data: entry })
  } catch (err) {
    console.error('[webhook-log] เขียน log ลง DB ไม่สำเร็จ:', err, 'entry:', entry)
  }
}

export function formatError(reason: unknown): string {
  if (reason instanceof Error) {
    return `${reason.message}${reason.stack ? `\n${reason.stack}` : ''}`
  }
  return String(reason)
}
