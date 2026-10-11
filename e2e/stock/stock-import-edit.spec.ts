import { test, expect, type Page } from '@playwright/test'
import { login, expectJson } from '../renewals/helpers'

type ProductRow = { id: string; name: string; stockRemaining: number }

const suffix = Date.now()
const nameA = `E2E สินค้า A ${suffix}`
const nameB = `E2E สินค้า B ${suffix}`

async function createProduct(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/stock/products', { data: { name, sellingPrice: 100 } })
  return (await expectJson<{ id: string }>(res)).id
}

async function stockRemaining(page: Page, productId: string): Promise<number> {
  const products = await expectJson<ProductRow[]>(await page.request.get('/api/stock/products'))
  return products.find(p => p.id === productId)!.stockRemaining
}

test.describe('นำเข้าสินค้า — แก้ไขรายการ', () => {
  let productA: string
  let productB: string
  let stockInId: string

  test.beforeEach(async ({ page }) => {
    // รอแค่หลุดจากหน้า login — /jobs compile ครั้งแรกบน dev อาจนานเกิน timeout
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    productA = await createProduct(page, nameA)
    productB = await createProduct(page, nameB)
    // วันที่ไกลในอนาคตให้รายการอยู่บนสุดของตาราง (เรียง date desc)
    const res = await page.request.post('/api/stock/import', {
      data: { productId: productA, purchasePrice: 55, quantity: 3, date: '2099-01-01T00:00:00.000Z' },
    })
    stockInId = (await expectJson<{ id: string }>(res)).id
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete(`/api/stock/import/${stockInId}`)
    await page.request.delete(`/api/stock/products/${productA}`)
    await page.request.delete(`/api/stock/products/${productB}`)
  })

  test('success: แก้สินค้า/ราคา/จำนวน → ตารางและยอดคงเหลืออัปเดต', async ({ page }) => {
    await page.goto('/stock/import')
    const row = page.getByRole('row', { name: new RegExp(nameA) })
    await row.getByRole('button', { name: 'แก้ไข' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('แก้ไขรายการนำเข้าสินค้า')).toBeVisible()
    await expect(dialog.locator('#quantity')).toHaveValue('3')
    await expect(dialog.getByText(nameA)).toBeVisible()

    await dialog.locator('#productId').click({ force: true })
    await dialog.locator('#productId').fill(nameB)
    await page.locator('.ant-select-item-option', { hasText: nameB }).click()
    await dialog.locator('#purchasePrice').fill('60')
    await dialog.locator('#quantity').fill('5')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    await expect(page.getByText('แก้ไขรายการสำเร็จ')).toBeVisible()
    const updatedRow = page.getByRole('row', { name: new RegExp(nameB) })
    await expect(updatedRow).toContainText('60.00')
    await expect(updatedRow).toContainText('300.00')
    await expect(page.getByRole('row', { name: new RegExp(nameA) })).toHaveCount(0)

    expect(await stockRemaining(page, productA)).toBe(0)
    expect(await stockRemaining(page, productB)).toBe(5)
  })

  test('success: ลบผ่าน modal ยืนยัน → รายการหายจากตาราง', async ({ page }) => {
    await page.goto('/stock/import')
    const row = page.getByRole('row', { name: new RegExp(nameA) })
    await row.getByRole('button', { name: 'ลบ' }).click()

    await expect(page.getByText('คุณแน่ใจหรือไม่ที่จะลบรายการนี้?')).toBeVisible()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()

    await expect(page.getByText('ลบรายการสำเร็จ')).toBeVisible()
    await expect(row).toHaveCount(0)
    expect(await stockRemaining(page, productA)).toBe(0)
  })

  test('fail: PATCH ข้อมูลไม่ครบ → 400, id ไม่มีอยู่ → 404', async ({ page }) => {
    const missing = await page.request.patch(`/api/stock/import/${stockInId}`, {
      data: { productId: productA, purchasePrice: 55, date: '2099-01-01T00:00:00.000Z' },
    })
    expect(missing.status()).toBe(400)

    const notFound = await page.request.patch('/api/stock/import/does-not-exist', {
      data: { productId: productA, purchasePrice: 55, quantity: 1, date: '2099-01-01T00:00:00.000Z' },
    })
    expect(notFound.status()).toBe(404)
  })
})
