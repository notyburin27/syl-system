import { test, expect, type Page } from '@playwright/test'
import { login, expectJson } from '../renewals/helpers'

const suffix = Date.now()
const nameA = `E2E ค้นหา สมชาย ${suffix}`
const nameB = `E2E ค้นหา มานี ${suffix}`
const phoneB = `09${String(suffix).slice(-8)}`

async function createBuyer(page: Page, data: { name: string; phone?: string }): Promise<string> {
  return (await expectJson<{ id: string }>(await page.request.post('/api/stock/buyers', { data }))).id
}

test.describe('รายการลูกค้า — ค้นหา', () => {
  let ids: string[] = []

  test.beforeEach(async ({ page }) => {
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    ids = [await createBuyer(page, { name: nameA }), await createBuyer(page, { name: nameB, phone: phoneB })]
  })

  test.afterEach(async ({ page }) => {
    for (const id of ids) await page.request.delete(`/api/stock/buyers/${id}`)
  })

  test('ค้นหาด้วยชื่อหรือเบอร์โทร → แสดงเฉพาะลูกค้าที่ตรง, ล้างแล้วกลับมาครบ', async ({ page }) => {
    await page.goto('/stock/buyers')
    const rowA = page.getByRole('row', { name: new RegExp(nameA) })
    const rowB = page.getByRole('row', { name: new RegExp(nameB) })
    const search = page.getByPlaceholder('ค้นหาชื่อ/เบอร์โทร')

    await search.fill(`สมชาย ${suffix}`)
    await expect(rowA).toBeVisible()
    await expect(rowB).toHaveCount(0)

    await search.fill(phoneB)
    await expect(rowB).toBeVisible()
    await expect(rowA).toHaveCount(0)

    await search.fill(String(suffix))
    await expect(rowA).toBeVisible()
    await expect(rowB).toBeVisible()
  })
})
