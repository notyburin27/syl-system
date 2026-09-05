import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER_NAME = 'Test Driver Playwright'
const VEHICLE_NUMBER = 'BKK-CORE'

const JOB_DAY = dayjs().startOf('month')
const CURRENT_MONTH = dayjs().format('YYYY-MM')

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs/, { timeout: 15_000 })
}

function cleanupDriver() {
  execSync('npx tsx e2e/scripts/cleanup-driver.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

function cleanupSettings() {
  execSync('npx tsx e2e/scripts/cleanup-settings.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

async function createDriver(page: Page) {
  const res = await page.request.post('/api/drivers', {
    data: { name: DRIVER_NAME, vehicleNumber: VEHICLE_NUMBER },
  })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

/** สร้างงานผ่าน API — คืน id */
async function createJob(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/jobs', {
    data: {
      jobDate: JOB_DAY.format('YYYY-MM-DD'),
      jobType: 'inbound',
      ...data,
    },
  })
  if (!res.ok()) throw new Error(`createJob failed — ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

async function getJob(page: Page, jobId: string) {
  const res = await page.request.get(`/api/jobs/${jobId}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Record<string, unknown> & {
    transfers: { id: string; amount: string | number; isCompleted: boolean }[]
  }
}

/** location + customer สำหรับผูก rate (ชื่อขึ้นต้น E2E_TEST_ เพื่อให้ cleanup-settings เก็บกวาด) */
async function seedRefData(page: Page, suffix: string) {
  const [locGeneral, locFactory, customer] = await Promise.all([
    page.request.post('/api/locations', { data: { name: `E2E_TEST_LOC_GENERAL_${suffix}`, type: 'general' } }),
    page.request.post('/api/locations', { data: { name: `E2E_TEST_LOC_FACTORY_${suffix}`, type: 'factory' } }),
    page.request.post('/api/customers', { data: { name: `E2E_TEST_CUST_${suffix}` } }),
  ])
  for (const r of [locGeneral, locFactory, customer]) {
    if (!r.ok()) throw new Error(`seedRefData failed — ${await r.text()}`)
  }
  return {
    locationGeneralId: ((await locGeneral.json()) as { id: string }).id,
    locationFactoryId: ((await locFactory.json()) as { id: string }).id,
    customerId: ((await customer.json()) as { id: string }).id,
  }
}

// serial: ทุกเคสใช้ driver ชื่อเดียวกัน — ต้องรันทีละตัวกัน unique-constraint ชน
test.describe.serial('Job core — ยกเลิก / ลบ / โอน / ยกยอด / ทอยตู้ / คำนวณ', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test.afterEach(() => {
    cleanupDriver()
    cleanupSettings()
  })

  // ─── ยกเลิกงาน ──────────────────────────────────────────────────────────
  test('ยกเลิกงาน: ส่วนต่างกลายเป็น −(ยกยอด + ยอดโอน) และเคลียร์ได้ทันที', async ({ page }) => {
    const driverId = await createDriver(page)
    // งานมีค่าใช้จ่าย 500 แต่ยังไม่มีการโอน → ส่วนต่าง = 500 ≠ 0 → เคลียร์ไม่ได้
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-CANCEL-001', liftFee: 500 })

    const blocked = await page.request.patch(`/api/jobs/${jobId}/clear`)
    expect(blocked.status()).toBe(400)

    // ยกเลิกงาน → ค่าใช้จ่ายคนขับถูกล้าง (difference คิดจาก 0) → เคลียร์ผ่าน
    const cancelled = await page.request.patch(`/api/jobs/${jobId}`, { data: { isCancelled: true } })
    expect(cancelled.ok()).toBeTruthy()
    expect((await cancelled.json()).isCancelled).toBe(true)

    const cleared = await page.request.patch(`/api/jobs/${jobId}/clear`)
    expect(cleared.ok()).toBeTruthy()
    expect((await cleared.json()).clearStatus).toBe(true)
  })

  test('ยกเลิกงาน: แถวในตารางแสดงสถานะยกเลิก (cancelled-row)', async ({ page }) => {
    const driverId = await createDriver(page)
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-CANCEL-002', liftFee: 300 })
    await page.request.post(`/api/jobs/${jobId}/transfers`, { data: { amount: 300, isCompleted: true } })
    const res = await page.request.patch(`/api/jobs/${jobId}`, { data: { isCancelled: true } })
    expect(res.ok()).toBeTruthy()

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)
    await expect(page.getByText('E2E-CANCEL-002')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('tr.cancelled-row')).toHaveCount(1)
  })

  // ─── ลบงาน ──────────────────────────────────────────────────────────────
  test('ลบงาน: ลบได้เมื่อยังไม่เคลียร์ และหายจากตาราง', async ({ page }) => {
    const driverId = await createDriver(page)
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-DEL-001' })

    const res = await page.request.delete(`/api/jobs/${jobId}`)
    expect(res.ok()).toBeTruthy()

    const after = await page.request.get(`/api/jobs/${jobId}`)
    expect(after.status()).toBe(404)

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)
    await expect(page.getByText('E2E-DEL-001')).toHaveCount(0)
  })

  test('ลบงาน: งานที่เคลียร์แล้วลบไม่ได้ (403)', async ({ page }) => {
    const driverId = await createDriver(page)
    // ไม่มีค่าใช้จ่ายเลย → ส่วนต่าง = 0 → เคลียร์ได้
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-DEL-002' })
    expect((await page.request.patch(`/api/jobs/${jobId}/clear`)).ok()).toBeTruthy()

    const res = await page.request.delete(`/api/jobs/${jobId}`)
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toContain('ถูกล็อคแล้ว')

    // งานยังอยู่
    expect((await page.request.get(`/api/jobs/${jobId}`)).ok()).toBeTruthy()
  })

  test('แก้ไขงาน: งานที่เคลียร์แล้วแก้ไขไม่ได้ (403)', async ({ page }) => {
    const driverId = await createDriver(page)
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-LOCK-001' })
    expect((await page.request.patch(`/api/jobs/${jobId}/clear`)).ok()).toBeTruthy()

    const res = await page.request.patch(`/api/jobs/${jobId}`, { data: { liftFee: 999 } })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toContain('ถูกล็อคแล้ว')
  })

  // ─── การโอน (transfers) ─────────────────────────────────────────────────
  test('การโอน: เพิ่ม/แก้ไข/ลบ และมีเฉพาะ isCompleted ที่นับเข้ายอดโอน', async ({ page }) => {
    const driverId = await createDriver(page)
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-TRF-001', liftFee: 1000 })

    // เพิ่ม 2 รายการ — เสร็จแล้ว 600, ยังไม่เสร็จ 400
    const done = await page.request.post(`/api/jobs/${jobId}/transfers`, { data: { amount: 600, isCompleted: true } })
    expect(done.status()).toBe(201)
    const pending = await page.request.post(`/api/jobs/${jobId}/transfers`, { data: { amount: 400, isCompleted: false } })
    expect(pending.status()).toBe(201)
    const pendingId = ((await pending.json()) as { id: string }).id

    // ส่วนต่าง = 1000 − 0 − 600 = 400 ≠ 0 → ยังเคลียร์ไม่ได้ (ยอดที่ยังไม่เสร็จไม่ถูกนับ)
    expect((await page.request.patch(`/api/jobs/${jobId}/clear`)).status()).toBe(400)

    // ทำรายการที่ค้างให้เสร็จ → รวมเป็น 1000 → เคลียร์ได้
    const patched = await page.request.patch(`/api/jobs/transfers/${pendingId}`, { data: { isCompleted: true } })
    expect(patched.ok()).toBeTruthy()
    expect((await page.request.patch(`/api/jobs/${jobId}/clear`)).ok()).toBeTruthy()
  })

  test('การโอน: แก้จำนวนเงิน และลบรายการ', async ({ page }) => {
    const driverId = await createDriver(page)
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-TRF-002', liftFee: 500 })

    const created = await page.request.post(`/api/jobs/${jobId}/transfers`, { data: { amount: 100, isCompleted: true } })
    const transferId = ((await created.json()) as { id: string }).id

    // แก้เป็น 500 → ส่วนต่าง 0 → เคลียร์ได้
    expect((await page.request.patch(`/api/jobs/transfers/${transferId}`, { data: { amount: 500 } })).ok()).toBeTruthy()
    let job = await getJob(page, jobId)
    expect(Number(job.transfers[0].amount)).toBe(500)

    // ลบรายการโอน → ไม่มีการโอนเหลือ
    expect((await page.request.delete(`/api/jobs/transfers/${transferId}`)).ok()).toBeTruthy()
    job = await getJob(page, jobId)
    expect(job.transfers).toHaveLength(0)
  })

  test('การโอน: งานที่เคลียร์แล้วเพิ่ม/แก้/ลบการโอนไม่ได้ (403)', async ({ page }) => {
    const driverId = await createDriver(page)
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-TRF-003', liftFee: 200 })
    const created = await page.request.post(`/api/jobs/${jobId}/transfers`, { data: { amount: 200, isCompleted: true } })
    const transferId = ((await created.json()) as { id: string }).id
    expect((await page.request.patch(`/api/jobs/${jobId}/clear`)).ok()).toBeTruthy()

    expect((await page.request.post(`/api/jobs/${jobId}/transfers`, { data: { amount: 50 } })).status()).toBe(403)
    expect((await page.request.patch(`/api/jobs/transfers/${transferId}`, { data: { amount: 50 } })).status()).toBe(403)
    expect((await page.request.delete(`/api/jobs/transfers/${transferId}`)).status()).toBe(403)
  })

  test('การโอน: จำนวนเงินไม่ใช่ตัวเลข → 400', async ({ page }) => {
    const driverId = await createDriver(page)
    const jobId = await createJob(page, { driverId, jobNumber: 'E2E-TRF-004' })

    const res = await page.request.post(`/api/jobs/${jobId}/transfers`, { data: { amount: 'abc' } })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toContain('จำนวนเงินไม่ถูกต้อง')
  })

  // ─── ยกยอด (carry over) ─────────────────────────────────────────────────
  test('ยกยอด: งานที่ยกยอดไปงานอื่นเคลียร์ได้แม้ส่วนต่างไม่เป็น 0', async ({ page }) => {
    const driverId = await createDriver(page)
    const sourceId = await createJob(page, { driverId, jobNumber: 'E2E-CARRY-SRC', liftFee: 800 })
    const targetId = await createJob(page, {
      driverId,
      jobNumber: 'E2E-CARRY-DST',
      jobDate: JOB_DAY.add(1, 'day').format('YYYY-MM-DD'),
    })

    // ยังไม่ยกยอด → ส่วนต่าง 800 → เคลียร์ไม่ได้
    expect((await page.request.patch(`/api/jobs/${sourceId}/clear`)).status()).toBe(400)

    // ยกยอดไปงานปลายทาง → เคลียร์ได้
    const linked = await page.request.patch(`/api/jobs/${sourceId}`, { data: { carryOverToJobId: targetId } })
    expect(linked.ok()).toBeTruthy()
    expect((await page.request.patch(`/api/jobs/${sourceId}/clear`)).ok()).toBeTruthy()

    // งานต้นทางอ้างถึงงานปลายทางถูกต้อง (GET รายตัวคืนเฉพาะ scalar carryOverToJobId)
    const source = await getJob(page, sourceId)
    expect(source.carryOverToJobId).toBe(targetId)

    // list API include relation — ใช้แสดงคอลัมน์ "ยกยอดไป" ในตาราง
    const listRes = await page.request.get(`/api/jobs?month=${CURRENT_MONTH}&driverId=${driverId}`)
    expect(listRes.ok()).toBeTruthy()
    const list = (await listRes.json()) as { id: string; carryOverToJob?: { jobNumber: string } }[]
    expect(list.find((j) => j.id === sourceId)?.carryOverToJob?.jobNumber).toBe('E2E-CARRY-DST')
  })

  test('ยกยอด: ยกเลิกการยกยอด → กลับไปเคลียร์ไม่ได้', async ({ page }) => {
    const driverId = await createDriver(page)
    const sourceId = await createJob(page, { driverId, jobNumber: 'E2E-CARRY-SRC2', liftFee: 700 })
    const targetId = await createJob(page, {
      driverId,
      jobNumber: 'E2E-CARRY-DST2',
      jobDate: JOB_DAY.add(1, 'day').format('YYYY-MM-DD'),
    })

    await page.request.patch(`/api/jobs/${sourceId}`, { data: { carryOverToJobId: targetId } })
    const unlinked = await page.request.patch(`/api/jobs/${sourceId}`, { data: { carryOverToJobId: null } })
    expect(unlinked.ok()).toBeTruthy()

    expect((await page.request.patch(`/api/jobs/${sourceId}/clear`)).status()).toBe(400)
  })

  // ─── ทอยตู้ (towing links) ──────────────────────────────────────────────
  test('ทอยตู้: เชื่อมงานทอยตู้เข้างานหลัก และตัดการเชื่อม', async ({ page }) => {
    const driverId = await createDriver(page)
    const mainId = await createJob(page, { driverId, jobNumber: 'E2E-TOW-MAIN' })
    const towingId = await createJob(page, { driverId, jobNumber: 'E2E-TOW-1', jobType: 'towing' })

    const linked = await page.request.post(`/api/jobs/${mainId}/towing-links`, {
      data: { sequence: 1, towingJobId: towingId },
    })
    expect(linked.ok()).toBeTruthy()

    const main = await getJob(page, mainId)
    expect((main.towingLinksAsMain as { towingJob: { jobNumber: string } }[])[0].towingJob.jobNumber).toBe('E2E-TOW-1')

    const unlinked = await page.request.delete(`/api/jobs/${mainId}/towing-links/1`)
    expect(unlinked.ok()).toBeTruthy()
    expect((await getJob(page, mainId)).towingLinksAsMain).toHaveLength(0)
  })

  test('ทอยตู้: slot ซ้ำ → 409 และ sequence นอกช่วง → 400', async ({ page }) => {
    const driverId = await createDriver(page)
    const mainId = await createJob(page, { driverId, jobNumber: 'E2E-TOW-MAIN2' })
    const towing1 = await createJob(page, { driverId, jobNumber: 'E2E-TOW-A', jobType: 'towing' })
    const towing2 = await createJob(page, { driverId, jobNumber: 'E2E-TOW-B', jobType: 'towing' })

    expect((await page.request.post(`/api/jobs/${mainId}/towing-links`, {
      data: { sequence: 1, towingJobId: towing1 },
    })).ok()).toBeTruthy()

    // slot 1 ถูกใช้แล้ว
    const dup = await page.request.post(`/api/jobs/${mainId}/towing-links`, {
      data: { sequence: 1, towingJobId: towing2 },
    })
    expect(dup.status()).toBe(409)

    // มีแค่ slot 1 กับ 2
    const badSeq = await page.request.post(`/api/jobs/${mainId}/towing-links`, {
      data: { sequence: 3, towingJobId: towing2 },
    })
    expect(badSeq.status()).toBe(400)
  })

  // ─── การคำนวณอัตโนมัติ ──────────────────────────────────────────────────
  test('คำนวณค่าขนส่ง: ไม่มี rate → null, มี rate → ค่าฐาน, มี surcharge → บวกตามราคาน้ำมัน', async ({ page }) => {
    const { locationFactoryId: factoryLocationId, customerId } = await seedRefData(page, test.info().testId)

    // ยังไม่มี rate
    const noRate = await page.request.post('/api/jobs/calculate/income', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId, customerId },
    })
    expect(noRate.ok()).toBeTruthy()
    expect((await noRate.json()).income).toBeNull()

    // มี rate ฐาน 8000 (ยังไม่มี surcharge → ไม่สนราคาน้ำมัน)
    const rateRes = await page.request.post('/api/rates/income', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId, customerId, income: 8000 },
    })
    expect(rateRes.ok()).toBeTruthy()

    const base = await page.request.post('/api/jobs/calculate/income', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId, customerId, jobDate: JOB_DAY.format('YYYY-MM-DD') },
    })
    expect((await base.json()).income).toBe(8000)
  })

  test('คำนวณค่าขนส่ง: surcharge เลือกช่วงตามราคาน้ำมัน ณ วันที่งาน', async ({ page }) => {
    const { locationFactoryId: factoryLocationId, customerId } = await seedRefData(page, test.info().testId)
    await page.request.post('/api/rates/income', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId, customerId, income: 10000 },
    })

    // import ช่วงราคาจาก template: 30.00-34.99 → 10000, 35.00-39.99 → 10500
    const template = await page.request.get('/api/rates/income/fuel-table/export?template=1')
    expect(template.ok()).toBeTruthy()
    const importRes = await page.request.post('/api/rates/income/fuel-table/import', {
      multipart: {
        customerId,
        factoryLocationId,
        file: {
          name: 'fuel.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: await template.body(),
        },
      },
    })
    expect(importRes.ok()).toBeTruthy()

    // ราคาน้ำมัน 36.00 (effectiveDate 2099 = sentinel ที่ cleanup-settings เก็บกวาด)
    const fuelRes = await page.request.post('/api/fuel-price-log', {
      data: { effectiveDate: '2099-01-01', pricePerLiter: 36 },
    })
    expect(fuelRes.ok()).toBeTruthy()

    // งานวันที่ 2099-06-01 → ใช้ราคา 36.00 → ตกช่วง 35.00-39.99 → 10500
    const calc = await page.request.post('/api/jobs/calculate/income', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId, customerId, jobDate: '2099-06-01' },
    })
    const result = (await calc.json()) as { income: number; fuelPrice: number }
    expect(result.fuelPrice).toBe(36)
    expect(result.income).toBe(10500)
  })

  test('คำนวณค่าเที่ยวคนขับ: ตาม rate และคืน null เมื่อไม่มี rate', async ({ page }) => {
    const { locationFactoryId: factoryLocationId } = await seedRefData(page, test.info().testId)

    const noRate = await page.request.post('/api/jobs/calculate/driver-wage', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId },
    })
    expect((await noRate.json()).driverWage).toBeNull()

    const created = await page.request.post('/api/rates/driver-wage', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId, driverWage: 1500 },
    })
    expect(created.ok()).toBeTruthy()

    const withRate = await page.request.post('/api/jobs/calculate/driver-wage', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId },
    })
    expect(Number((await withRate.json()).driverWage)).toBe(1500)
  })

  test('คำนวณคาดการณ์ค่ารับ/คืนตู้: ดึงจาก rate ของแต่ละสถานที่', async ({ page }) => {
    const { locationGeneralId } = await seedRefData(page, test.info().testId)

    const created = await page.request.post('/api/rates/transfer', {
      data: { jobType: 'inbound', size: '20DC', locationId: locationGeneralId, pickupFee: 300, returnFee: 250 },
    })
    expect(created.ok()).toBeTruthy()

    // ใช้สถานที่เดียวกันทั้งรับและคืน → ได้ทั้งสองค่า
    const calc = await page.request.post('/api/jobs/calculate/estimated-transfer', {
      data: {
        jobType: 'inbound',
        size: '20DC',
        pickupLocationId: locationGeneralId,
        returnLocationId: locationGeneralId,
      },
    })
    const result = (await calc.json()) as { pickupFee: number; returnFee: number }
    expect(result.pickupFee).toBe(300)
    expect(result.returnFee).toBe(250)

    // ไม่ส่งสถานที่เลย → null ทั้งคู่
    const empty = await page.request.post('/api/jobs/calculate/estimated-transfer', {
      data: { jobType: 'inbound', size: '20DC' },
    })
    expect(await empty.json()).toEqual({ pickupFee: null, returnFee: null })
  })

  // ─── เบิกล่วงหน้า ───────────────────────────────────────────────────────
  test('เบิกล่วงหน้า: gen เลขที่อัตโนมัติ และสร้างงานได้โดยไม่ต้องมีลูกค้า', async ({ page }) => {
    const driverId = await createDriver(page)

    const numRes = await page.request.get('/api/jobs/advance-number')
    expect(numRes.ok()).toBeTruthy()
    expect(((await numRes.json()) as { jobNumber: string }).jobNumber).toMatch(/^ADV-\d{6}-\d{6}$/)

    // ไม่มีงาน → prefix NJB
    const njbRes = await page.request.get('/api/jobs/advance-number?jobType=noJob')
    expect(((await njbRes.json()) as { jobNumber: string }).jobNumber).toMatch(/^NJB-/)

    const jobId = await createJob(page, { driverId, jobType: 'advance', advance: 1000 })
    const job = await getJob(page, jobId)
    expect(job.jobType).toBe('advance')
    expect(Number(job.advance)).toBe(1000)
  })

  // ─── Export Excel ───────────────────────────────────────────────────────
  test('Export Excel: ดาวน์โหลดได้และเป็นไฟล์ xlsx ที่มีข้อมูลงาน', async ({ page }) => {
    const driverId = await createDriver(page)
    await createJob(page, { driverId, jobNumber: 'E2E-EXPORT-001', liftFee: 400 })

    const res = await page.request.get(
      `/api/jobs/export?month=${CURRENT_MONTH}&driverId=${driverId}&driverName=${encodeURIComponent(DRIVER_NAME)}`,
    )
    expect(res.ok()).toBeTruthy()
    expect(res.headers()['content-type']).toContain('spreadsheetml.sheet')

    const body = await res.body()
    // xlsx = zip → ขึ้นต้นด้วย "PK"
    expect(body.subarray(0, 2).toString()).toBe('PK')
    expect(body.length).toBeGreaterThan(1000)
  })
})
