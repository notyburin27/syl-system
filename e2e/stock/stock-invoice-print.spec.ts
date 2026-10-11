import { test, expect, type Page } from '@playwright/test'
import { login, expectJson } from '../renewals/helpers'

const suffix = Date.now()
const productName = `E2E ข้าวพิมพ์ ${suffix}`
const buyerName = `E2E ลูกค้าพิมพ์ ${suffix}`

// คลิกซ้ำจนแท็บเปิด — คลิกแรกอาจเกิดก่อนหน้า hydrate เสร็จ
async function openInvoicesTab(page: Page, buyerId: string) {
  await page.goto(`/stock/buyers/${buyerId}`)
  const tab = page.getByRole('tab', { name: /ใบเสร็จทั้งหมด/ })
  await expect(async () => {
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 2000 })
  }).toPass()
}

test.describe('คลังสินค้า — พิมพ์ใบเสร็จ และ confirm ก่อนลบ', () => {
  let productId: string
  let buyerId: string
  let stockInId: string
  let stockOutId: string
  let invoiceId: string

  test.beforeEach(async ({ page }) => {
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    const post = async <T,>(url: string, data: object) => expectJson<T>(await page.request.post(url, { data }))

    productId = (await post<{ id: string }>('/api/stock/products', { name: productName, sellingPrice: 565.5 })).id
    buyerId = (await post<{ id: string }>('/api/stock/buyers', { name: buyerName, phone: '0812345678' })).id
    stockInId = (await post<{ id: string }>('/api/stock/import', {
      productId, purchasePrice: 400, quantity: 5, date: '2099-01-01T00:00:00.000Z',
    })).id
    stockOutId = (await post<{ id: string }>('/api/stock/export', {
      productId, buyerId, quantity: 2, sellingPrice: 565.5, date: '2099-01-02T00:00:00.000Z',
    })).id
    invoiceId = (await post<{ id: string }>('/api/stock/invoices', {
      buyerId, stockOutIds: [stockOutId], dueDate: '2099-02-05T00:00:00.000Z',
    })).id
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete(`/api/stock/invoices/${invoiceId}`)
    await page.request.delete(`/api/stock/export/${stockOutId}`)
    await page.request.delete(`/api/stock/import/${stockInId}`)
    await page.request.delete(`/api/stock/products/${productId}`)
    await page.request.delete(`/api/stock/buyers/${buyerId}`)
  })

  test('success: ปุ่มใบเสร็จเปิดหน้าพิมพ์ในแท็บใหม่ พร้อมรายการ ยอดรวม และจำนวนเงินตัวอักษร', async ({ page }) => {
    await openInvoicesTab(page, buyerId)

    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'ใบเสร็จ' }).click()
    const popup = await popupPromise
    await popup.waitForLoadState()

    expect(popup.url()).toContain(`/stock/invoices/${invoiceId}/print`)
    await expect(popup.getByRole('heading', { name: 'ใบเสร็จรับเงิน' })).toBeVisible()
    await expect(popup.getByText(buyerName)).toBeVisible()
    await expect(popup.getByText('0812345678')).toBeVisible()
    await expect(popup.getByText(invoiceId.slice(-8).toUpperCase())).toBeVisible()
    await expect(popup.getByRole('row', { name: new RegExp(productName) })).toContainText('1,131.00')
    await expect(popup.getByText('(หนึ่งพันหนึ่งร้อยสามสิบเอ็ดบาทถ้วน)')).toBeVisible()
    await expect(popup.getByRole('button', { name: 'พิมพ์' })).toBeVisible()
  })

  test('fail: เปิดหน้าพิมพ์ด้วย id ที่ไม่มีอยู่ → แสดงไม่พบใบเสร็จ', async ({ page }) => {
    await page.goto('/stock/invoices/does-not-exist/print')
    await expect(page.getByText('ไม่พบใบเสร็จ')).toBeVisible()
  })

  test('success: ลบใบเสร็จต้องผ่าน modal ยืนยัน — ยกเลิกแล้วยังอยู่, ยืนยันแล้วหาย', async ({ page }) => {
    await openInvoicesTab(page, buyerId)
    const deleteButton = page.getByRole('tabpanel').getByRole('button', { name: 'ลบ' })

    await deleteButton.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('ยืนยันการลบ')).toBeVisible()
    await dialog.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('tab', { name: 'ใบเสร็จทั้งหมด (1)' })).toBeVisible()

    await deleteButton.click()
    await page.getByRole('dialog').getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(page.getByText('ลบใบเสร็จสำเร็จ')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'ใบเสร็จทั้งหมด (0)' })).toBeVisible()
  })

  test('success: ลบสินค้าต้องผ่าน modal ยืนยันที่ระบุชื่อสินค้า', async ({ page }) => {
    await page.goto('/stock/products')
    const row = page.getByRole('row', { name: new RegExp(productName) })
    await row.getByRole('button', { name: 'ลบ' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(`คุณแน่ใจหรือไม่ที่จะลบสินค้า "${productName}"?`)).toBeVisible()
    await dialog.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(row).toBeVisible()
  })
})
