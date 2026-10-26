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

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
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

    await card.getByTestId('fuel-segments-view-btn').click()
    const dialog = page.getByRole('dialog', { name: /รายละเอียดช่วงน้ำมัน/ })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('ไม่พบจุดเติมก่อนหน้า')
    await expect(dialog).toContainText('ไม่มีค่ามาตรฐาน')
    await expect(dialog).toContainText('วิ่ง · 40DC · E2E_FUEL_SUM_F1 · แหลมฉบัง')
    await expect(dialog).toContainText('E2E-FUEL-5')

    // quick-add: ประเภท/size/โรงงาน/แหลมฉบังถูกกรอกไว้ให้แล้ว กรอกแค่ลิตร
    await dialog.getByTestId('fuel-quick-add-btn').click()
    await expect(page.locator('#fuel-standard-laem')).toBeChecked()
    await page.getByTestId('fuel-standard-liters-input').fill('180')
    await page.getByTestId('fuel-standard-submit-btn').click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible()

    // modal รายละเอียดยังเปิดอยู่และเห็นตัวเลขใหม่
    await expect(dialog).toContainText('+20.00', { timeout: 15000 })
    await dialog.getByRole('button', { name: 'Close' }).click()

    await expect(card.getByTestId('fuel-excess-value')).toHaveText('+70.00', { timeout: 15000 })
    await expect(card.getByTestId('fuel-net-value')).toHaveText('+70.00')
    await expect(card.getByTestId('fuel-segments-summary')).toContainText('1 ไม่ครบ')
  })
})
