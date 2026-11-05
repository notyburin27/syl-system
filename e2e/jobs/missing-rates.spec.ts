import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import { Client } from 'pg'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// หน้างานที่ยังไม่มีค่าดูได้เฉพาะเดือนก่อนหน้า — seed ลงเดือนนั้น
const MONTH = dayjs().subtract(1, 'month')
const ROOT = path.resolve(__dirname, '../..')
const PAGE = '/jobs/settings/rates/missing'
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function run(script: string, env: Record<string, string> = {}) {
  execSync(`npx tsx ${script}`, { stdio: 'inherit', env: { ...process.env, ...env }, cwd: ROOT })
}
const seed = (env: Record<string, string> = {}) =>
  run('e2e/scripts/seed-missing-rates.ts', { MISSING_MONTH: MONTH.format('YYYY-MM'), ...env })
const cleanup = () => run('e2e/scripts/cleanup-missing-rates.ts')

/** query DB ตรงๆ — local docker ไม่ใช้ SSL */
async function sql<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL!
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
  const client = new Client({ connectionString, ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }) })
  await client.connect()
  try {
    return (await client.query(text, params)).rows as T[]
  } finally {
    await client.end()
  }
}

async function jobValues(jobNumber: string) {
  const [row] = await sql<{ income: string | null; driverWage: string | null }>(
    'SELECT income, "driverWage" FROM jobs WHERE "jobNumber" = $1',
    [jobNumber],
  )
  return { income: row.income === null ? null : Number(row.income), driverWage: row.driverWage === null ? null : Number(row.driverWage) }
}

async function login(page: Page, username = 'testadmin') {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL(/\/jobs|\/line-images/, { timeout: 20000 })
}

async function openPage(page: Page) {
  await page.goto(PAGE)
  await expect(page.getByTestId('missing-card-income')).toBeVisible({ timeout: 20000 })
}

const rowOf = (page: Page, text: string) => page.locator('tr.ant-table-row').filter({ hasText: text })

async function cardValue(page: Page, testId: string) {
  return Number(await page.getByTestId(testId).locator('.ant-statistic-content-value').innerText())
}

