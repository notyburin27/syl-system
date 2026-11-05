/**
 * Mock data สำหรับทดสอบหน้า "งานที่ยังไม่มีค่า" (/jobs/settings/rates/missing) บน staging
 *
 *   npx tsx scripts/mock-missing-rates.ts            # ลบชุดเดิม (ถ้ามี) แล้ว seed ใหม่
 *   npx tsx scripts/mock-missing-rates.ts cleanup    # ลบทิ้งอย่างเดียว
 *   MOCK_MONTH=2026-10 npx tsx ...                   # ระบุเดือนเอง (default = เดือนก่อนหน้าตามเวลาไทย)
 *
 * ทุกอย่างติดป้าย MOCK_MISS (ชื่อลูกค้า/โรงงาน/คนขับ, jobNumber MOCK-MISS-*, note ของราคาน้ำมัน)
 * อ่าน DATABASE_URL จาก .env.stag เท่านั้น และไม่ยอมรันถ้าตรงกับ .env.prod
 */
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..')
const stagUrl = dotenv.parse(fs.readFileSync(path.join(root, '.env.stag'))).DATABASE_URL
const prodPath = path.join(root, '.env.prod')
const prodUrl = fs.existsSync(prodPath) ? dotenv.parse(fs.readFileSync(prodPath)).DATABASE_URL : undefined
if (!stagUrl) throw new Error('ไม่พบ DATABASE_URL ใน .env.stag')
if (prodUrl && stagUrl === prodUrl) throw new Error('DATABASE_URL ของ .env.stag ตรงกับ prod — ยกเลิก')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: stagUrl, ssl: { rejectUnauthorized: false } }),
})

const TAG = 'MOCK_MISS'
const N = (s: string) => `${TAG} ${s}`

