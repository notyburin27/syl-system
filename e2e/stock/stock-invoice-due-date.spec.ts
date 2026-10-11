import { test, expect, type Page } from '@playwright/test'
import dayjs from 'dayjs'
import { login, expectJson } from '../renewals/helpers'
import { nextMonthDueDate } from '../../lib/utils/dueDate'

type InvoiceRow = { id: string; dueDate: string | null }

const suffix = Date.now()
const productName = `E2E ครบกำหนด ${suffix}`
const buyerName = `E2E ลูกค้าครบกำหนด ${suffix}`

test.describe('ออกใบเสร็จ — วันครบกำหนดชำระ', () => {
  let productId: string
  let buyerId: string
  let stockInId: string
  let stockOutId: string

  const post = async <T,>(page: Page, url: string, data: object) =>
    expectJson<T>(await page.request.post(url, { data }))

  const invoices = async (page: Page) =>
    expectJson<InvoiceRow[]>(await page.request.get(`/api/stock/invoices?buyerId=${buyerId}`))

  // เลือกรายการขายแล้วกด "ออกใบเสร็จ" → คืน dialog
  async function openInvoiceModal(page: Page) {
    await page.goto(`/stock/buyers/${buyerId}`)
    const row = page.getByRole('row', { name: new RegExp(productName) })
    await expect(async () => {
      await row.getByRole('checkbox').check()
      await expect(page.getByRole('button', { name: 'ออกใบเสร็จ' })).toBeVisible({ timeout: 2000 })
    }).toPass()
    await page.getByRole('button', { name: 'ออกใบเสร็จ' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('วันครบกำหนดชำระ')).toBeVisible()
    return dialog
  }

  test.beforeEach(async ({ page }) => {
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    productId = (await post<{ id: string }>(page, '/api/stock/products', { name: productName, sellingPrice: 100 })).id
    buyerId = (await post<{ id: string }>(page, '/api/stock/buyers', { name: buyerName })).id
    stockInId = (await post<{ id: string }>(page, '/api/stock/import', {
      productId, purchasePrice: 50, quantity: 5, date: '2099-01-01T00:00:00.000Z',
    })).id
    stockOutId = (await post<{ id: string }>(page, '/api/stock/export', {
      productId, buyerId, quantity: 1, sellingPrice: 100, date: '2099-01-02T00:00:00.000Z',
    })).id
  })

  test.afterEach(async ({ page }) => {
    for (const inv of await invoices(page)) await page.request.delete(`/api/stock/invoices/${inv.id}`)
    await page.request.delete(`/api/stock/export/${stockOutId}`)
    await page.request.delete(`/api/stock/import/${stockInId}`)
    await page.request.delete(`/api/stock/products/${productId}`)
    await page.request.delete(`/api/stock/buyers/${buyerId}`)
  })

  test('success: ตั้งค่าเริ่มต้นที่ลูกค้า → โมดัลออกใบเสร็จเติมวันที่ของเดือนถัดไปให้', async ({ page }) => {
    await page.goto('/stock/buyers')
    const buyerRow = page.getByRole('row', { name: new RegExp(buyerName) })
    await expect(async () => {
      await buyerRow.getByRole('button', { name: 'แก้ไข' }).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 })
    }).toPass()
    const editDialog = page.getByRole('dialog')
    await editDialog.locator('#defaultDueDay').fill('5')
    await editDialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('แก้ไขลูกค้าสำเร็จ')).toBeVisible()

    const expected = nextMonthDueDate(5).format('DD/MM/YYYY')
    const dialog = await openInvoiceModal(page)
    await expect(dialog.locator('#invoice-due-date')).toHaveValue(expected)
    await expect(dialog.getByText('ค่าเริ่มต้นของลูกค้านี้: วันที่ 5 ของเดือนถัดไป')).toBeVisible()
    await dialog.getByRole('button', { name: 'ออกใบเสร็จ' }).click()

    await expect(page.getByText('ออกใบเสร็จสำเร็จ')).toBeVisible()
    const [invoice] = await invoices(page)
    expect(dayjs(invoice.dueDate).format('DD/MM/YYYY')).toBe(expected)
    await page.getByRole('tab', { name: /ใบเสร็จทั้งหมด/ }).click()
    await expect(page.getByRole('row', { name: new RegExp(invoice.id.slice(-8).toUpperCase()) })).toContainText(expected)
  })

  test('fail: ลูกค้าไม่มีค่าเริ่มต้นและไม่เลือกวัน → ออกใบเสร็จไม่ได้', async ({ page }) => {
    const dialog = await openInvoiceModal(page)
    await expect(dialog.locator('#invoice-due-date')).toHaveValue('')
    await dialog.getByRole('button', { name: 'ออกใบเสร็จ' }).click()

    await expect(dialog.getByText('กรุณาเลือกวันครบกำหนดชำระ')).toBeVisible()
    expect(await invoices(page)).toHaveLength(0)
  })

  test('fail: API ไม่ส่ง dueDate → 400 / defaultDueDay นอกช่วง 1–31 → 400', async ({ page }) => {
    const noDue = await page.request.post('/api/stock/invoices', { data: { buyerId, stockOutIds: [stockOutId] } })
    expect(noDue.status()).toBe(400)
    expect((await noDue.json()).error).toBe('กรุณาเลือกวันครบกำหนดชำระ')

    const badDay = await page.request.patch(`/api/stock/buyers/${buyerId}`, { data: { defaultDueDay: 32 } })
    expect(badDay.status()).toBe(400)
  })
})
