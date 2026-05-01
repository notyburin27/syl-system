import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
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
