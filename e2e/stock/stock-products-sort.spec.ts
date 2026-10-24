import { test, expect } from '@playwright/test'
import { login, expectJson } from '../renewals/helpers'

const tag = `E2E เรียง ${Date.now()}`

test.describe('รายการสินค้า — กดหัวคอลัมน์เพื่อเรียง', () => {
  const productIds: string[] = []

  test.beforeEach(async ({ page }) => {
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    // ชื่อมีตัวเลข: เรียงตามตัวอักษรล้วนจะได้ 14 < 40 < 5 แต่ที่ถูกคือ 5 < 14 < 40
    for (const [size, sellingPrice] of [[14, 300], [5, 900], [40, 100]]) {
      const res = await page.request.post('/api/stock/products', { data: { name: `${tag} ${size} กก.`, sellingPrice } })
      productIds.push((await expectJson<{ id: string }>(res)).id)
    }
  })

  test.afterEach(async ({ page }) => {
    for (const id of productIds) await page.request.delete(`/api/stock/products/${id}`)
  })

  test('เรียงชื่อตามตัวเลขในชื่อ และเรียงราคาขายได้', async ({ page }) => {
    await page.goto('/stock/products')
    const rows = page.locator('tbody tr').filter({ hasText: tag })
    const names = rows.locator('td:first-child')
    await expect(rows).toHaveCount(3)

    await page.getByRole('columnheader', { name: 'ชื่อสินค้า' }).click()
    await expect(names).toHaveText([`${tag} 5 กก.`, `${tag} 14 กก.`, `${tag} 40 กก.`])

    await page.getByRole('columnheader', { name: 'ราคาขาย (บาท)' }).click()
    await expect(names).toHaveText([`${tag} 40 กก.`, `${tag} 14 กก.`, `${tag} 5 กก.`])
  })
})
