import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

// Ensure env vars are available in Playwright worker processes (workers inherit from parent,
// but loading explicitly here is a safety net for DATABASE_URL in execSync calls)
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER_NAME = 'Test Driver Playwright'
const VEHICLE_NUMBER = 'BKK-001'
const VEHICLE_REGISTRATION = 'กข-0001'
const JOB_NUMBER = 'E2E-TEST-001'

// English abbreviated month names as rendered by antd DatePicker month cells (index 0 = January)
const MONTH_ABBREV = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// serial: tests share the same driver name — must run one at a time to avoid DB unique-constraint conflicts
test.describe.serial('Jobs Dashboard — Driver Card', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
    await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page).toHaveURL(/\/jobs/, { timeout: 10_000 })
  })

  test.afterEach(async () => {
    // Hard-delete test driver and their jobs between tests (avoids unique-name constraint on re-run)
    execSync('npx tsx e2e/scripts/cleanup-driver.ts', {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: path.resolve(__dirname, '../..'),
    })
  })

  // ─── Case 1 ───────────────────────────────────────────────────────────────
  test('Case 1: สร้าง driver → card ปรากฏบน /jobs dashboard', async ({ page }) => {
    // 1. ไปหน้าจัดการคนขับ
    await page.goto('/jobs/settings/drivers')
    await expect(page.getByText('จัดการคนขับรถ')).toBeVisible()

    // 2. เปิด modal เพิ่มคนขับ
    await page.getByTestId('add-driver-btn').click()

    // 3. กรอกชื่อ เบอร์รถ ทะเบียนรถ และ submit
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await page.getByTestId('driver-name-input').fill(DRIVER_NAME)
    await page.getByTestId('driver-vehicle-number-input').fill(VEHICLE_NUMBER)
    await page.getByTestId('driver-vehicle-registration-input').fill(VEHICLE_REGISTRATION)
    await modal.getByRole('button', { name: 'เพิ่ม' }).click()

    // 4. ตรวจ success message
    await expect(page.getByText('เพิ่มคนขับสำเร็จ')).toBeVisible({ timeout: 5_000 })

    // 5. ไปหน้า /jobs และตรวจว่า card ปรากฏพร้อมเบอร์รถ
    await page.goto('/jobs')
    await expect(page.getByText(`${DRIVER_NAME} (${VEHICLE_NUMBER})`)).toBeVisible({ timeout: 10_000 })
  })

  // ─── Case 2 ───────────────────────────────────────────────────────────────
  test('Case 2: สร้าง job → jobCount ≥1 → เปลี่ยนเดือน → jobCount=0 → กลับมา → jobCount≥1', async ({ page }) => {
    // 1. สร้าง driver ผ่าน API (ต้องการ ID สำหรับ navigate)
    const driverRes = await page.request.post('/api/drivers', {
      data: { name: DRIVER_NAME, vehicleNumber: VEHICLE_NUMBER, vehicleRegistration: VEHICLE_REGISTRATION },
    })
    expect(driverRes.ok()).toBeTruthy()
    const { id: driverId } = (await driverRes.json()) as { id: string }

    // 2. เข้า /jobs/[driverId]
    const currentMonth = dayjs().format('YYYY-MM')
    await page.goto(`/jobs/${driverId}?month=${currentMonth}`)
    await expect(page.getByText(DRIVER_NAME)).toBeVisible({ timeout: 5_000 })

    // 3. เปิด modal edit mode
    await page.getByTestId('toggle-modal-edit-btn').click()
    await expect(page.getByTestId('add-job-btn')).toBeVisible()

    // 4. เปิด job create modal
    await page.getByTestId('add-job-btn').click()
    const jobModal = page.getByRole('dialog')
    await expect(jobModal).toBeVisible()

    // 5a. กรอกวันที่ — คลิกวันนี้ใน calendar
    await page.locator('#job-date-picker').click()
    await page.locator(`.ant-picker-cell[title="${dayjs().format('YYYY-MM-DD')}"]`).click()

    // 5b. เลือกลักษณะงาน — ขาเข้า
    await page.locator('#job-type-select').click()
    await page.getByRole('option', { name: 'ขาเข้า' }).click()

    // 5c. กรอก JOB/เลขที่
    await page.locator('#jobNumber').fill(JOB_NUMBER)

    // 6. สร้าง job
    await page.getByTestId('job-create-btn').click()
    // หลัง create สำเร็จ: isCreated=true → field "ลูกค้า" ปรากฏ, ปุ่ม "สร้าง" หายไป
    await expect(jobModal.getByText('ลูกค้า')).toBeVisible({ timeout: 5_000 })

    // 7. ปิด modal
    await page.getByTestId('job-form-close-btn').click()
    await expect(jobModal).not.toBeVisible()

    // 8. ไปหน้า /jobs และตรวจ card + jobCount ≥ 1
    await page.goto('/jobs')
    const driverCard = page.getByTestId(`driver-card-${driverId}`)
    await expect(driverCard).toBeVisible({ timeout: 10_000 })

    const jobCountEl = driverCard
      .locator('.ant-statistic').filter({ hasText: 'งาน' })
      .locator('.ant-statistic-content-value-int')
    await expect(jobCountEl).not.toHaveText('0')

    // 9. เปลี่ยน month picker ไปเดือนที่ไม่มีงาน (ม.ค. 2025)
    const monthPicker = page.getByTestId('month-picker')
    const summary1 = page.waitForResponse(
      (resp) => resp.url().includes('/api/jobs/summary') && resp.url().includes('month=2025-01') && resp.status() === 200,
    )
    await monthPicker.click()
    await page.getByRole('button', { name: /ปีก่อนหน้า/ }).click() // 2026 → 2025
    await page.locator('.ant-picker-cell-inner').getByText('Jan').click() // เลือก Jan 2025
    await summary1

    // 10. card ยังแสดงอยู่ แต่ jobCount = 0
    await expect(driverCard).toBeVisible()
    await expect(jobCountEl).toHaveText('0', { timeout: 5_000 })

    // 11. เปลี่ยนเดือนกลับมาเดือนปัจจุบัน
    const currentMonthAbbrev = MONTH_ABBREV[dayjs().month()]
    const summary2 = page.waitForResponse(
      (resp) => resp.url().includes('/api/jobs/summary') && resp.url().includes(`month=${currentMonth}`) && resp.status() === 200,
    )
    await monthPicker.click()
    await page.getByRole('button', { name: /ปีถัดไป/ }).click() // 2025 → 2026
    await page.locator('.ant-picker-cell-inner').getByText(currentMonthAbbrev).click()
    await summary2

    // 12. jobCount กลับมา ≥ 1
    await expect(jobCountEl).not.toHaveText('0', { timeout: 5_000 })
  })
})
