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

async function main() {
  const locations = await prisma.location.findMany({ where: { name: { startsWith: 'E2E_FUEL' } } })
  const ids = locations.map((l) => l.id)

  // มาตรฐานอ้างสถานที่ด้วย FK — ต้องลบก่อนสถานที่
  await prisma.fuelStandard.deleteMany({ where: { locationId: { in: ids } } })

  const drivers = await prisma.driver.findMany({ where: { name: 'Fuel Summary Driver' } })
  for (const driver of drivers) {
    await prisma.driverMonthlyEntry.deleteMany({ where: { driverId: driver.id } })
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }

  await prisma.location.deleteMany({ where: { id: { in: ids } } })
  console.log(`🧹 [Playwright] ลบข้อมูลน้ำมันมาตรฐาน (สถานที่ ${ids.length}, คนขับ ${drivers.length})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
