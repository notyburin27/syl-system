import { test, expect, type Page } from '@playwright/test'

// สิทธิ์หน้า "ตั้งค่าข้อมูล" — เมนู หน้า และ API ต้องตรงกัน (lib/settingsNav.ts)

async function login(page: Page, username: string) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs|\/line-images/, { timeout: 20_000 })
}

const settingsNav = (page: Page) => page.getByRole('navigation', { name: 'เมนูตั้งค่าข้อมูล' })

test.describe('สิทธิ์หน้าตั้งค่าข้อมูล', () => {
  test('MANAGER: เห็นและเข้าหน้าอัตรา/น้ำมันได้ทุกหน้า', async ({ page }) => {
    await login(page, 'testmanager')
    for (const [path, heading] of [
      ['/jobs/settings/rates/transfer', 'อัตราค่าคืนตู้รับตู้'],
      ['/jobs/settings/rates/income', 'อัตราค่าขนส่ง'],
      ['/jobs/settings/rates/driver-wage', 'อัตราค่าเที่ยวคนขับ'],
      ['/jobs/settings/fuel-standard', 'น้ำมันมาตรฐาน'],
    ]) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 })
    }
    await page.goto('/jobs/settings/fuel-price')
    await expect(page).toHaveURL(/\/jobs\/settings\/fuel-price$/)
    await expect(settingsNav(page).getByRole('link', { name: 'ค่าขนส่ง' })).toBeVisible()

    for (const api of ['/api/rates/transfer', '/api/rates/income', '/api/rates/driver-wage', '/api/fuel-price-log', '/api/rates/fuel-standard']) {
      expect((await page.request.get(api)).status(), api).toBe(200)
    }
  })

  test('SENIOR_STAFF: เข้าค่าคืนตู้รับตู้ได้ แต่ค่าขนส่ง/ราคาน้ำมันไม่ได้', async ({ page }) => {
    await login(page, 'testsenior')
    await page.goto('/jobs/settings/rates/transfer')
    await expect(page.getByRole('heading', { name: 'อัตราค่าคืนตู้รับตู้' })).toBeVisible({ timeout: 15_000 })

    const nav = settingsNav(page)
    await expect(nav.getByRole('link', { name: 'ค่าคืนตู้รับตู้' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'ค่าขนส่ง' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'ราคาน้ำมัน' })).toHaveCount(0)

    await page.goto('/jobs/settings/rates/income')
    await expect(page).toHaveURL(/\/jobs$/)

    expect((await page.request.get('/api/rates/transfer')).status()).toBe(200)
    for (const api of ['/api/rates/income', '/api/rates/driver-wage', '/api/fuel-price-log', '/api/rates/fuel-standard']) {
      expect((await page.request.get(api)).status(), api).toBe(403)
    }
  })

  test('STAFF: API อัตราทั้งหมดได้ 403', async ({ page }) => {
    await login(page, 'teststaff')
    for (const api of ['/api/rates/transfer', '/api/rates/income', '/api/rates/driver-wage', '/api/fuel-price-log']) {
      expect((await page.request.get(api)).status(), api).toBe(403)
    }
  })
})
