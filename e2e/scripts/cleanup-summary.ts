import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

const DRIVER_NAMES = ['Summary Driver A', 'Summary Driver B', 'Summary Driver Ungrouped']

async function main() {
  const drivers = await prisma.driver.findMany({ where: { name: { in: DRIVER_NAMES } } })
  for (const driver of drivers) {
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }
  console.log(`🧹 [Playwright] ลบคนขับทดสอบ summary ${drivers.length} คน`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
