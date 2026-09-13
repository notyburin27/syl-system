import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER = 'Entry Test Driver'
const VEHICLE = 'ENT-01'
const DRIVER_B = 'Entry Test Driver B'

/** เดือนล่าสุดที่จบแล้ว — การ์ดใบแรกบนหน้าจอ */
const LAST_CLOSED = dayjs().subtract(1, 'month')

async function login(page: import('@playwright/test').Page, username: string) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL(/\/jobs|\/line-images/, { timeout: 20000 })
}

async function createDriverAndOpen(page: import('@playwright/test').Page) {
  await page.goto('/jobs/settings/drivers')
  await page.getByTestId('add-driver-btn').click()
  await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER)
  await page.getByRole('dialog').getByPlaceholder('เบอร์รถ').fill(VEHICLE)
  await page.getByTestId('driver-submit-btn').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()

  await page.goto('/summary')
  await page.getByRole('row').filter({ hasText: DRIVER }).click()
  await expect(page).toHaveURL(/\/summary\/[a-z0-9]+/)
  await page.waitForSelector('[data-testid="summary-month-card"]', { timeout: 20000 })
}

test.describe.serial('ช่องกรอกมือรายเดือน', () => {
  test.afterEach(async () => {
    execSync('npx tsx e2e/scripts/cleanup-entry.ts', {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: path.resolve(__dirname, '../..'),
    })
  })

  test('Case 1: กดดินสอ กรอกค่า บันทึก แล้วค่าคงอยู่หลัง reload', async ({ page }) => {
    test.skip(dayjs().month() === 0, 'เดือน ม.ค. ยังไม่มีเดือนที่จบแล้วในปีนี้')
    await login(page, 'testadmin')
    await createDriverAndOpen(page)

    const card = page.getByTestId('summary-month-card').first()
    const m = LAST_CLOSED.format('YYYY-MM')

    // ดินสอตัวเดียวที่หัวการ์ด เปิด input ทั้ง 4 ช่องพร้อมกัน
    await card.getByTestId('card-edit').click()
    await page.locator(`#entry-input-${m}-carryTrips`).fill('6')
    await page.locator(`#entry-input-${m}-otherExpenses`).fill('3230')
    await card.getByTestId('card-save').click()

    await expect(card.getByTestId('entry-value-carryTrips')).toHaveText('6', { timeout: 15000 })
    await expect(card.getByTestId('entry-value-otherExpenses')).toHaveText('3,230.00')

    // ค่าต้องมาจาก DB จริง ไม่ใช่แค่ state ในหน้า
    await page.reload()
    await page.waitForSelector('[data-testid="summary-month-card"]', { timeout: 20000 })
    const reloaded = page.getByTestId('summary-month-card').first()
    await expect(reloaded.getByTestId('entry-value-carryTrips')).toHaveText('6')
    await expect(reloaded.getByTestId('entry-value-otherExpenses')).toHaveText('3,230.00')
  })

  test('Case 2: กดยกเลิก ค่าเดิมกลับมา ไม่ถูกบันทึก', async ({ page }) => {
    test.skip(dayjs().month() === 0, 'เดือน ม.ค. ยังไม่มีเดือนที่จบแล้วในปีนี้')
    await login(page, 'testadmin')
    await createDriverAndOpen(page)

    const card = page.getByTestId('summary-month-card').first()
    await card.getByTestId('card-edit').click()
    await page.locator(`#entry-input-${LAST_CLOSED.format('YYYY-MM')}-otherExpenses`).fill('9999')
    await card.getByTestId('card-cancel').click()

    // กลับเป็นโหมดอ่าน และยังว่างอยู่
    await expect(card.getByTestId('entry-value-otherExpenses')).toBeVisible()
    await expect(card.getByTestId('entry-value-otherExpenses')).toHaveText('')

    await page.reload()
    await page.waitForSelector('[data-testid="summary-month-card"]', { timeout: 20000 })
    await expect(
      page.getByTestId('summary-month-card').first().getByTestId('entry-value-otherExpenses')
    ).toHaveText('')
  })

  test('Case 3: MANAGER ยิง PATCH entry ไม่ได้ (403)', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER)
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const list = await (await page.request.get('/api/drivers')).json()
    const id = list.find((d: { name: string }) => d.name === DRIVER).id

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')

    const res = await page.request.patch(`/api/summary/${id}/entry`, {
      data: { month: LAST_CLOSED.format('YYYY-MM'), field: 'carryTrips', value: 5 },
    })
    expect(res.status()).toBe(403)
  })

  test('Case 4: field นอก whitelist ถูกปฏิเสธ (400)', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER)
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const list = await (await page.request.get('/api/drivers')).json()
    const id = list.find((d: { name: string }) => d.name === DRIVER).id

    // พยายามเขียน field ที่ไม่ได้อนุญาต
    const bad = await page.request.patch(`/api/summary/${id}/entry`, {
      data: { month: LAST_CLOSED.format('YYYY-MM'), field: 'updatedById', value: 1 },
    })
    expect(bad.status()).toBe(400)

    // แบกต้องเป็นจำนวนเต็มไม่ติดลบ
    const negative = await page.request.patch(`/api/summary/${id}/entry`, {
      data: { month: LAST_CLOSED.format('YYYY-MM'), field: 'carryTrips', value: -3 },
    })
    expect(negative.status()).toBe(400)
  })

  test('Case 5: ปุ่มเปลี่ยนคนขับ → ค้นหา → สลับไปคนใหม่ คงปีที่เลือกไว้', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriverAndOpen(page)
    const firstUrl = page.url()

    // สร้างคนขับอีกคนเพื่อสลับไป
    await page.goto('/jobs/settings/drivers')
    // รอหน้าโหลดเสร็จก่อนกด ไม่งั้นคลิกตอนตารางยังไม่พร้อม modal ไม่เปิด
    await expect(page.getByText('จัดการคนขับรถ')).toBeVisible({ timeout: 20000 })
    await page.getByTestId('add-driver-btn').click()
    await expect(page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ')).toBeVisible({ timeout: 20000 })
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_B)
    await page.getByRole('dialog').getByPlaceholder('เบอร์รถ').fill('ENT-02')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await page.goto(firstUrl)
    await page.waitForSelector('[data-testid="summary-month-card"]', { timeout: 20000 })

    await page.getByTestId('switch-driver-btn').click()
    // รอรายชื่อโหลดเสร็จก่อนค้น ไม่งั้นกรอกใส่ list ที่ยังว่าง
    await page.waitForSelector('[data-testid="switch-driver-result"]', { timeout: 20000 })
    await page.getByTestId('switch-driver-search').fill('ENT-02')
    await expect(page.getByTestId('switch-driver-result')).toHaveCount(1)
    await page.getByTestId('switch-driver-result').first().click()

    // URL เปลี่ยนเป็นคนใหม่ และยังพก year ไปด้วย
    await expect(page).toHaveURL(/\/summary\/[a-z0-9]+\?year=\d{4}/)
    expect(page.url()).not.toContain(firstUrl.split('/summary/')[1].split('?')[0])
    await expect(page.getByText(DRIVER_B, { exact: false }).first()).toBeVisible({ timeout: 20000 })
  })

  test('Case 6: การ์ดต้องไม่ขยับขนาดตอนสลับโหมดอ่าน/แก้ไข', async ({ page }) => {
    test.skip(dayjs().month() === 0, 'เดือน ม.ค. ยังไม่มีเดือนที่จบแล้วในปีนี้')
    await login(page, 'testadmin')
    await createDriverAndOpen(page)

    const card = page.getByTestId('summary-month-card').first()
    const size = async () => {
      const b = await card.boundingBox()
      return { w: Math.round(b!.width), h: Math.round(b!.height) }
    }

    const before = await size()
    await card.getByTestId('card-edit').click()
    await expect(card.getByTestId('card-save')).toBeVisible()
    const after = await size()

    // input สูงกว่าข้อความธรรมดา ถ้าไม่ล็อกความสูงแถว การ์ดจะกระตุกตอนกดดินสอ
    expect(after.h, 'ความสูงการ์ดต้องไม่เปลี่ยน').toBe(before.h)
    expect(after.w, 'ความกว้างการ์ดต้องไม่เปลี่ยน').toBe(before.w)
  })
})
