import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// ชื่อเฉพาะของ spec นี้ — spec อื่นใช้ "Test Driver Playwright" / "Entry Test Driver" / "Summary Driver *"
const DRIVER_NAME = 'Pairing Test Driver'
const VEHICLE_NUMBER = 'BKK-PAIR'

const JOB_DAY = dayjs().startOf('month')
const CURRENT_MONTH = dayjs().format('YYYY-MM')

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs/, { timeout: 15_000 })
}

function cleanupPairing() {
  execSync('npx tsx e2e/scripts/cleanup-pairing.ts', {
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
  if (!res.ok()) throw new Error(`createDriver failed — ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

/** สร้างงานผ่าน API — คืน id (default = ขาเข้า 20DC วันที่ต้นเดือน) */
async function createJob(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/jobs', {
    data: {
      jobDate: JOB_DAY.format('YYYY-MM-DD'),
      jobType: 'inbound',
      size: '20DC',
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
    jobNumber: string
    income: string | number | null
    driverWage: string | number | null
    clearStatus: boolean
    createdAt: string
  }
}

/** location + customer สำหรับผูก rate (ชื่อขึ้นต้น E2E_TEST_ เพื่อให้ cleanup-settings เก็บกวาด) */
async function seedRefData(page: Page, suffix: string) {
  const [locFactory, customer] = await Promise.all([
    page.request.post('/api/locations', {
      data: { name: `E2E_TEST_LOC_FACTORY_${suffix}`, type: 'factory' },
    }),
    page.request.post('/api/customers', { data: { name: `E2E_TEST_CUST_${suffix}` } }),
  ])
  for (const r of [locFactory, customer]) {
    if (!r.ok()) throw new Error(`seedRefData failed — ${await r.text()}`)
  }
  return {
    factoryLocationId: ((await locFactory.json()) as { id: string }).id,
    customerId: ((await customer.json()) as { id: string }).id,
  }
}

/** โรงงานเพิ่มอีกแห่ง — ใช้เทสต์เคส "คนละโรงงาน" */
async function createFactory(page: Page, suffix: string) {
  const res = await page.request.post('/api/locations', {
    data: { name: `E2E_TEST_LOC_FACTORY_${suffix}`, type: 'factory' },
  })
  if (!res.ok()) throw new Error(`createFactory failed — ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

/**
 * จับคู่สองใบผ่าน API แล้วคืนว่าใบไหนเป็น primary/secondary
 * (primary = ใบที่ createdAt ใหม่กว่า — API เป็นคนตัดสิน ไม่ใช่ลำดับที่เราส่ง)
 */
async function pairViaApi(page: Page, jobId: string, otherJobId: string) {
  const res = await page.request.post(`/api/jobs/${jobId}/pair-link`, {
    data: { otherJobId },
  })
  if (!res.ok()) throw new Error(`pair failed — ${await res.text()}`)
  return (await res.json()) as {
    id: string
    primaryJobId: string
    secondaryJobId: string
    primaryJobNumber: string
    secondaryJobNumber: string
  }
}

const num = (v: string | number | null) => (v == null ? null : Number(v))

/**
 * ยืนยันว่า laterId ถูกสร้างทีหลัง earlierId จริง
 * เกณฑ์ "ใบที่ถือยอด" คือ createdAt ไม่ใช่เลข JOB หรือวันที่งาน — ถ้าสองใบ createdAt
 * ชนกันพอดี (ความละเอียดระดับ ms) test ที่ตามมาจะกลายเป็นคาดเดา จึงล็อกไว้ตรงนี้
 */
async function expectCreatedLater(page: Page, laterId: string, earlierId: string) {
  const [later, earlier] = await Promise.all([getJob(page, laterId), getJob(page, earlierId)])
  expect(
    new Date(later.createdAt).getTime(),
    'ใบที่สร้างทีหลังต้องมี createdAt ใหม่กว่า'
  ).toBeGreaterThan(new Date(earlier.createdAt).getTime())
}

/** แถวของงานใบหนึ่งในตาราง — หาได้จากปุ่มจับคู่/ปลดคู่ที่มี id กำกับไม่ได้เสมอ จึงล็อกด้วยเลข JOB */
function jobRow(page: Page, jobNumber: string) {
  return page.getByRole('row').filter({ hasText: jobNumber })
}

// serial: ทุกเคสใช้ driver ชื่อเดียวกัน — ต้องรันทีละตัวกัน unique-constraint ชน
test.describe.serial('จับคู่งาน', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test.afterEach(() => {
    cleanupPairing()
    cleanupSettings()
  })

  // ─── 1. จับคู่ผ่าน UI ────────────────────────────────────────────────────
  test('จับคู่งาน 20DC สองใบ → ยอดใบเก่าถูกล้าง ใบใหม่ถือยอด', async ({ page }) => {
    const driverId = await createDriver(page)
    const { factoryLocationId, customerId } = await seedRefData(page, 'PAIR1')

    // สองใบ ขาเข้า 20DC วันเดียวกัน คนขับ/โรงงาน/ลูกค้าเดียวกัน — กรอกยอดทั้งคู่
    const firstId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-A1', factoryLocationId, customerId, income: 8000,
    })
    expect((await page.request.patch(`/api/jobs/${firstId}`, { data: { driverWage: 1500 } })).ok()).toBeTruthy()

    const secondId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-A2', factoryLocationId, customerId, income: 8100,
    })
    expect((await page.request.patch(`/api/jobs/${secondId}`, { data: { driverWage: 1600 } })).ok()).toBeTruthy()

    // ยืนยันสถานะก่อนจับคู่ — ทั้งคู่มียอดจริง และ A2 คือใบที่สร้างทีหลัง
    expect(num((await getJob(page, firstId)).income)).toBe(8000)
    expect(num((await getJob(page, secondId)).income)).toBe(8100)
    await expectCreatedLater(page, secondId, firstId)

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)

    // เปิด modal จากใบแรก แล้วเลือกใบที่สอง
    await expect(page.getByTestId(`job-pair-btn-${firstId}`)).toBeVisible({ timeout: 15_000 })
    await page.getByTestId(`job-pair-btn-${firstId}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('pair-candidate-E2E-PAIR-A2')).toBeVisible({ timeout: 10_000 })
    await dialog.getByTestId('pair-candidate-E2E-PAIR-A2').click()

    // สรุปผลลัพธ์ต้องชี้ว่าใบที่สร้างทีหลัง (E2E-PAIR-A2) เป็นคนถือยอด และใช้อัตราคู่
    // (จับที่ div ชั้นในตรงๆ — getByText กับข้อความที่ซ้อนใน wrapper เดียวกันเสี่ยง strict-mode)
    await expect(
      dialog.locator('div').filter({ hasText: /^ใบที่จะถือยอด → E2E-PAIR-A2 \(สร้างทีหลัง\)$/ })
    ).toHaveCount(1)
    await expect(
      dialog.locator('div').filter({ hasText: /^อัตราที่จะใช้ → 2x20DC$/ })
    ).toHaveCount(1)
    await page.getByTestId('pair-confirm-btn').click()
    await expect(dialog).not.toBeVisible({ timeout: 15_000 })

    // ── พิสูจน์พฤติกรรมจริงที่ DB: ใบที่สร้างทีหลังเป็น primary และยอดถูกล้างทั้งคู่
    const first = await getJob(page, firstId)
    const second = await getJob(page, secondId)
    expect(first.income).toBeNull()
    expect(first.driverWage).toBeNull()
    expect(second.income).toBeNull()
    expect(second.driverWage).toBeNull()

    const list = (await (await page.request.get(`/api/jobs?month=${CURRENT_MONTH}&driverId=${driverId}`)).json()) as {
      id: string
      jobNumber: string
      pairLinkAsPrimary?: { id: string } | null
      pairLinkAsSecondary?: { id: string } | null
    }[]
    const firstRow = list.find((j) => j.id === firstId)!
    const secondRow = list.find((j) => j.id === secondId)!
    // ใบที่สร้างทีหลัง (secondId) ต้องเป็นคนถือยอด
    expect(secondRow.pairLinkAsPrimary).toBeTruthy()
    expect(secondRow.pairLinkAsSecondary).toBeFalsy()
    expect(firstRow.pairLinkAsSecondary).toBeTruthy()
    expect(firstRow.pairLinkAsPrimary).toBeFalsy()

    // ── Tag ในตาราง: primary = "2x20DC" (สีฟ้า), secondary = "จับคู่"
    await expect(
      jobRow(page, 'E2E-PAIR-A2').locator('.ant-tag', { hasText: '2x20DC' })
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      jobRow(page, 'E2E-PAIR-A1').locator('.ant-tag').filter({ hasText: /^จับคู่$/ })
    ).toBeVisible()
    // ทั้งสองแถวถูกทำเครื่องหมายว่าเป็นคู่
    await expect(page.locator('tr.paired-row')).toHaveCount(2)
  })

  // ─── 2. ปลดคู่ ───────────────────────────────────────────────────────────
  test('ปลดคู่ → Tag หายและแถวกลับเป็นปกติ', async ({ page }) => {
    const driverId = await createDriver(page)
    const { factoryLocationId, customerId } = await seedRefData(page, 'PAIR2')

    const firstId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-B1', factoryLocationId, customerId, income: 8000,
    })
    const secondId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-B2', factoryLocationId, customerId, income: 8000,
    })
    const link = await pairViaApi(page, firstId, secondId)
    expect(link.primaryJobNumber).toBe('E2E-PAIR-B2')

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)
    await expect(page.locator('tr.paired-row')).toHaveCount(2, { timeout: 15_000 })

    // ปลดคู่จากใบ primary → modal.confirm ปุ่ม "ปลดคู่"
    await page.getByTestId(`job-unpair-btn-${link.primaryJobId}`).click()
    // modal.confirm ของ antd — ล็อกด้วย .ant-modal-confirm กันชนกับ PairJobModal
    // ที่ antd render root div ค้างไว้ (display:none) แม้ open={false}
    const confirm = page.getByRole('dialog').filter({ has: page.locator('.ant-modal-confirm-title') })
    await expect(confirm).toBeVisible()
    await expect(confirm.locator('.ant-modal-confirm-title')).toHaveText(
      'ปลดคู่ E2E-PAIR-B2 + E2E-PAIR-B1?'
    )
    await confirm.getByRole('button', { name: 'ปลดคู่' }).click()

    // Tag หาย + แถวไม่ใช่ paired-row อีกต่อไป
    await expect(page.locator('tr.paired-row')).toHaveCount(0, { timeout: 15_000 })
    await expect(jobRow(page, 'E2E-PAIR-B2').locator('.ant-tag')).toHaveCount(0)
    await expect(jobRow(page, 'E2E-PAIR-B1').locator('.ant-tag')).toHaveCount(0)

    // ปุ่มจับคู่กลับมาให้ใช้ทั้งสองใบ (= แถวกลับมาแก้/จับคู่ใหม่ได้)
    await expect(page.getByTestId(`job-pair-btn-${firstId}`)).toBeVisible()
    await expect(page.getByTestId(`job-pair-btn-${secondId}`)).toBeVisible()

    // ปลดคู่ไม่คืนยอด — ทั้งคู่ยังว่างตามสเปก
    expect((await getJob(page, firstId)).income).toBeNull()
    expect((await getJob(page, secondId)).income).toBeNull()

    // link ถูกลบจริง
    const list = (await (await page.request.get(`/api/jobs?month=${CURRENT_MONTH}&driverId=${driverId}`)).json()) as {
      id: string
      pairLinkAsPrimary?: { id: string } | null
      pairLinkAsSecondary?: { id: string } | null
    }[]
    for (const id of [firstId, secondId]) {
      const row = list.find((j) => j.id === id)!
      expect(row.pairLinkAsPrimary).toBeFalsy()
      expect(row.pairLinkAsSecondary).toBeFalsy()
    }
  })

  // ─── 3. คนละโรงงาน ──────────────────────────────────────────────────────
  test('งานคนละโรงงานไม่ขึ้นเป็น candidate', async ({ page }) => {
    const driverId = await createDriver(page)
    const { factoryLocationId, customerId } = await seedRefData(page, 'PAIR3')
    const otherFactoryId = await createFactory(page, 'PAIR3_OTHER')

    const firstId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-C1', factoryLocationId, customerId,
    })
    await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-C2', factoryLocationId: otherFactoryId, customerId,
    })

    // API ต้องไม่คืน candidate เลย
    const candidates = (await (
      await page.request.get(`/api/jobs/${firstId}/pair-candidates`)
    ).json()) as { jobs: unknown[] }
    expect(candidates.jobs).toHaveLength(0)

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)
    await expect(page.getByTestId(`job-pair-btn-${firstId}`)).toBeVisible({ timeout: 15_000 })
    await page.getByTestId(`job-pair-btn-${firstId}`).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.ant-empty-description')).toHaveText('ไม่มีงานที่จับคู่ได้', {
      timeout: 10_000,
    })
    // ใบที่โรงงานต่างกันต้องไม่โผล่เป็นตัวเลือก
    await expect(dialog.getByTestId('pair-candidate-E2E-PAIR-C2')).toHaveCount(0)
  })

  // ─── 4. คนละวัน ─────────────────────────────────────────────────────────
  test('งานคนละวันไม่ขึ้นเป็น candidate', async ({ page }) => {
    const driverId = await createDriver(page)
    const { factoryLocationId, customerId } = await seedRefData(page, 'PAIR4')

    const firstId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-D1', factoryLocationId, customerId,
    })
    await createJob(page, {
      driverId,
      jobNumber: 'E2E-PAIR-D2',
      factoryLocationId,
      customerId,
      jobDate: JOB_DAY.add(1, 'day').format('YYYY-MM-DD'),
    })

    const candidates = (await (
      await page.request.get(`/api/jobs/${firstId}/pair-candidates`)
    ).json()) as { jobs: unknown[] }
    expect(candidates.jobs).toHaveLength(0)

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)
    await expect(page.getByTestId(`job-pair-btn-${firstId}`)).toBeVisible({ timeout: 15_000 })
    await page.getByTestId(`job-pair-btn-${firstId}`).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.ant-empty-description')).toHaveText('ไม่มีงานที่จับคู่ได้', {
      timeout: 10_000,
    })
    await expect(dialog.getByTestId('pair-candidate-E2E-PAIR-D2')).toHaveCount(0)
  })

  // ─── 5. 40DC ────────────────────────────────────────────────────────────
  test('งาน 40DC ไม่มีปุ่มจับคู่', async ({ page }) => {
    const driverId = await createDriver(page)
    const { factoryLocationId, customerId } = await seedRefData(page, 'PAIR5')

    const bigId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-E40', size: '40DC', factoryLocationId, customerId,
    })
    // ใบ 20DC ในวันเดียวกัน — พิสูจน์ว่าปุ่มขึ้นจริงเมื่อ size จับคู่ได้ (control)
    const smallId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-E20', size: '20DC', factoryLocationId, customerId,
    })

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)

    // ใบ 20DC มีปุ่ม (control) — ใบ 40DC ต้องไม่มีเลย
    await expect(page.getByTestId(`job-pair-btn-${smallId}`)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`job-pair-btn-${bigId}`)).toHaveCount(0)
  })

  // ─── 6. งานที่เคลียร์แล้ว ────────────────────────────────────────────────
  test('งานที่เคลียร์แล้วไม่มีปุ่มจับคู่', async ({ page }) => {
    const driverId = await createDriver(page)
    const { factoryLocationId, customerId } = await seedRefData(page, 'PAIR6')

    // ไม่มีค่าใช้จ่าย → ส่วนต่าง 0 → เคลียร์ได้
    const clearedId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-F1', factoryLocationId, customerId,
    })
    const openId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-F2', factoryLocationId, customerId,
    })
    const cleared = await page.request.patch(`/api/jobs/${clearedId}/clear`)
    expect(cleared.ok()).toBeTruthy()
    expect((await cleared.json()).clearStatus).toBe(true)

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)

    // ใบที่ยังไม่เคลียร์มีปุ่ม (control) — ใบที่เคลียร์แล้วไม่มี
    await expect(page.getByTestId(`job-pair-btn-${openId}`)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`job-pair-btn-${clearedId}`)).toHaveCount(0)

    // ใบที่เคลียร์แล้วก็ต้องไม่โผล่เป็น candidate ของใบที่ยังเปิดอยู่
    const candidates = (await (
      await page.request.get(`/api/jobs/${openId}/pair-candidates`)
    ).json()) as { jobs: unknown[] }
    expect(candidates.jobs).toHaveLength(0)
  })

  // ─── 7. ดึงข้อมูลสองครั้ง ────────────────────────────────────────────────
  test('ดึงข้อมูลไม่เติมยอดกลับให้ใบที่ถูกล้าง', async ({ page }) => {
    const driverId = await createDriver(page)
    const { factoryLocationId, customerId } = await seedRefData(page, 'PAIR7')

    // อัตราตู้เดี่ยว และอัตราคู่ — ต้องต่างกันชัดเจนเพื่อพิสูจน์ว่าใช้ตัวไหน
    for (const rate of [
      { size: '20DC', income: 8000, driverWage: 1500 },
      { size: '2x20DC', income: 12000, driverWage: 2200 },
    ]) {
      const inc = await page.request.post('/api/rates/income', {
        data: { jobType: 'inbound', size: rate.size, factoryLocationId, customerId, income: rate.income },
      })
      expect(inc.ok()).toBeTruthy()
      const wage = await page.request.post('/api/rates/driver-wage', {
        data: { jobType: 'inbound', size: rate.size, factoryLocationId, driverWage: rate.driverWage },
      })
      expect(wage.ok()).toBeTruthy()
    }

    const firstId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-G1', factoryLocationId, customerId,
    })
    const secondId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-G2', factoryLocationId, customerId,
    })
    const link = await pairViaApi(page, firstId, secondId)
    expect(link.primaryJobId).toBe(secondId)
    expect(link.secondaryJobId).toBe(firstId)

    // กด "ดึงข้อมูล" บนหน้า /jobs (ปุ่มทำทั้งเดือนที่เลือกอยู่)
    await page.goto(`/jobs?month=${CURRENT_MONTH}`)
    const prefillBtn = page.getByTestId('jobs-prefill-rates-btn')
    await expect(prefillBtn).toBeVisible({ timeout: 15_000 })

    for (const round of [1, 2]) {
      // รอ response จริงของ prefill — antd button ตอน loading ไม่ได้ disabled จึงรอด้วย class ไม่ได้
      const [prefillRes] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/api/jobs/prefill-rates') && r.request().method() === 'POST',
          { timeout: 30_000 }
        ),
        prefillBtn.click(),
      ])
      expect(prefillRes.ok(), `รอบที่ ${round}: prefill ต้องสำเร็จ`).toBeTruthy()

      const primary = await getJob(page, secondId)
      const secondary = await getJob(page, firstId)

      // primary ได้อัตราคู่ (2x20DC) ไม่ใช่อัตราตู้เดี่ยว
      expect(num(primary.income), `รอบที่ ${round}: primary income`).toBe(12000)
      expect(num(primary.driverWage), `รอบที่ ${round}: primary driverWage`).toBe(2200)
      // secondary ยังว่างเสมอ — ห้ามเติมกลับ
      expect(secondary.income, `รอบที่ ${round}: secondary income`).toBeNull()
      expect(secondary.driverWage, `รอบที่ ${round}: secondary driverWage`).toBeNull()
    }
  })

  // ─── 8. หน้าสรุปนับเที่ยว ────────────────────────────────────────────────
  test('หน้าสรุปนับเที่ยวลดลง 1 หลังจับคู่', async ({ page }) => {
    const driverId = await createDriver(page)
    const { factoryLocationId, customerId } = await seedRefData(page, 'PAIR8')

    const firstId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-H1', factoryLocationId, customerId,
    })
    const secondId = await createJob(page, {
      driverId, jobNumber: 'E2E-PAIR-H2', factoryLocationId, customerId,
    })

    const readTrips = async () => {
      const res = await page.request.get(`/api/summary?month=${CURRENT_MONTH}`)
      expect(res.ok()).toBeTruthy()
      const rows = (await res.json()) as { driverId: string; jobTrips: number }[]
      const row = rows.find((r) => r.driverId === driverId)
      expect(row, 'ต้องเจอคนขับทดสอบในสรุปรายเดือน').toBeTruthy()
      return row!.jobTrips
    }

    const before = await readTrips()
    expect(before).toBe(2)

    await pairViaApi(page, firstId, secondId)

    // วิ่งครั้งเดียว = 1 เที่ยว — ใบ secondary ไม่ถูกนับ
    const after = await readTrips()
    expect(after).toBe(before - 1)
    expect(after).toBe(1)
  })
})