test.describe.serial('งานที่ยังไม่มีค่า', () => {
  test.beforeEach(() => {
    cleanup()
    seed()
  })
  test.afterEach(() => cleanup())

  test('Case 1: ตั้งค่าค่าขนส่งแบบช่วงเดี่ยวแล้วเติมงาน', async ({ page }) => {
    await login(page)

    // ADMIN เห็นเมนูในกลุ่มอัตรา
    await page.goto('/jobs/settings/rates/income')
    const nav = page.getByRole('navigation', { name: 'เมนูตั้งค่าข้อมูล' })
    await expect(async () => {
      await nav.getByRole('link', { name: 'งานที่ยังไม่มีค่า' }).click()
      await expect(page).toHaveURL(new RegExp(`${PAGE}$`), { timeout: 3000 })
    }).toPass({ timeout: 20000 })

    await expect(page.getByTestId('missing-card-income')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('heading', { name: /^งานที่ยังไม่มีค่า/ })).toHaveText(
      `งานที่ยังไม่มีค่า · ${THAI_MONTHS[MONTH.month()]} ${MONTH.year() + 543}`,
    )

    const row = rowOf(page, 'E2E_MISS_F1')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('E2E_MISS_C1')
    await expect(row).toContainText('41.44–43.54')
    await expect(row).toContainText('2 งาน')
    await expect(row).toContainText('ไม่มีอัตรา')
    const incomeBefore = await cardValue(page, 'missing-card-income')

    await row.getByTestId('missing-setup-btn').click()
    const dialog = page.getByRole('dialog', { name: 'ตั้งค่าขนส่ง' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('E2E_MISS_C1E2E_MISS_F1ขาออก20DC')
    await expect(dialog).toContainText('40.01 – 42.00')
    await expect(dialog).toContainText('42.01 – 44.00')
    await dialog.getByTestId('missing-range-price-0').fill('6000')
    await dialog.getByTestId('missing-range-price-1').fill('6300')
    // ช่วงต่ำสุดเป็นฐาน ช่วงอื่นแสดงส่วนต่าง
    await expect(dialog.getByText('ฐาน', { exact: true })).toBeVisible()
    await expect(dialog).toContainText('+300')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('บันทึกและดึงข้อมูลค่าขนส่ง 2 งาน')).toBeVisible()
    await expect(dialog).toBeHidden()

    expect((await jobValues('E2E-MISS-1')).income).toBe(6000)
    expect((await jobValues('E2E-MISS-2')).income).toBe(6300)
    // ราคาฐาน = ราคาต่ำสุด + ส่วนเพิ่มต่อช่วง
    const surcharges = await sql<{ income: string; min: string; max: string; surcharge: string }>(
      `SELECT r.income, s."fuelPriceMin" AS min, s."fuelPriceMax" AS max, s.surcharge
         FROM rate_income r
         JOIN rate_income_fuel_surcharge s ON s."rateIncomeId" = r.id
         JOIN locations l ON l.id = r."factoryLocationId"
        WHERE l.name = 'E2E_MISS_F1'
        ORDER BY s."fuelPriceMin"`,
    )
    expect(surcharges.map((s) => [Number(s.income), Number(s.min), Number(s.max), Number(s.surcharge)])).toEqual([
      [6000, 40.01, 42.01, 0],
      [6000, 42.01, 44.01, 300],
    ])

    // refetch แล้วแถวหายจากกลุ่มไม่มีอัตรา
    await expect(rowOf(page, 'E2E_MISS_F1')).toHaveCount(0)
    await expect(async () => {
      expect(await cardValue(page, 'missing-card-income')).toBe(incomeBefore - 2)
    }).toPass({ timeout: 10000 })
  })

  test('Case 2: ตั้งค่าค่าเที่ยวแล้วเติมงาน', async ({ page }) => {
    await login(page)
    await openPage(page)
    await page.getByText(/^ค่าเที่ยว \(\d+ กลุ่ม\)$/).click()

    const row = rowOf(page, 'E2E_MISS_F1')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('2 งาน')
    await expect(row).toContainText('ไม่มีอัตรา')

    await row.getByTestId('missing-setup-btn').click()
    const dialog = page.getByRole('dialog', { name: 'ตั้งค่าเที่ยว' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('E2E_MISS_F1ขาออก20DC')
    await expect(dialog).toContainText('2 งาน')
    await expect(dialog).not.toContainText('ลูกค้า')
    await dialog.getByTestId('missing-wage-input').fill('500')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('บันทึกและดึงข้อมูลค่าเที่ยว 2 งาน')).toBeVisible()

    expect((await jobValues('E2E-MISS-1')).driverWage).toBe(500)
    expect((await jobValues('E2E-MISS-2')).driverWage).toBe(500)
    // เติมเฉพาะค่าเที่ยว ค่าขนส่งยังว่าง
    expect((await jobValues('E2E-MISS-1')).income).toBeNull()
    await expect(rowOf(page, 'E2E_MISS_F1')).toHaveCount(0)
  })

  test('Case 3: ดึงข้อมูลจากอัตราที่มีอยู่', async ({ page }) => {
    await login(page)
    await openPage(page)

    const row = rowOf(page, 'E2E_MISS_F2')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('มีอัตราแล้ว')
    await expect(row.getByTestId('missing-setup-btn')).toHaveCount(0)

    await row.getByTestId('missing-fill-btn').click()
    await expect(page.getByText('ดึงข้อมูล 1 งาน')).toBeVisible()
    expect(await jobValues('E2E-MISS-3')).toEqual({ income: 4000, driverWage: null })
    await expect(rowOf(page, 'E2E_MISS_F2')).toHaveCount(0)

    // ฝั่งค่าเที่ยวยังรอเติมแยก
    await page.getByText(/^ค่าเที่ยว \(\d+ กลุ่ม\)$/).click()
    const wageRow = rowOf(page, 'E2E_MISS_F2')
    await expect(wageRow).toContainText('มีอัตราแล้ว')
    await wageRow.getByTestId('missing-fill-btn').click()
    await expect(page.getByText('ดึงข้อมูล 1 งาน').last()).toBeVisible()
    await expect(async () => {
      expect((await jobValues('E2E-MISS-3')).driverWage).toBe(350)
    }).toPass({ timeout: 10000 })
  })

  test('Case 4: งานข้อมูลไม่ครบแสดงข้อความแทนปุ่ม', async ({ page }) => {
    await login(page)
    await openPage(page)

    const row = rowOf(page, 'E2E_MISS_C1').filter({ hasText: 'ข้อมูลไม่ครบ' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('ไม่มี โรงงาน')
    await expect(row.getByTestId('missing-setup-btn')).toHaveCount(0)
    await expect(row.getByTestId('missing-fill-btn')).toHaveCount(0)

    // modal รายการงานของกลุ่ม
    await row.getByTestId('missing-jobs-btn').click()
    const jobs = page.getByRole('dialog', { name: 'รายการงาน' })
    await expect(jobs).toBeVisible()
    await expect(jobs).toContainText('E2E-MISS-4')
    await expect(jobs).toContainText('E2E_MISS Driver')
    await expect(jobs).toContainText('MISS-01')
    await expect(jobs).toContainText('41.44')
    await jobs.getByRole('button', { name: 'Close' }).click()

    // ฝั่งค่าเที่ยว: กรองเฉพาะข้อมูลไม่ครบ
    await page.getByText(/^ค่าเที่ยว \(\d+ กลุ่ม\)$/).click()
    // "ข้อมูลไม่ครบ" ซ้ำกับชื่อการ์ดและ tag สถานะ — คลิกที่ Segmented ย่อยเท่านั้น
    await page.locator('.ant-segmented-item').filter({ hasText: /^ข้อมูลไม่ครบ$/ }).click()
    await expect(rowOf(page, 'E2E_MISS_F1')).toHaveCount(0)
    await expect(rowOf(page, 'ไม่มี โรงงาน').first()).toBeVisible()
  })

  test('Case 5: MANAGER เข้าหน้านี้ไม่ได้', async ({ page }) => {
    await login(page, 'testmanager')
    await page.goto(PAGE)
    await expect(page).toHaveURL(/\/jobs$/)
    expect((await page.request.get('/api/rates/missing')).status()).toBe(403)

    await page.goto('/jobs/settings/rates/income')
    const nav = page.getByRole('navigation', { name: 'เมนูตั้งค่าข้อมูล' })
    await expect(nav.getByRole('link', { name: 'ค่าขนส่ง' })).toBeVisible({ timeout: 15000 })
    await expect(nav.getByRole('link', { name: 'งานที่ยังไม่มีค่า' })).toHaveCount(0)
  })

  test('Case 6: ทอยที่จะถูกดูดซับไม่อยู่ในค่าเที่ยว', async ({ page }) => {
    seed({ MISSING_PART: 'absorb' })
    await login(page)

    type Groups = { driverWage: { jobType: string; size: string | null; jobs: { jobNumber: string }[] }[] }
    const wageJobNumbers = async () => {
      const body = (await (await page.request.get('/api/rates/missing')).json()) as Groups
      return body.driverWage.flatMap((g) => g.jobs.map((j) => j.jobNumber))
    }
    const towingRow = () =>
      page
        .locator('tr.ant-table-row')
        .filter({ has: page.getByRole('cell', { name: 'ทอยตู้', exact: true }) })
        .filter({ has: page.getByRole('cell', { name: '20DC', exact: true }) })

    expect(await wageJobNumbers()).not.toContain('E2E-MISS-5')
    await openPage(page)
    await page.getByText(/^ค่าเที่ยว \(\d+ กลุ่ม\)$/).click()
    await expect(rowOf(page, 'E2E_MISS_F1')).toHaveCount(1)
    await expect(towingRow()).toHaveCount(0)

    // ตัวควบคุม: รับตู้ที่อื่นแทนคาหาง → ทอยไม่ถูกดูดซับ ต้องกลับมาอยู่ในค่าเที่ยว
    await sql(
      `UPDATE jobs SET "pickupLocationId" = (SELECT id FROM locations WHERE name = 'E2E_MISS_F2')
        WHERE "jobNumber" = 'E2E-MISS-6'`,
    )
    expect(await wageJobNumbers()).toContain('E2E-MISS-5')
    await page.getByTestId('missing-refresh-btn').click()
    await expect(towingRow()).toHaveCount(1)
    await towingRow().getByTestId('missing-jobs-btn').click()
    await expect(page.getByRole('dialog', { name: 'รายการงาน' })).toContainText('E2E-MISS-5')
  })
})
