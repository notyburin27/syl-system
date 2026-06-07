// Watchdog: ตรวจว่ารูป LINE เข้าระบบตามปกติไหม (รันเป็น scheduled job ทุกชั่วโมง)
// ถ้าไม่มีรูปเข้านานเกิน threshold → บันทึก alert ลง line_webhook_logs
// (ยังไม่ส่งแจ้งเตือนภายนอก — ต่อยอด LINE push ได้ภายหลัง)
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: {
      rejectUnauthorized: false,
    },
  })
  return new PrismaClient({ adapter })
}

const prisma = createPrismaClient()

const GAP_THRESHOLD_HOURS = 4 // ปกติรูปเข้าห่างกันไม่เกิน ~2-3 ชม. (ดูจากข้อมูลจริง มิ.ย. 2026)
const LOG_RETENTION_DAYS = 90

async function main() {
  const now = new Date()

  // 1) หารูปล่าสุดที่เข้าระบบ
  const latestImage = await prisma.lineImage.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  if (!latestImage) {
    console.log('[watchdog] ยังไม่มีรูปในระบบ — ข้ามการตรวจ')
    return
  }

  const gapHours = (now.getTime() - latestImage.createdAt.getTime()) / 3_600_000

  if (gapHours > GAP_THRESHOLD_HOURS) {
    // dedupe: ถ้าเคย alert สำหรับ gap นี้แล้ว (alert ใหม่กว่ารูปล่าสุด) ไม่ต้อง alert ซ้ำ
    const existingAlert = await prisma.lineWebhookLog.findFirst({
      where: {
        source: 'watchdog',
        level: 'alert',
        createdAt: { gt: latestImage.createdAt },
      },
    })

    if (existingAlert) {
      console.log(`[watchdog] gap ${gapHours.toFixed(1)} ชม. — เคย alert แล้ว ข้าม`)
    } else {
      const detail = `ไม่มีรูป LINE เข้าระบบมา ${gapHours.toFixed(1)} ชั่วโมง (รูปล่าสุด ${latestImage.createdAt.toISOString()})`
      await prisma.lineWebhookLog.create({
        data: { level: 'alert', source: 'watchdog', detail },
      })
      console.error(`[watchdog] ALERT: ${detail}`)
    }
  } else {
    console.log(`[watchdog] ปกติ — รูปล่าสุดเข้าเมื่อ ${gapHours.toFixed(1)} ชม. ก่อน`)
  }

  // 2) ลบ log เก่าเกิน retention
  const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 3_600_000)
  const deleted = await prisma.lineWebhookLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })
  if (deleted.count > 0) {
    console.log(`[watchdog] ลบ log เก่ากว่า ${LOG_RETENTION_DAYS} วัน: ${deleted.count} แถว`)
  }
}

main()
  .catch((err) => {
    console.error('[watchdog] error:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
