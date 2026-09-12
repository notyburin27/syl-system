import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// local Postgres (docker) ไม่รองรับ SSL — เปิดเฉพาะตอนต่อ DB บนคลาวด์
const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

const DRIVER_NAMES = ['Test Driver Playwright', 'Test Driver Playwright B']

async function main() {
  const drivers = await prisma.driver.findMany({ where: { name: { in: DRIVER_NAMES } } })
  if (drivers.length === 0) {
    console.log(`🧹 [Playwright] ไม่พบคนขับทดสอบ ไม่ต้องล้างข้อมูล`)
    return
  }
  for (const driver of drivers) {
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }
  console.log(`🧹 [Playwright] ลบคนขับทดสอบ ${drivers.length} คน พร้อมงานทั้งหมด`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
