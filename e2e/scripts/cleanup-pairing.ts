import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// local Postgres (docker) ไม่รองรับ SSL — เปิดเฉพาะตอนต่อ DB บนคลาวด์
const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

// ชื่อเฉพาะของ spec จับคู่งาน — อย่าให้ชนกับ spec อื่น
const DRIVER_NAMES = ['Pairing Test Driver']

async function main() {
  const drivers = await prisma.driver.findMany({ where: { name: { in: DRIVER_NAMES } } })
  for (const driver of drivers) {
    // JobPairLink cascade ตาม job อยู่แล้ว (onDelete: Cascade ทั้งสองฝั่ง)
    // แต่ลบ link ก่อนกันไว้ เผื่อลำดับ delete ของ Postgres สะดุด FK
    const jobs = await prisma.job.findMany({ where: { driverId: driver.id }, select: { id: true } })
    const jobIds = jobs.map((j) => j.id)
    if (jobIds.length > 0) {
      await prisma.jobPairLink.deleteMany({
        where: { OR: [{ primaryJobId: { in: jobIds } }, { secondaryJobId: { in: jobIds } }] },
      })
    }
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverMonthlyEntry.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }
  console.log(`🧹 [Playwright] ลบคนขับทดสอบจับคู่งาน ${drivers.length} คน พร้อมงานและคู่ทั้งหมด`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
