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
  const fac = await loc('E2E_FUEL_SUM_F1', 'factory')
  const tow = await loc('E2E_FUEL_SUM_TOW', 'general')
  const ret = await loc('E2E_FUEL_SUM_RET', 'general')
  // ชื่อมีคำว่า "แหลม" → งานวิ่งที่รับตู้ที่นี่ใช้ค่า "รับแหลมฉบัง" ของโรงงาน
  const laem = await loc('E2E_FUEL_SUM_แหลม', 'general')

  await prisma.fuelStandard.createMany({
    data: [
      { kind: 'run', size: '40DC', locationId: fac.id, liters: 300 },
      { kind: 'towing', size: '40DC', locationId: tow.id, liters: 25 },
    ],
  })

  const driver = await prisma.driver.create({ data: { name: 'Fuel Summary Driver', vehicleNumber: 'FUEL-01' } })

  const run = { jobType: 'inbound', size: '40DC', driverId: driver.id, createdById: admin.id, factoryLocationId: fac.id, returnLocationId: ret.id }
  // สร้างทีละใบตามลำดับ — createdAt เรียงตามลำดับจริง
  // ช่วง 1: ไม่มีจุดเติมก่อนหน้า
  await prisma.job.create({ data: { ...run, jobNumber: 'E2E-FUEL-1', jobDate: day(1), pickupLocationId: ret.id, fuelOfficeLiters: 100 } })
  // ช่วง 2: วิ่ง 300 + ทอย 25 + วิ่ง (ใบที่เติม) 300 = 625, เติม 675 → +50
  await prisma.job.create({ data: { ...run, jobNumber: 'E2E-FUEL-2', jobDate: day(2), pickupLocationId: ret.id } })
  await prisma.job.create({
    data: { jobType: 'towing', size: '40DC', driverId: driver.id, createdById: admin.id, jobNumber: 'E2E-FUEL-3', jobDate: day(2), pickupLocationId: tow.id },
  })
  await prisma.job.create({ data: { ...run, jobNumber: 'E2E-FUEL-4', jobDate: day(3), pickupLocationId: ret.id, fuelCashLiters: 675 } })
  // ช่วง 3: รับตู้ที่แหลมฉบัง ยังไม่มีค่ารับแหลมฉบัง → ไม่ครบ
  await prisma.job.create({ data: { ...run, jobNumber: 'E2E-FUEL-5', jobDate: day(4), pickupLocationId: laem.id, fuelCreditLiters: 200 } })

  console.log(`🌱 [Playwright] seed น้ำมันมาตรฐานเดือน ${month}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
