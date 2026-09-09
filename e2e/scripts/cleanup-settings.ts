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
  // Remove test fuel price logs (effectiveDate 2099-01-01 used as sentinel)
  await prisma.fuelPriceLog.deleteMany({
    where: { effectiveDate: { gte: new Date('2099-01-01') } },
  })

  // Remove rates that reference E2E test locations (cascade from location delete won't work — delete manually)
  const testLocations = await prisma.location.findMany({ where: { name: { startsWith: 'E2E_TEST_LOC' } } })
  const testLocationIds = testLocations.map(l => l.id)

  if (testLocationIds.length > 0) {
    await prisma.rateTransfer.deleteMany({ where: { locationId: { in: testLocationIds } } })
    const testIncomes = await prisma.rateIncome.findMany({ where: { factoryLocationId: { in: testLocationIds } } })
    for (const r of testIncomes) {
      await prisma.rateIncomeFuelSurcharge.deleteMany({ where: { rateIncomeId: r.id } })
    }
    await prisma.rateIncome.deleteMany({ where: { factoryLocationId: { in: testLocationIds } } })
    await prisma.rateDriverWage.deleteMany({ where: { factoryLocationId: { in: testLocationIds } } })
  }

  // Also remove towing rates that have no factory (towing test creates factoryLocationId=null record with 20DC size)
  // Only delete if driverWage matches known test values to avoid accidental deletion
  await prisma.rateDriverWage.deleteMany({ where: { factoryLocationId: null, jobType: 'towing', size: '20DC', driverWage: 1800 } })
  // Case 1b ใช้ 40FL คู่กับ factoryLocationId=null ซึ่งไม่มี factory ให้ผูก cleanup — ลบตาม size ไปเลย
  await prisma.rateDriverWage.deleteMany({ where: { factoryLocationId: null, jobType: 'towing', size: '40FL' } })

  // Remove test locations / customers created for settings tests
  await prisma.location.deleteMany({ where: { name: { startsWith: 'E2E_TEST_LOC' } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: 'E2E_TEST_CUST' } } })

  console.log('🧹 [Playwright] ลบ settings test data สำเร็จ')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