function previousMonth(): string {
  const bkk = new Date(Date.now() + 7 * 3600_000)
  const d = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth() - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function cleanup() {
  const drivers = await prisma.driver.findMany({ where: { name: { startsWith: TAG } } })
  const driverIds = drivers.map((d) => d.id)
  const jobs = await prisma.job.deleteMany({
    where: { OR: [{ jobNumber: { startsWith: 'MOCK-MISS-' } }, { driverId: { in: driverIds } }] },
  })
  const locs = await prisma.location.findMany({ where: { name: { startsWith: TAG } } })
  const custs = await prisma.customer.findMany({ where: { name: { startsWith: TAG } } })
  const locIds = locs.map((l) => l.id)
  const custIds = custs.map((c) => c.id)
  // surcharge ลบตาม cascade ของ rate_income
  const ri = await prisma.rateIncome.deleteMany({
    where: { OR: [{ factoryLocationId: { in: locIds } }, { customerId: { in: custIds } }] },
  })
  const rw = await prisma.rateDriverWage.deleteMany({ where: { factoryLocationId: { in: locIds } } })
  const fl = await prisma.fuelPriceLog.deleteMany({ where: { note: TAG } })
  await prisma.driver.deleteMany({ where: { id: { in: driverIds } } })
  await prisma.location.deleteMany({ where: { id: { in: locIds } } })
  await prisma.customer.deleteMany({ where: { id: { in: custIds } } })
  console.log(
    `🧹 ลบ ${TAG}: งาน ${jobs.count}, ค่าขนส่ง ${ri.count}, ค่าเที่ยว ${rw.count}, ราคาน้ำมัน ${fl.count}, ` +
      `คนขับ ${drivers.length}, สถานที่ ${locs.length}, ลูกค้า ${custs.length}`,
  )
}

async function seed(month: string) {
  const [y, m] = month.split('-').map(Number)
  const day = (d: number, mm = m) => new Date(Date.UTC(y, mm - 1, d))
  const admin = await prisma.authUser.findFirstOrThrow({ where: { role: 'ADMIN' } })

  // ราคาน้ำมันในเดือน: 3 ระดับ → ค่าขนส่งของกลุ่มเดียวกันแนะนำได้หลายช่วง
  const prices: [number, number][] = [[1, 41.44], [11, 43.54], [21, 45.1]]
  for (const [d, price] of prices) {
    const exist = await prisma.fuelPriceLog.findUnique({ where: { effectiveDate: day(d) } })
    if (exist && exist.note !== TAG) {
      console.log(`⚠️  มีราคาน้ำมันวันที่ ${d} อยู่แล้ว (${exist.pricePerLiter}) — ไม่ทับ`)
      continue
    }
    await prisma.fuelPriceLog.upsert({
      where: { effectiveDate: day(d) },
      update: { pricePerLiter: price, note: TAG },
      create: { effectiveDate: day(d), pricePerLiter: price, note: TAG },
    })
  }

  const cA = await prisma.customer.create({ data: { name: N('ลูกค้า A') } })
  const cB = await prisma.customer.create({ data: { name: N('ลูกค้า B') } })
  const f1 = await prisma.location.create({ data: { name: N('โรงงาน 1'), type: 'factory' } })
  const f2 = await prisma.location.create({ data: { name: N('โรงงาน 2'), type: 'factory' } })
  const d1 = await prisma.driver.create({ data: { name: N('คนขับ 1'), vehicleNumber: 'MOCK-01' } })
  const d2 = await prisma.driver.create({ data: { name: N('คนขับ 2'), vehicleNumber: 'MOCK-02' } })
  const kahang = await prisma.location.upsert({ where: { name: 'คาหาง' }, update: {}, create: { name: 'คาหาง' } })

  // ลูกค้า B มีตารางน้ำมันอยู่แล้ว (ช่วงไม่ตรงขั้น 2 บาท) → กลุ่มใหม่ของ B แนะนำช่วงตามตารางนี้
  await prisma.rateIncome.create({
    data: {
      jobType: 'inbound', size: '20DC', factoryLocationId: f2.id, customerId: cB.id, income: 9000,
      fuelSurcharges: {
        create: [
          { fuelPriceMin: 40.0, fuelPriceMax: 42.51, surcharge: 0 },
          { fuelPriceMin: 42.51, fuelPriceMax: 44.01, surcharge: 200 },
        ],
      },
    },
  })
  await prisma.rateDriverWage.create({
    data: { jobType: 'inbound', size: '20DC', factoryLocationId: f2.id, driverWage: 600 },
  })

  let seq = 0
  let t = Date.now() - 3600_000
  const job = (data: Record<string, unknown>) =>
    prisma.job.create({
      data: {
        jobNumber: `MOCK-MISS-${String(++seq).padStart(2, '0')}`,
        createdById: admin.id,
        driverId: d1.id,
        customerId: cA.id,
        createdAt: new Date((t += 60_000)),
        ...data,
      } as never,
    })

  // ── ยังไม่มีอัตรา ──
  for (const d of [3, 9, 14, 24]) // A / โรงงาน 1 / ส่งออก 20DC — ราคาน้ำมัน 3 ระดับ → 3 ช่วง
    await job({ jobType: 'outbound', size: '20DC', factoryLocationId: f1.id, jobDate: day(d) })
  for (const d of [5, 7]) // A / โรงงาน 2 / นำเข้า 40DC — ช่วงเดียว
    await job({ jobType: 'inbound', size: '40DC', factoryLocationId: f2.id, jobDate: day(d) })
  for (const d of [6, 16, 27]) // B / โรงงาน 1 / ส่งออก 40DC — แนะนำช่วงจากตารางของลูกค้า B
    await job({ jobType: 'outbound', size: '40DC', factoryLocationId: f1.id, customerId: cB.id, jobDate: day(d) })

  // ── มีอัตราแล้วแต่ยังไม่เติม ── B / โรงงาน 2 / นำเข้า 20DC
  for (const d of [12, 13])
    await job({ jobType: 'inbound', size: '20DC', factoryLocationId: f2.id, customerId: cB.id, jobDate: day(d) })

  // ── จับคู่งาน ── ใบรอง (เก่ากว่า) ยอดว่างและไม่นับ / ใบหลักนับเป็น 2x20DC
  const sec = await job({ jobType: 'inbound', size: '20DC', factoryLocationId: f1.id, jobDate: day(18) })
  const pri = await job({ jobType: 'inbound', size: '20DC', factoryLocationId: f1.id, jobDate: day(18) })
  await prisma.jobPairLink.create({ data: { primaryJobId: pri.id, secondaryJobId: sec.id } })

  // ── ทอย ──
  await job({ jobType: 'towingHeavy', size: '40DC', factoryLocationId: f1.id, jobDate: day(19) })
  await job({ jobType: 'towing', size: '40DC', jobDate: day(20) }) // ค่าเที่ยว towing|40DC มีอยู่แล้วบน staging
  // ทอยที่จะถูกดูดซับ: คนขับ 2 ทอยก่อน แล้ววิ่งงานรับตู้จากคาหางวันเดียวกัน → ไม่ควรโผล่ฝั่งค่าเที่ยว
  await job({ jobType: 'towing', size: '20DC', driverId: d2.id, jobDate: day(22) })
  await job({
    jobType: 'outbound', size: '20DC', driverId: d2.id, factoryLocationId: f2.id, pickupLocationId: kahang.id,
    jobDate: day(22), income: 7000, driverWage: 600,
  })

  // ── ข้อมูลไม่ครบ ──
  await job({ jobType: 'outbound', size: '20DC', jobDate: day(23) }) // ไม่มีโรงงาน
  await job({ jobType: 'inbound', factoryLocationId: f1.id, jobDate: day(26) }) // ไม่มี SIZE
  await job({ jobType: 'outbound', size: '40DC', factoryLocationId: f1.id, customerId: null, jobDate: day(28) }) // ไม่มีลูกค้า

  // ── ไม่ควรโผล่ ──
  await job({ jobType: 'outbound', size: '20DC', factoryLocationId: f1.id, jobDate: day(10), income: 8000, driverWage: 700 })
  await job({ jobType: 'outbound', size: '20DC', factoryLocationId: f1.id, jobDate: day(11), isCancelled: true })
  await job({ jobType: 'advance', jobDate: day(15), advance: 500 })
  await job({ jobType: 'outbound', size: '20DC', factoryLocationId: f1.id, jobDate: day(25, m - 1) }) // เดือนก่อนนั้น

  console.log(`🌱 seed ${TAG} เดือน ${month}: งาน ${seq} ใบ (ADMIN ที่ใช้เป็นผู้สร้าง: ${admin.username})`)
}

async function main() {
  await cleanup()
  if (process.argv[2] === 'cleanup') return
  const month = process.env.MOCK_MONTH ?? previousMonth()
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('MOCK_MONTH ต้องเป็น YYYY-MM')
  await seed(month)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
