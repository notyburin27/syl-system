import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'
import { UNGROUPED } from '@/types/job'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER_A = 'Summary Driver A'
const DRIVER_B = 'Summary Driver B'
const DRIVER_UNGROUPED = 'Summary Driver Ungrouped'
const GROUP_A = 'กลุ่มสรุป A'
const GROUP_B = 'กลุ่มสรุป B'

async function login(page: import('@playwright/test').Page, username: string) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs|\/line-images/, { timeout: 10_000 })
}

async function createDriver(
  page: import('@playwright/test').Page,
  name: string,
  vehicleNumber: string,
  group: string
) {
  await page.goto('/jobs/settings/drivers')
  await page.getByTestId('add-driver-btn').click()
  await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(name)
  await page.getByRole('dialog').getByPlaceholder('เบอร์รถ').fill(vehicleNumber)
  await page.locator('#driver-group-name').fill(group)
  await page.getByTestId('driver-submit-btn').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
}

test.describe.serial('สรุปงาน', () => {
  test.afterEach(async () => {
    execSync('npx tsx e2e/scripts/cleanup-summary.ts', {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: path.resolve(__dirname, '../..'),
    })
  })

  test('Case 1: เมนูสรุปงานเห็นเฉพาะ ADMIN', async ({ page }) => {
    await login(page, 'testadmin')
    await expect(page.getByRole('menuitem', { name: 'สรุปงาน' })).toBeVisible()

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')
    await expect(page.getByRole('menuitem', { name: 'สรุปงาน' })).not.toBeVisible()
  })

  test('Case 2: MANAGER เข้า /summary ตรงๆ ถูก redirect', async ({ page }) => {
    await login(page, 'testmanager')
    await page.goto('/summary')
    await expect(page).not.toHaveURL(/\/summary/)
  })

  test('Case 3: MANAGER ยิง API สรุปงานได้ 403', async ({ page }) => {
    await login(page, 'testmanager')
    const res = await page.request.get(`/api/summary?month=${dayjs().format('YYYY-MM')}`)
    expect(res.status()).toBe(403)
  })

  test('Case 4: หน้า list แสดงทุกกลุ่ม แบ่งหัวข้อตามกลุ่ม', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)
    await createDriver(page, DRIVER_B, 'SUM-02', GROUP_B)

    await page.goto('/summary')
    await expect(page.getByTestId('summary-group-heading').filter({ hasText: GROUP_A })).toBeVisible()
    await expect(page.getByTestId('summary-group-heading').filter({ hasText: GROUP_B })).toBeVisible()
    await expect(page.getByText(DRIVER_A)).toBeVisible()
    await expect(page.getByText(DRIVER_B)).toBeVisible()
  })

  test('Case 5: filter กลุ่มแล้วเหลือเฉพาะกลุ่มที่เลือก', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)
    await createDriver(page, DRIVER_B, 'SUM-02', GROUP_B)

    await page.goto('/summary')
    await expect(page.getByText(DRIVER_B)).toBeVisible()

    await page.locator('#summary-group-filter').click()
    await page.getByTitle(GROUP_A, { exact: true }).click()
    await page.keyboard.press('Escape')

    await expect(page.getByText(DRIVER_A)).toBeVisible()
    await expect(page.getByText(DRIVER_B)).not.toBeVisible()
  })

  test('Case 6: ค้นหาด้วยชื่อ และด้วยเบอร์รถ', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)
    await createDriver(page, DRIVER_B, 'SUM-02', GROUP_B)

    await page.goto('/summary')

    // ค้นด้วยชื่อ
    await page.getByTestId('summary-search-input').fill(DRIVER_A)
    await expect(page.getByText(DRIVER_A)).toBeVisible()
    await expect(page.getByText(DRIVER_B)).not.toBeVisible()

    // ค้นด้วยเบอร์รถ
    await page.getByTestId('summary-search-input').fill('SUM-02')
    await expect(page.getByText(DRIVER_B)).toBeVisible()
    await expect(page.getByText(DRIVER_A)).not.toBeVisible()
  })

  test('Case 7: การ์ดแสดงชื่อกลุ่ม', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)

    await page.goto('/summary')
    const card = page.getByTestId('summary-card').filter({ hasText: DRIVER_A })
    await expect(card).toContainText(GROUP_A)
  })

  test('Case 8: คลิกการ์ดไปหน้ารายคน', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)

    await page.goto('/summary')
    await page.getByTestId('summary-card').filter({ hasText: DRIVER_A }).click()
    await expect(page).toHaveURL(/\/summary\/[a-z0-9]+/)
    await expect(page.getByText(DRIVER_A)).toBeVisible()
    await expect(page.getByText('รายได้')).toBeVisible()
  })

  test('Case 9: download Excel จากหน้า list ได้ไฟล์', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)

    await page.goto('/summary')
    await page.getByTestId('summary-export-btn').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-confirm-btn').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/)
  })

  test('Case 10: เลือกเฉพาะกลุ่มอื่นๆ ตอน export ต้องส่ง sentinel ไม่ใช่ค่าว่าง', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)
    await createDriver(page, DRIVER_UNGROUPED, 'SUM-03', '')

    await page.goto('/summary')

    await page.locator('#summary-group-filter').click()
    await page.getByTitle('กลุ่มอื่นๆ', { exact: true }).click()
    await page.keyboard.press('Escape')

    await page.getByTestId('summary-export-btn').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const reqPromise = page.waitForRequest((u) => u.url().includes('/api/summary/export'))
    await page.getByTestId('export-confirm-btn').click()
    const req = await reqPromise

    expect(req.url()).toContain(`groups=${UNGROUPED}`)
    expect(req.url()).not.toMatch(/groups=(&|$)/)
  })
})
