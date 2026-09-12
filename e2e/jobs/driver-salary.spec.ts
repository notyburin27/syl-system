import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER_NAME = 'Test Driver Playwright'

async function login(page: import('@playwright/test').Page, username: string) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs/, { timeout: 10_000 })
}

test.describe.serial('ฐานเงินเดือน + วันเริ่มงาน', () => {
  test.afterEach(async () => {
    execSync('npx tsx e2e/scripts/cleanup-driver.ts', {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: path.resolve(__dirname, '../..'),
    })
  })

  test('Case 1: ADMIN เห็นคอลัมน์ฐานเงินเดือน และบันทึกค่าได้', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await expect(page.getByText('จัดการคนขับรถ')).toBeVisible()

    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.locator('#driver-start-date').fill('25/08/2568')
    await page.keyboard.press('Enter')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // คอลัมน์ต้องมี และแสดงค่าที่บันทึก
    await expect(page.getByRole('columnheader', { name: 'ฐานเงินเดือน' })).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(DRIVER_NAME) })).toContainText('9,000')
  })

  test('Case 2: MANAGER ไม่เห็นคอลัมน์ฐานเงินเดือน', async ({ page }) => {
    // ADMIN สร้างคนขับพร้อมเงินเดือนก่อน
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // MANAGER เข้ามาดู
    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')
    await page.goto('/jobs/settings/drivers')
    await expect(page.getByText('จัดการคนขับรถ')).toBeVisible()
    await expect(page.getByText(DRIVER_NAME)).toBeVisible()

    await expect(page.getByRole('columnheader', { name: 'ฐานเงินเดือน' })).not.toBeVisible()
  })

  test('Case 3: MANAGER ยิง API ตรงๆ ไม่เห็นค่า baseSalary', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')

    const res = await page.request.get('/api/drivers')
    expect(res.ok()).toBeTruthy()
    const drivers = await res.json()
    const target = drivers.find((d: { name: string }) => d.name === DRIVER_NAME)
    expect(target).toBeTruthy()
    expect(target.baseSalary).toBeUndefined()
  })

  test('Case 4: MANAGER แก้ baseSalary ผ่าน API ไม่ได้', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const adminRes = await page.request.get('/api/drivers')
    const driverId = (await adminRes.json()).find(
      (d: { name: string }) => d.name === DRIVER_NAME
    ).id

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')

    // MANAGER พยายามแก้เงินเดือนเป็น 99999
    await page.request.patch(`/api/drivers/${driverId}`, {
      data: { name: DRIVER_NAME, baseSalary: 99999 },
    })

    // ADMIN กลับมาดู — ค่าต้องยังเป็น 9000
    await page.goto('/api/auth/signout')
    await login(page, 'testadmin')
    const verifyRes = await page.request.get('/api/drivers')
    const verified = (await verifyRes.json()).find(
      (d: { name: string }) => d.name === DRIVER_NAME
    )
    expect(Number(verified.baseSalary)).toBe(9000)
  })

  test('Case 5: MANAGER ยิง PATCH เฉพาะ resignedAt (shortcut branch) ไม่เห็น baseSalary', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const adminRes = await page.request.get('/api/drivers')
    const driverId = (await adminRes.json()).find(
      (d: { name: string }) => d.name === DRIVER_NAME
    ).id

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')

    // ส่งเฉพาะ resignedAt (ไม่มี key "name") — เข้า shortcut branch ของ PATCH
    const res = await page.request.patch(`/api/drivers/${driverId}`, {
      data: { resignedAt: '2026-09-13' },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.baseSalary).toBeUndefined()
  })

  test('Case 6: MANAGER ยิง GET /api/jobs ไม่เห็น baseSalary ของคนขับใน driver object', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const adminRes = await page.request.get('/api/drivers')
    const driverId = (await adminRes.json()).find(
      (d: { name: string }) => d.name === DRIVER_NAME
    ).id

    const month = dayjs().format('YYYY-MM')
    const jobRes = await page.request.post('/api/jobs', {
      data: {
        jobDate: dayjs().format('YYYY-MM-DD'),
        jobType: 'inbound',
        jobNumber: `E2E-SALARY-${Date.now()}`,
        driverId,
      },
    })
    expect(jobRes.ok()).toBeTruthy()

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')

    const listRes = await page.request.get(`/api/jobs?month=${month}&driverId=${driverId}`)
    expect(listRes.ok()).toBeTruthy()
    const jobs = await listRes.json()
    expect(jobs.length).toBeGreaterThan(0)
    for (const job of jobs) {
      expect(job.driver?.baseSalary).toBeUndefined()
    }
  })
})
