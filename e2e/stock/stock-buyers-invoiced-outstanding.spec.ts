import { test, expect, type Page } from '@playwright/test'
import { login, expectJson } from '../renewals/helpers'

const suffix = Date.now()
const productName = `E2E ค้างใบเสร็จ สินค้า ${suffix}`
const buyerName = `E2E ค้างใบเสร็จ ลูกค้า ${suffix}`

test.describe('รายการลูกค้า — ยอดค้างตามใบเสร็จ', () => {
  let productId: string
  let buyerId: string
  let stockInId: string
  let invoicedSaleId: string
  let uninvoicedSaleId: string
  let invoiceId: string

  const post = async <T,>(page: Page, url: string, data: object) =>
    expectJson<T>(await page.request.post(url, { data }))

  test.beforeEach(async ({ page }) => {
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    productId = (await post<{ id: string }>(page, '/api/stock/products', { name: productName, sellingPrice: 100 })).id
    buyerId = (await post<{ id: string }>(page, '/api/stock/buyers', { name: buyerName })).id
    stockInId = (await post<{ id: string }>(page, '/api/stock/import', {
      productId, purchasePrice: 10, quantity: 10, date: '2099-01-01T00:00:00.000Z',
    })).id
    // ขาย 100 บาท → ออกใบเสร็จ (ยังไม่จ่าย)
    invoicedSaleId = (await post<{ id: string }>(page, '/api/stock/export', {
      productId, buyerId, quantity: 1, sellingPrice: 100, date: '2099-01-02T00:00:00.000Z',
    })).id
    // ขาย 30 x 2 = 60 บาท → ยังไม่ออกใบเสร็จ
    uninvoicedSaleId = (await post<{ id: string }>(page, '/api/stock/export', {
      productId, buyerId, quantity: 2, sellingPrice: 30, date: '2099-01-03T00:00:00.000Z',
    })).id
    invoiceId = (await post<{ id: string }>(page, '/api/stock/invoices', {
      buyerId, stockOutIds: [invoicedSaleId], dueDate: '2099-02-05T00:00:00.000Z',
    })).id
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete(`/api/stock/invoices/${invoiceId}`)
    for (const id of [invoicedSaleId, uninvoicedSaleId]) await page.request.delete(`/api/stock/export/${id}`)
    await page.request.delete(`/api/stock/import/${stockInId}`)
    await page.request.delete(`/api/stock/products/${productId}`)
    await page.request.delete(`/api/stock/buyers/${buyerId}`)
  })

  // ไม่ทดสอบกรณีจ่ายแล้ว — ใบเสร็จที่จ่ายแล้วลบผ่าน API ไม่ได้ ทำให้ cleanup ข้อมูลไม่ได้
  test('แสดงยอดค้างรวม และยอดค้างเฉพาะใบเสร็จที่ยังไม่จ่าย', async ({ page }) => {
    await page.goto('/stock/buyers')
    const row = page.getByRole('row', { name: new RegExp(buyerName) })
    // คอลัมน์: ชื่อ | ยอดค้างชำระ | ค้างตามใบเสร็จ | วันครบกำหนด | การดำเนินการ
    await expect(row.getByRole('cell').nth(1)).toHaveText('160.00')
    await expect(row.getByRole('cell').nth(2)).toHaveText('100.00')
  })
})
