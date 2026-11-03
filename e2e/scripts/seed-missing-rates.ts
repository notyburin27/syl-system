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

const NOTE = 'E2E_MISS'
const DRIVER = 'E2E_MISS Driver'

/**
 * seed หน้าค่าที่ยังขาด (เดือนก่อนหน้า)
 * - ปกติ: ลูกค้า/โรงงาน/คนขับ/ราคาน้ำมัน + J1–J4
 * - MISSING_PART=absorb: เพิ่ม J5 (ทอย) + J6 (รับตู้ที่คาหาง) ให้คนขับเดิม — ต้องรันหลัง seed ปกติ
 */
async function main() {
  const month = process.env.MISSING_MONTH
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error('ต้องระบุ MISSING_MONTH=YYYY-MM')
  const [y, m] = month.split('-').map(Number)
  const day = (d: number) => new Date(Date.UTC(y, m - 1, d))

  const admin = await prisma.authUser.findUniqueOrThrow({ where: { username: 'testadmin' } })

  if (process.env.MISSING_PART === 'absorb') {
    const driver = await prisma.driver.findUniqueOrThrow({ where: { name: DRIVER } })
    const customer = await prisma.customer.findUniqueOrThrow({ where: { name: 'E2E_MISS_C1' } })
    const f1 = await prisma.location.findUniqueOrThrow({ where: { name: 'E2E_MISS_F1' } })
    // ชื่อจริงตามโดเมน อาจมีอยู่แล้ว — upsert และ cleanup ไม่ลบทิ้ง
    const kahang = await prisma.location.upsert({ where: { name: 'คาหาง' }, update: {}, create: { name: 'คาหาง' } })
    const base = { size: '20DC', driverId: driver.id, customerId: customer.id, createdById: admin.id, jobDate: day(15) }
    // ทอยต้องถูกบันทึกก่อนงานหลัก — กำหนด createdAt เองกันชนกันในมิลลิวินาทีเดียว
    const now = Date.now()
    await prisma.job.create({
      data: { ...base, jobType: 'towing', jobNumber: 'E2E-MISS-5', createdAt: new Date(now - 60_000) },
    })
    await prisma.job.create({
      data: {
        ...base, jobType: 'outbound', jobNumber: 'E2E-MISS-6', createdAt: new Date(now),
        factoryLocationId: f1.id, pickupLocationId: kahang.id, driverWage: 500, income: 5000,
      },
    })
    console.log(`🌱 [Playwright] seed ทอยที่จะถูกดูดซับ (ค่าที่ยังขาด) เดือน ${month}`)
    return
  }

  // ราคาน้ำมันของเดือนต้องมาจาก log ของ spec นี้เท่านั้น — ถ้ามี log อื่นในเดือนจะได้ราคาไม่ตรง
  const foreign = await prisma.fuelPriceLog.findMany({
    // note เป็น null ได้ — NOT { note } ใน SQL จะตัดแถว null ทิ้ง
    where: { effectiveDate: { gte: day(1), lte: day(25) }, OR: [{ note: null }, { note: { not: NOTE } }] },
  })
  if (foreign.length > 0) {
    throw new Error(
      `มี fuel_price_log อื่นในเดือน ${month} (${foreign.map((l) => l.effectiveDate.toISOString().slice(0, 10)).join(', ')}) — seed จะทับไม่ได้`,
    )
  }
  for (const [d, price] of [[1, 41.44], [20, 43.54]] as const) {
    await prisma.fuelPriceLog.upsert({
      where: { effectiveDate: day(d) },
      update: { pricePerLiter: price, note: NOTE },
      create: { effectiveDate: day(d), pricePerLiter: price, note: NOTE },
    })
  }

  const customer = await prisma.customer.create({ data: { name: 'E2E_MISS_C1' } })
  const f1 = await prisma.location.create({ data: { name: 'E2E_MISS_F1', type: 'factory' } })
  const f2 = await prisma.location.create({ data: { name: 'E2E_MISS_F2', type: 'factory' } })
  const driver = await prisma.driver.create({ data: { name: DRIVER, vehicleNumber: 'MISS-01' } })

  const base = { driverId: driver.id, customerId: customer.id, createdById: admin.id }
  // J1/J2: ไม่มีอัตรา — ราคาน้ำมัน 41.44 / 43.54 → 2 ช่วง
  await prisma.job.create({
    data: { ...base, jobNumber: 'E2E-MISS-1', jobType: 'outbound', size: '20DC', factoryLocationId: f1.id, jobDate: day(5) },
  })
  await prisma.job.create({
    data: { ...base, jobNumber: 'E2E-MISS-2', jobType: 'outbound', size: '20DC', factoryLocationId: f1.id, jobDate: day(25) },
  })
  // J3: มีอัตราทั้งสองฝั่งแล้วแต่ยังไม่เติม
  await prisma.job.create({
    data: { ...base, jobNumber: 'E2E-MISS-3', jobType: 'inbound', size: '40DC', factoryLocationId: f2.id, jobDate: day(10) },
  })
  await prisma.rateIncome.create({
    data: { jobType: 'inbound', size: '40DC', factoryLocationId: f2.id, customerId: customer.id, income: 4000 },
  })
  await prisma.rateDriverWage.create({
    data: { jobType: 'inbound', size: '40DC', factoryLocationId: f2.id, driverWage: 350 },
  })
  // J4: ไม่มีโรงงาน → ข้อมูลไม่ครบ
  await prisma.job.create({
    data: { ...base, jobNumber: 'E2E-MISS-4', jobType: 'outbound', size: '20DC', jobDate: day(12) },
  })

  console.log(`🌱 [Playwright] seed ค่าที่ยังขาด เดือน ${month}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
