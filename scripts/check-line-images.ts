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

function formatGap(gapHours: number) {
  if (gapHours < 1) return `${Math.round(gapHours * 60)} minutes`
  return `${gapHours.toFixed(1)} hours`
}

async function main() {
  const now = new Date()

  // 1) หารูปล่าสุดที่เข้าระบบ
  const latestImage = await prisma.lineImage.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  if (!latestImage) {
    console.log('[watchdog] No images in the system yet — skipping check')
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
      console.log(`[watchdog] Gap of ${formatGap(gapHours)} — already alerted, skipping`)
    } else {
      const detail = `ไม่มีรูป LINE เข้าระบบมา ${gapHours.toFixed(1)} ชั่วโมง (รูปล่าสุด ${latestImage.createdAt.toISOString()})`
      await prisma.lineWebhookLog.create({
        data: { level: 'alert', source: 'watchdog', detail },
      })
      console.error(`[watchdog] ALERT: No LINE images received for ${formatGap(gapHours)} (latest image at ${latestImage.createdAt.toISOString()})`)
    }
  } else {
    console.log(`[watchdog] OK — latest image received ${formatGap(gapHours)} ago`)
  }

  // 2) ลบ log เก่าเกิน retention
  const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 3_600_000)
  const deleted = await prisma.lineWebhookLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })
  if (deleted.count > 0) {
    console.log(`[watchdog] Deleted ${deleted.count} log rows older than ${LOG_RETENTION_DAYS} days`)
  }
}

main()
  .catch((err) => {
    console.error('[watchdog] error:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
