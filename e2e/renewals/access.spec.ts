import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('สิทธิ์ฟีเจอร์ต่ออายุรถ', () => {
  test('INSURANCE: login แล้วอยู่ /renewals และเห็นเฉพาะเมนูต่ออายุรถ', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const sider = page.locator('.ant-layout-sider')
    await expect(sider.getByText('ต่ออายุรถ')).toBeVisible()
    await expect(sider.getByText('งานขนส่ง')).toHaveCount(0)
    await expect(sider.getByText('รูปภาพ LINE')).toHaveCount(0)
  })

  test('INSURANCE: เปิดหน้าอื่นตรงๆ ถูกพากลับ /renewals', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    for (const path of ['/jobs', '/line-images', '/admin/users']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/renewals$/)
    }
  })

  test('INSURANCE: API อื่นได้ 403', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    expect((await page.request.get('/api/drivers')).status()).toBe(403)
  })

  test('STAFF: เปิด /renewals ถูกพาไป /line-images และ API ต่ออายุรถได้ 403', async ({ page }) => {
    await login(page, 'teststaff', /\/jobs/)
    await page.goto('/renewals')
    await expect(page).toHaveURL(/\/line-images/)
    expect((await page.request.get('/api/renewals/dashboard')).status()).toBe(403)
  })

  test('MANAGER: เห็นเมนูต่ออายุรถและเปิด /renewals ได้', async ({ page }) => {
    await login(page, 'testmanager', /\/jobs/)
    await expect(page.locator('.ant-layout-sider').getByText('ต่ออายุรถ')).toBeVisible()
    await page.goto('/renewals')
    await expect(page).toHaveURL(/\/renewals$/)
    await expect(page.getByRole('heading', { name: 'ต่ออายุรถ' })).toBeVisible()
  })
})
