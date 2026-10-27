import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER = 'Fuel Summary Driver'
/** เดือนล่าสุดที่จบแล้ว — การ์ดใบแรกบนหน้าจอ */
const LAST_CLOSED = dayjs().subtract(1, 'month')
const ROOT = path.resolve(__dirname, '../..')

function run(script: string, env: Record<string, string> = {}) {
  execSync(`npx tsx ${script}`, { stdio: 'inherit', env: { ...process.env, ...env }, cwd: ROOT })
}

async function login(page: Page, username = 'testadmin') {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL(/\/jobs|\/line-images/, { timeout: 20000 })
}

test.describe.serial('น้ำมันมาตรฐานในหน้าสรุป', () => {
  test.beforeEach(() => {
    run('e2e/scripts/cleanup-fuel-standard.ts')
    run('e2e/scripts/seed-fuel-summary.ts', { FUEL_MONTH: LAST_CLOSED.format('YYYY-MM') })
  })
  test.afterEach(() => run('e2e/scripts/cleanup-fuel-standard.ts'))

  test('Case 1: การ์ดแสดงเกินมาตรฐาน + quick-add ค่าที่ขาดแล้วคำนวณใหม่', async ({ page }) => {
    test.skip(dayjs().month() === 0, 'เดือน ม.ค. ยังไม่มีเดือนที่จบแล้วในปีนี้')
    await login(page)

    await page.goto('/summary')
    // ตารางอาจ render ซ้ำหลังโหลดข้อมูลเสร็จ — คลิกซ้ำจนกว่าจะไปหน้ารายคน
    await expect(async () => {
      await page.getByRole('row').filter({ hasText: DRIVER }).click()
      await expect(page).toHaveURL(/\/summary\/[a-z0-9]+/, { timeout: 3000 })
    }).toPass({ timeout: 20000 })
    const card = page.getByTestId('summary-month-card').first()
    await expect(card).toBeVisible({ timeout: 20000 })

    await expect(card.getByTestId('fuel-excess-value')).toHaveText('+50.00')
    await expect(card.getByTestId('fuel-net-value')).toHaveText('+50.00')
    await expect(card.getByTestId('fuel-segments-summary')).toContainText('3 ช่วง')
    await expect(card.getByTestId('fuel-segments-summary')).toContainText('2 ไม่ครบ')

    // "ดู" ไปหน้าช่วงน้ำมันของเดือนนั้น
    await expect(async () => {
      await card.getByTestId('fuel-segments-view-btn').click()
      await expect(page).toHaveURL(new RegExp(`/jobs/[a-z0-9]+/fuel\\?month=${LAST_CLOSED.format('YYYY-MM')}`), { timeout: 3000 })
    }).toPass({ timeout: 20000 })
    await expect(page.getByTestId('fuel-page-excess')).toHaveText('+50.00', { timeout: 15000 })
    await expect(page.getByTestId('fuel-page-incomplete')).toHaveText('2')
    const table = page.locator('.ant-table').first()
    await expect(table).toContainText('ไม่พบจุดเติมก่อนหน้า')
    await expect(table).toContainText('วิ่ง · 40DC · E2E_FUEL_SUM_F1 · รับแหลมฉบัง')
    await expect(table).toContainText('E2E-FUEL-5')

    // กรอง "ไม่ครบ" เหลือ 2 ช่วง
    await page.getByText('ไม่ครบ (2)').click()
    await expect(table.locator('tbody > tr.ant-table-row')).toHaveCount(2)
    await page.getByText('ทั้งหมด (3)').click()

    // ช่วงที่ 2 กดจำนวนงาน → modal รายการ job — วิ่ง 300 + ทอย 25 + วิ่ง (ใบที่เติม) 300
    await page.getByTestId('fuel-segment-jobs-btn').nth(1).click()
    const jobsModal = page.getByRole('dialog', { name: /งานในช่วง/ })
    await expect(jobsModal).toBeVisible()
    await expect(jobsModal).toContainText('E2E-FUEL-2')
    await expect(jobsModal).toContainText('E2E-FUEL-3')
    await expect(jobsModal).toContainText('E2E_FUEL_SUM_TOW')
    await expect(jobsModal).toContainText('625.00')
    await expect(jobsModal).toContainText('675.00')
    await jobsModal.getByRole('button', { name: 'Close' }).click()

    // quick-add: ประเภท/size/โรงงาน/รับแหลมฉบังถูกกรอกไว้ให้แล้ว กรอกแค่ลิตร
    await page.getByTestId('fuel-quick-add-btn').click()
    await expect(page.locator('#fuel-standard-pickup-laem')).toBeChecked()
    await expect(page.locator('#fuel-standard-return-laem')).not.toBeChecked()
    await page.getByTestId('fuel-standard-liters-input').fill('180')
    await page.getByTestId('fuel-standard-submit-btn').click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible()

    // หน้าคำนวณใหม่ทันที
    await expect(page.getByTestId('fuel-page-excess')).toHaveText('+70.00', { timeout: 15000 })
    await expect(page.getByTestId('fuel-page-incomplete')).toHaveText('1')

    // กลับไปการ์ดเห็นตัวเลขใหม่
    await expect(async () => {
      await page.getByTestId('fuel-segments-back-btn').click()
      await expect(page).toHaveURL(/\/summary\/[a-z0-9]+/, { timeout: 3000 })
    }).toPass({ timeout: 20000 })
    await expect(card.getByTestId('fuel-excess-value')).toHaveText('+70.00', { timeout: 15000 })
    await expect(card.getByTestId('fuel-net-value')).toHaveText('+70.00')
    await expect(card.getByTestId('fuel-segments-summary')).toContainText('1 ไม่ครบ')
  })

  test('Case 2: MANAGER เข้าหน้าช่วงน้ำมันจากหน้ารายการงานได้, SENIOR_STAFF/STAFF เข้าไม่ได้', async ({ page, browser }) => {
    await login(page, 'testmanager')
    const drivers = (await (await page.request.get('/api/drivers')).json()) as { id: string; name: string }[]
    const driverId = drivers.find((d) => d.name === DRIVER)!.id
    const month = LAST_CLOSED.format('YYYY-MM')

    await page.goto(`/jobs/${driverId}?month=${month}`)
    // กดก่อน hydrate เสร็จจะไม่ไปไหน — กดซ้ำจนกว่าจะเปลี่ยนหน้า
    await expect(async () => {
      await page.getByTestId('fuel-segments-btn').click()
      await expect(page).toHaveURL(new RegExp(`/jobs/${driverId}/fuel\\?month=${month}`), { timeout: 3000 })
    }).toPass({ timeout: 20000 })
    await expect(page.getByTestId('fuel-page-excess')).toHaveText('+50.00', { timeout: 15000 })

    for (const [user, status] of [['testsenior', 403], ['teststaff', 403]] as const) {
      const other = await browser.newPage()
      await login(other, user)
      expect((await other.request.get(`/api/fuel-segments/${driverId}?month=${month}`)).status(), user).toBe(status)
      if (user === 'testsenior') {
        await other.goto(`/jobs/${driverId}?month=${month}`)
        await expect(other.getByTestId('back-to-jobs-btn')).toBeVisible({ timeout: 15000 })
        await expect(other.getByTestId('fuel-segments-btn')).toHaveCount(0)
        await other.goto(`/jobs/${driverId}/fuel?month=${month}`)
        await expect(other).toHaveURL(/\/jobs$/)
      }
      await other.close()
    }
  })
})
