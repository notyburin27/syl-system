import { test, expect } from '@playwright/test'
import { cleanupRenewals, expectJson, login } from './helpers'

test.describe.serial('บริษัทประกัน', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())

  test('เพิ่มผ่านหน้าจอ → แสดงในตาราง; ชื่อซ้ำ → 409; ปิดใช้งาน → tag ปิดใช้งาน', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    await page.goto('/renewals/insurers')

    await page.getByTestId('insurer-add-btn').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('insurer-name-input').fill('E2E ประกันภัย A')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    const row = page.getByRole('row', { name: /E2E ประกันภัย A/ })
    await expect(row.locator('.ant-tag')).toHaveText('ใช้งาน')

    const dup = await page.request.post('/api/renewals/insurers', { data: { name: ' E2E ประกันภัย A ' } })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('มีบริษัทประกันชื่อนี้อยู่แล้ว')

    await row.getByRole('button', { name: 'ปิดใช้งาน' }).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(row.locator('.ant-tag')).toHaveText('ปิดใช้งาน')
  })

  test('เพิ่มหลายชื่อ (names) ข้ามชื่อที่มีอยู่แล้ว', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const res = await page.request.post('/api/renewals/insurers', {
      data: { names: ['E2E ประกันภัย A', 'E2E ประกันภัย B', 'E2E ประกันภัย B'] },
    })
    expect(await expectJson<{ created: number }>(res)).toEqual({ created: 1 })
  })
})
