import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// ชื่อเฉพาะของ spec นี้ — spec อื่นใช้ "Pairing Test Driver" / "Test Driver Playwright" /
// "Entry Test Driver" / "Summary Driver *" (ต้องรัน --workers=1 อยู่แล้ว)
const DRIVER_NAME = 'TowingAbsorb Test Driver'
const VEHICLE_NUMBER = 'BKK-TABS'

/**
 * ชื่อสถานที่รับตู้ที่ทำให้งานหลักดูดซับทอยตู้ได้
 * คัดลอกมาจาก ABSORB_PICKUP_NAMES ใน lib/utils/towingAbsorb.ts ตรงๆ —
 * ถ้าพิมพ์ใหม่แล้วไบต์ไม่ตรง จะไม่ match อะไรเลยและ test จะ fail แบบเงียบๆ
 */
const ABSORB_PICKUP_NAME = 'คาหาง'

const JOB_DAY = dayjs().startOf('month')
const CURRENT_MONTH = dayjs().format('YYYY-MM')

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs/, { timeout: 15_000 })
}

function cleanupTowingAbsorb() {
  execSync('npx tsx e2e/scripts/cleanup-towing-absorb.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

async function createDriver(page: Page) {
  const res = await page.request.post('/api/drivers', {
    data: { name: DRIVER_NAME, vehicleNumber: VEHICLE_NUMBER },
  })
  if (!res.ok()) throw new Error(`createDriver failed — ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

async function createCustomer(page: Page, suffix: string) {
  const res = await page.request.post('/api/customers', {
    data: { name: `E2E_TEST_CUST_${suffix}` },
  })
  if (!res.ok()) throw new Error(`createCustomer failed — ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

/**
 * สถานที่ทั่วไป — E2E DB เป็น container เปล่า ไม่มีข้อมูล production
 * "คาหาง" ต้องสร้างเองทุกครั้ง แต่ชื่อสถานที่เป็น unique ใน schema จึงสร้างซ้ำไม่ได้
 * ถ้าค้างจากรอบก่อน (cleanup พลาด/test ล้มกลางคัน) ให้ดึงตัวเดิมมาใช้แทนการล้ม
 */
async function ensureLocation(page: Page, name: string) {
  const res = await page.request.post('/api/locations', { data: { name, type: 'general' } })
  if (res.ok()) return ((await res.json()) as { id: string }).id

  const listRes = await page.request.get('/api/locations?type=general')
  if (!listRes.ok()) throw new Error(`ensureLocation failed — ${await listRes.text()}`)
  const existing = ((await listRes.json()) as { id: string; name: string }[]).find(
    (l) => l.name === name
  )
  if (!existing) throw new Error(`ensureLocation: สร้าง "${name}" ไม่ได้และหาของเดิมไม่เจอ`)
  return existing.id
}

/** สร้างงานผ่าน API — คืน id (default = วันที่ต้นเดือน, 20DC) */
async function createJob(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/jobs', {
    data: {
      jobDate: JOB_DAY.format('YYYY-MM-DD'),
      size: '20DC',
      ...data,
    },
  })
  if (!res.ok()) throw new Error(`createJob failed — ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

/**
 * ทอยตู้พร้อมค่าเที่ยว — POST /api/jobs ไม่รับ driverWage (ดู app/api/jobs/route.ts)
 * จึงต้อง PATCH ตามหลัง ค่าเที่ยวต้องมีจริงก่อน ไม่งั้นพิสูจน์ไม่ได้ว่า "ถูกล้าง"
 */
async function createTowingJob(page: Page, data: Record<string, unknown>, driverWage = 150) {
  const id = await createJob(page, { jobType: 'towing', ...data })
  const patched = await page.request.patch(`/api/jobs/${id}`, { data: { driverWage } })
  if (!patched.ok()) throw new Error(`ตั้งค่าเที่ยวทอยตู้ไม่ได้ — ${await patched.text()}`)
  return id
}

async function getJob(page: Page, jobId: string) {
  const res = await page.request.get(`/api/jobs/${jobId}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Record<string, unknown> & {
    jobNumber: string
    driverWage: string | number | null
    isTowingAbsorbed: boolean
    clearStatus: boolean
    createdAt: string
  }
}

const num = (v: string | number | null) => (v == null ? null : Number(v))

/**
 * ยืนยันว่าทอยตู้ถูกบันทึกก่อนงานหลักจริง
 * createdAt เป็นเงื่อนไขการดูดซับ (isAbsorbedBy: towing.createdAt >= main.createdAt → ไม่ดูด)
 * ถ้าสองใบ createdAt ชนกันพอดี test ที่ตามมาจะกลายเป็นคาดเดา จึงล็อกไว้ตรงนี้
 */
async function expectCreatedBefore(page: Page, earlierId: string, laterId: string) {
  const [earlier, later] = await Promise.all([getJob(page, earlierId), getJob(page, laterId)])
  expect(
    new Date(earlier.createdAt).getTime(),
    'ทอยตู้ต้องมี createdAt เก่ากว่างานหลัก'
  ).toBeLessThan(new Date(later.createdAt).getTime())
}

/** เที่ยวทอยของคนขับในเดือนนี้ ตามที่หน้าสรุปนับจริง */
async function readTowingTrips(page: Page, driverId: string) {
  const res = await page.request.get(`/api/summary?month=${CURRENT_MONTH}`)
  expect(res.ok()).toBeTruthy()
  const rows = (await res.json()) as { driverId: string; towingTrips: number }[]
  const row = rows.find((r) => r.driverId === driverId)
  expect(row, 'ต้องเจอคนขับทดสอบในสรุปรายเดือน').toBeTruthy()
  return row!.towingTrips
}

/**
 * กดปุ่ม "ดึงข้อมูล" บนหน้า /jobs แล้วรอ response จริงของ prefill
 * antd button ตอน loading ไม่ได้ disabled จึงรอด้วย class ไม่ได้
 */
async function clickPrefill(page: Page, label = '') {
  const prefillBtn = page.getByTestId('jobs-prefill-rates-btn')
  await expect(prefillBtn).toBeVisible({ timeout: 15_000 })
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/jobs/prefill-rates') && r.request().method() === 'POST',
      { timeout: 30_000 }
    ),
    prefillBtn.click(),
  ])
  expect(res.ok(), `prefill ต้องสำเร็จ${label ? ` (${label})` : ''}`).toBeTruthy()
  return res
}

