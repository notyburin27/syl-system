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

const DRIVER_NAME = 'Test Driver Playwright'

async function main() {
  const drivers = await prisma.driver.findMany({ where: { name: DRIVER_NAME } })
  if (drivers.length === 0) {
    console.log(`🧹 [Playwright] driver "${DRIVER_NAME}" not found, nothing to clean`)
    return
  }
  for (const driver of drivers) {
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }
  console.log(`🧹 [Playwright] hard-deleted driver "${DRIVER_NAME}" and their jobs`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
