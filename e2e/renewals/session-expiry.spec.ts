import { test, expect } from '@playwright/test'
import { cleanupRenewals, createCoverage, createVehicle, getVehicleDetail, login } from './helpers'

test.describe.serial('session หมดอายุ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())

  test('บันทึกหลัง session หมด → พาไปหน้า login และไม่บันทึกข้อมูล', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const vid = await createVehicle(page, 'E2E-3901 กท')
    const cid = await createCoverage(page, vid, 'TAX', new Date().toISOString().slice(0, 10))

    await page.reload()
    await page.getByTestId(`note-btn-${cid}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('note-input').fill('ไม่ควรถูกบันทึก')

    await page.context().clearCookies() // จำลอง JWT หมดอายุ
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByText('บันทึกสำเร็จ')).toHaveCount(0)

    await login(page, 'testinsurance', /\/renewals$/)
    expect((await getVehicleDetail(page, vid)).coverages[0].renewalNote ?? null).toBeNull()
  })
})