/**
 * ชุดข้อมูลมาตรฐาน: ทอยตู้ (มีค่าเที่ยว) ถูกสร้าง "ก่อน" งานหลักเสมอ
 * ลำดับนี้สำคัญ — สลับเมื่อไหร่การดูดซับจะไม่เกิดและ test จะ fail ด้วยเหตุผลผิด
 */
async function seedAbsorbPair(
  page: Page,
  suffix: string,
  opts: {
    towingOverrides?: Record<string, unknown>
    mainOverrides?: Record<string, unknown>
  } = {}
) {
  const driverId = await createDriver(page)
  const customerId = await createCustomer(page, suffix)
  const pickupLocationId = await ensureLocation(page, ABSORB_PICKUP_NAME)

  const towingId = await createTowingJob(page, {
    driverId,
    customerId,
    jobNumber: `E2E-TABS-${suffix}-T`,
    ...opts.towingOverrides,
  })
  const mainId = await createJob(page, {
    driverId,
    customerId,
    jobType: 'outbound',
    pickupLocationId,
    jobNumber: `E2E-TABS-${suffix}-M`,
    ...opts.mainOverrides,
  })
  await expectCreatedBefore(page, towingId, mainId)

  return { driverId, customerId, pickupLocationId, towingId, mainId }
}

