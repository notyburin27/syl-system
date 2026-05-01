import { test, expect } from '@playwright/test'

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible()
  })

  test('success: ล็อกอินสำเร็จ → redirect ไปหน้า /jobs', async ({ page }) => {
    await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
    await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

    await expect(page).toHaveURL(/\/jobs/, { timeout: 10_000 })
  })

  test('fail: password ผิด → แสดง error message และยังอยู่หน้า login', async ({ page }) => {
    await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
    await page.getByPlaceholder('รหัสผ่าน').fill('wrongpassword')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

    await expect(
      page.getByText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    ).toBeVisible({ timeout: 5_000 })

    await expect(page).toHaveURL(/\/login/)
  })
})
