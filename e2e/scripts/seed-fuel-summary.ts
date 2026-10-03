import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const month = process.env.FUEL_MONTH
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error('ต้องระบุ FUEL_MONTH=YYYY-MM')
  const [y, m] = month.split('-').map(Number)
  const day = (d: number) => new Date(Date.UTC(y, m - 1, d))

  const admin = await prisma.authUser.findUniqueOrThrow({ where: { username: 'testadmin' } })
  const loc = async (name: string, type: string) => prisma.location.create({ data: { name, type } })
  const p1 = await loc('E2E_FUEL_SUM_P1', 'general')
  const p2 = await loc('E2E_FUEL_SUM_P2', 'general')
  const f1 = await loc('E2E_FUEL_SUM_F1', 'factory')
  const ret = await loc('E2E_FUEL_SUM_RET', 'general')

  await prisma.fuelStandard.create({
    data: { size: '40DC', pickupLocationId: p1.id, factoryLocationId: f1.id, returnLocationId: ret.id, liters: 300 },
  })

  const driver = await prisma.driver.create({ data: { name: 'Fuel Summary Driver', vehicleNumber: 'FUEL-01' } })

  const base = { jobType: 'inbound', size: '40DC', driverId: driver.id, createdById: admin.id, factoryLocationId: f1.id, returnLocationId: ret.id }
  // สร้างทีละใบตามลำดับ — createdAt เรียงตามลำดับจริง
  await prisma.job.create({ data: { ...base, jobNumber: 'E2E-FUEL-1', jobDate: day(1), pickupLocationId: p1.id, fuelOfficeLiters: 100 } })
  await prisma.job.create({ data: { ...base, jobNumber: 'E2E-FUEL-2', jobDate: day(2), pickupLocationId: p1.id } })
  await prisma.job.create({ data: { ...base, jobNumber: 'E2E-FUEL-3', jobDate: day(3), pickupLocationId: p1.id, fuelCashLiters: 650 } })
  await prisma.job.create({ data: { ...base, jobNumber: 'E2E-FUEL-4', jobDate: day(4), pickupLocationId: p2.id, fuelCreditLiters: 200 } })

  console.log(`🌱 [Playwright] seed น้ำมันมาตรฐานเดือน ${month}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