// serial: ทุกเคสใช้คนขับชื่อเดียวกันและสถานที่ "คาหาง" ชื่อเดียวกัน (unique constraint ทั้งคู่)
// ต้องรันทีละตัวโดยมี cleanup คั่น
test.describe.serial('ดูดซับทอยตู้', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test.afterEach(() => {
    cleanupTowingAbsorb()
  })

  // ─── 1. ดูดซับสำเร็จ ─────────────────────────────────────────────────────
  test('กดดึงข้อมูล → ทอยตู้ที่เข้าเกณฑ์ถูกล้างค่าเที่ยว และหน้าสรุปไม่นับ', async ({ page }) => {
    const { driverId, towingId } = await seedAbsorbPair(page, 'A')

    // ก่อนดูดซับ: ค่าเที่ยวมีจริง ธงยังไม่ติด และหน้าสรุปนับเป็น 1 เที่ยว
    const before = await getJob(page, towingId)
    expect(num(before.driverWage), 'ก่อนดูดซับ ทอยตู้ต้องมีค่าเที่ยว').toBe(150)
    expect(before.isTowingAbsorbed).toBe(false)
    expect(await readTowingTrips(page, driverId)).toBe(1)

    await page.goto(`/jobs?month=${CURRENT_MONTH}`)
    await clickPrefill(page)

    // หลังดูดซับ: ค่าเที่ยวถูกล้าง ธงติด และหน้าสรุปไม่นับเที่ยวนี้อีก
    const after = await getJob(page, towingId)
    expect(after.driverWage, 'ทอยตู้ที่ถูกดูดซับ ค่าเที่ยวต้องเป็น null').toBeNull()
    expect(after.isTowingAbsorbed).toBe(true)
    expect(await readTowingTrips(page, driverId)).toBe(0)
  })

  // ─── 2. ดึงข้อมูลซ้ำ ──────────────────────────────────────────────────────
  test('กดดึงข้อมูลซ้ำ → ค่าเที่ยวทอยตู้ยังว่าง ไม่ถูกเติมกลับ', async ({ page }) => {
    const { driverId, towingId, pickupLocationId } = await seedAbsorbPair(page, 'B')

    // ต้องมีอัตราค่าเที่ยวทอยตู้อยู่จริง ไม่งั้นรอบที่ 2 จะผ่านเพราะ "ไม่มีอะไรให้เติม"
    // ไม่ใช่เพราะกันเติมสำเร็จ — หลังรอบแรก driverWage เป็น null แล้ว ถ้าไม่มีตัวกัน
    // (isTowingAbsorbed: false ใน where ของ prefill) อัตรานี้จะถูกเติมกลับทันที
    // ทอยตู้ไม่ผูกโรงงาน อัตราจึงใช้ factoryLocationId: null
    const rate = await page.request.post('/api/rates/driver-wage', {
      data: { jobType: 'towing', size: '20DC', factoryLocationId: null, driverWage: 180 },
    })
    expect(rate.ok(), `ตั้งอัตราค่าเที่ยวทอยตู้ไม่ได้ — ${await rate.text()}`).toBeTruthy()

    await page.goto(`/jobs?month=${CURRENT_MONTH}`)

    for (const round of [1, 2]) {
      await clickPrefill(page, `รอบที่ ${round}`)
      const towing = await getJob(page, towingId)
      expect(towing.driverWage, `รอบที่ ${round}: ค่าเที่ยวทอยตู้ต้องยังว่าง`).toBeNull()
      expect(towing.isTowingAbsorbed, `รอบที่ ${round}: ธงต้องยังติดอยู่`).toBe(true)
      expect(await readTowingTrips(page, driverId), `รอบที่ ${round}: ไม่นับเป็นเที่ยว`).toBe(0)
    }

    // งานหลักยังรับตู้จากคาหางเหมือนเดิม — ไม่มีอะไรทำให้ธงหลุดระหว่างสองรอบ
    expect(pickupLocationId).toBeTruthy()
  })

  // ─── 3. คนละลูกค้า ────────────────────────────────────────────────────────
  test('ทอยตู้คนละลูกค้าไม่ถูกดูดซับ', async ({ page }) => {
    const driverId = await createDriver(page)
    const mainCustomerId = await createCustomer(page, 'C_MAIN')
    const otherCustomerId = await createCustomer(page, 'C_OTHER')
    const pickupLocationId = await ensureLocation(page, ABSORB_PICKUP_NAME)

    // ทอยตู้ลูกค้า C_OTHER — ทุกเงื่อนไขอื่นตรงหมด ต่างแค่ลูกค้า
    const towingId = await createTowingJob(page, {
      driverId,
      customerId: otherCustomerId,
      jobNumber: 'E2E-TABS-C-T',
    })
    const mainId = await createJob(page, {
      driverId,
      customerId: mainCustomerId,
      jobType: 'outbound',
      pickupLocationId,
      jobNumber: 'E2E-TABS-C-M',
    })
    await expectCreatedBefore(page, towingId, mainId)

    await page.goto(`/jobs?month=${CURRENT_MONTH}`)
    await clickPrefill(page)

    const towing = await getJob(page, towingId)
    expect(towing.isTowingAbsorbed, 'คนละลูกค้าต้องไม่ถูกดูดซับ').toBe(false)
    expect(num(towing.driverWage), 'ค่าเที่ยวต้องยังอยู่').toBe(150)
    expect(await readTowingTrips(page, driverId), 'ยังนับเป็นเที่ยว').toBe(1)
  })

  // ─── 4. ทอยตู้สร้างทีหลังงานหลัก ─────────────────────────────────────────
  test('ทอยตู้ที่สร้างหลังงานหลักไม่ถูกดูดซับ', async ({ page }) => {
    const driverId = await createDriver(page)
    const customerId = await createCustomer(page, 'D')
    const pickupLocationId = await ensureLocation(page, ABSORB_PICKUP_NAME)

    // สลับลำดับโดยตั้งใจ — งานหลักก่อน ทอยตู้ทีหลัง
    const mainId = await createJob(page, {
      driverId,
      customerId,
      jobType: 'outbound',
      pickupLocationId,
      jobNumber: 'E2E-TABS-D-M',
    })
    const towingId = await createTowingJob(page, {
      driverId,
      customerId,
      jobNumber: 'E2E-TABS-D-T',
    })
    // ลำดับต้องกลับด้านจริง ไม่งั้นเทสต์นี้ไม่ได้พิสูจน์อะไร
    await expectCreatedBefore(page, mainId, towingId)

    await page.goto(`/jobs?month=${CURRENT_MONTH}`)
    await clickPrefill(page)

    const towing = await getJob(page, towingId)
    expect(towing.isTowingAbsorbed, 'ทอยตู้ที่สร้างทีหลังต้องไม่ถูกดูดซับ').toBe(false)
    expect(num(towing.driverWage), 'ค่าเที่ยวต้องยังอยู่').toBe(150)
    expect(await readTowingTrips(page, driverId), 'ยังนับเป็นเที่ยว').toBe(1)
  })

  // ─── 5. คนละ size ────────────────────────────────────────────────────────
  test('ทอยตู้คนละ size ไม่ถูกดูดซับ', async ({ page }) => {
    const { driverId, towingId } = await seedAbsorbPair(page, 'E', {
      towingOverrides: { size: '40DC' },
      mainOverrides: { size: '20DC' },
    })

    await page.goto(`/jobs?month=${CURRENT_MONTH}`)
    await clickPrefill(page)

    const towing = await getJob(page, towingId)
    expect(towing.size, 'ทอยตู้ต้องเป็น 40DC จริง').toBe('40DC')
    expect(towing.isTowingAbsorbed, 'คนละ size ต้องไม่ถูกดูดซับ').toBe(false)
    expect(num(towing.driverWage), 'ค่าเที่ยวต้องยังอยู่').toBe(150)
    expect(await readTowingTrips(page, driverId), 'ยังนับเป็นเที่ยว').toBe(1)
  })

  // ─── 6. ย้ายสถานที่รับตู้ออกจากคาหาง ─────────────────────────────────────
  test('เปลี่ยนสถานที่รับตู้ออกจากคาหาง → ทอยตู้กลับมานับเป็นเที่ยว', async ({ page }) => {
    const { driverId, towingId, mainId } = await seedAbsorbPair(page, 'F')

    await page.goto(`/jobs?month=${CURRENT_MONTH}`)
    await clickPrefill(page)
    expect((await getJob(page, towingId)).isTowingAbsorbed, 'ต้องดูดซับสำเร็จก่อน').toBe(true)
    expect(await readTowingTrips(page, driverId)).toBe(0)

    // ย้ายที่รับตู้ไปสถานที่อื่น — PATCH ต้อง recalc ให้เองโดยไม่ต้องกดดึงข้อมูลซ้ำ
    const otherLocationId = await ensureLocation(page, 'E2E_TEST_LOC_OTHER_F')
    const patched = await page.request.patch(`/api/jobs/${mainId}`, {
      data: { pickupLocationId: otherLocationId },
    })
    expect(patched.ok(), `ย้ายสถานที่รับตู้ไม่ได้ — ${await patched.text()}`).toBeTruthy()

    const towing = await getJob(page, towingId)
    expect(towing.isTowingAbsorbed, 'ธงต้องถูกปลด').toBe(false)
    // ปลดธงไม่คืนค่าเที่ยว — ยอดที่ถูกล้างไปแล้วไม่กลับมาเอง
    expect(towing.driverWage, 'ปลดธงไม่คืนค่าเที่ยว').toBeNull()
    expect(await readTowingTrips(page, driverId), 'กลับมานับเป็นเที่ยว').toBe(1)
  })

  // ─── 7. เปลี่ยน jobType ของงานหลัก ───────────────────────────────────────
  // เคสนี้เจอจาก review: เดิม recalc เก็บ scope ไม่ได้เลยเมื่อคนขับ/วันไม่เปลี่ยน
  // ทำให้ใบที่เพิ่ง "เลิกเป็นงานหลัก" ทิ้งธงค้างไว้โดยไม่มีใครมาปลด
  test('เปลี่ยน jobType งานหลักเป็นทอยตู้ → ทอยตู้เดิมถูกปลดธง', async ({ page }) => {
    const { driverId, towingId, mainId } = await seedAbsorbPair(page, 'G')

    await page.goto(`/jobs?month=${CURRENT_MONTH}`)
    await clickPrefill(page)
    expect((await getJob(page, towingId)).isTowingAbsorbed, 'ต้องดูดซับสำเร็จก่อน').toBe(true)
    expect(await readTowingTrips(page, driverId)).toBe(0)

    // เปลี่ยนเฉพาะ jobType — คนขับและวันที่เหมือนเดิมทุกอย่าง
    const before = await getJob(page, mainId)
    const patched = await page.request.patch(`/api/jobs/${mainId}`, {
      data: { jobType: 'towing' },
    })
    expect(patched.ok(), `เปลี่ยน jobType ไม่ได้ — ${await patched.text()}`).toBeTruthy()

    const after = await getJob(page, mainId)
    expect(after.jobType).toBe('towing')
    expect(after.driverId, 'คนขับต้องไม่เปลี่ยน').toBe(before.driverId)
    expect(after.jobDate, 'วันที่ต้องไม่เปลี่ยน').toBe(before.jobDate)

    // ใบที่เคยเป็นงานหลักไม่ใช่งานหลักอีกแล้ว → ทอยตู้ต้องถูกปลดธง
    const towing = await getJob(page, towingId)
    expect(towing.isTowingAbsorbed, 'ทอยตู้ต้องถูกปลดธงเมื่องานหลักเลิกเป็นงานหลัก').toBe(false)
    expect(towing.driverWage, 'ปลดธงไม่คืนค่าเที่ยว').toBeNull()

    // ทั้งสองใบเป็นทอยตู้แล้ว และไม่มีใบไหนติดธง → นับ 2 เที่ยว
    expect(await readTowingTrips(page, driverId), 'ทอยตู้สองใบกลับมานับครบ').toBe(2)
  })
})
