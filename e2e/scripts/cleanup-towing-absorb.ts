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

// ชื่อเฉพาะของ spec ดูดซับทอยตู้ — อย่าให้ชนกับ spec อื่น
const DRIVER_NAMES = ['TowingAbsorb Test Driver']

async function main() {
  const drivers = await prisma.driver.findMany({ where: { name: { in: DRIVER_NAMES } } })
  for (const driver of drivers) {
    const jobs = await prisma.job.findMany({ where: { driverId: driver.id }, select: { id: true } })
    const jobIds = jobs.map((j) => j.id)
    if (jobIds.length > 0) {
      // link ทั้งสองแบบ cascade อยู่แล้ว แต่ลบก่อนกันลำดับ FK สะดุด
      await prisma.jobPairLink.deleteMany({
        where: { OR: [{ primaryJobId: { in: jobIds } }, { secondaryJobId: { in: jobIds } }] },
      })
      await prisma.jobTowingLink.deleteMany({
        where: { OR: [{ mainJobId: { in: jobIds } }, { towingJobId: { in: jobIds } }] },
      })
    }
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverMonthlyEntry.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }

  // อัตราค่าเที่ยวทอยตู้ของ spec นี้ — ผูกกับ factoryLocationId: null จึงไม่มี location
  // ให้ cascade ตาม ล็อกด้วยค่า driverWage เฉพาะของ spec นี้กันลบของ spec อื่น
  await prisma.rateDriverWage.deleteMany({
    where: { factoryLocationId: null, jobType: 'towing', size: '20DC', driverWage: 180 },
  })

  // ลูกค้า/สถานที่ของ spec นี้ — "คาหาง" เป็นชื่อจริงตามโดเมน สร้างใหม่ทุกครั้งไม่ได้
  // ถ้าไม่ลบทิ้ง จะชน unique constraint ตอนเทสต์ถัดไปสร้างซ้ำ
  await prisma.location.deleteMany({
    where: { OR: [{ name: 'คาหาง' }, { name: { startsWith: 'E2E_TEST_LOC' } }] },
  })
  await prisma.customer.deleteMany({ where: { name: { startsWith: 'E2E_TEST_CUST' } } })

  console.log(
    `🧹 [Playwright] ลบคนขับทดสอบดูดซับทอยตู้ ${drivers.length} คน พร้อมงาน/สถานที่/ลูกค้าทั้งหมด`
  )
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
