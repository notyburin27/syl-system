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

// ลบเฉพาะของ spec งานที่ยังไม่มีค่า — สถานที่ "คาหาง" เป็นชื่อจริงตามโดเมน อาจมีอยู่ก่อน จึงไม่ลบ
async function main() {
  const drivers = await prisma.driver.findMany({ where: { name: 'E2E_MISS Driver' } })
  for (const driver of drivers) {
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverMonthlyEntry.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }

  const locations = await prisma.location.findMany({ where: { name: { startsWith: 'E2E_MISS_' } } })
  const locationIds = locations.map((l) => l.id)
  const customers = await prisma.customer.findMany({ where: { name: { startsWith: 'E2E_MISS_' } } })
  const customerIds = customers.map((c) => c.id)

  // surcharge cascade ตาม rate_income
  await prisma.rateIncome.deleteMany({
    where: { OR: [{ factoryLocationId: { in: locationIds } }, { customerId: { in: customerIds } }] },
  })
  await prisma.rateDriverWage.deleteMany({ where: { factoryLocationId: { in: locationIds } } })
  await prisma.fuelPriceLog.deleteMany({ where: { note: 'E2E_MISS' } })

  await prisma.location.deleteMany({ where: { id: { in: locationIds } } })
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } })

  console.log(
    `🧹 [Playwright] ลบข้อมูลงานที่ยังไม่มีค่า (คนขับ ${drivers.length}, สถานที่ ${locationIds.length}, ลูกค้า ${customerIds.length})`,
  )
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
