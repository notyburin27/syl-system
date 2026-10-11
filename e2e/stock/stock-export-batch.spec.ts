import { test, expect, type Page } from '@playwright/test'
import { login, expectJson } from '../renewals/helpers'

type StockOutRow = { id: string; buyerId: string; productId: string; quantity: number; sellingPrice: number }

const suffix = Date.now()
const nameA = `E2E ขายชุด A ${suffix}`
const nameB = `E2E ขายชุด B ${suffix}`
const buyerName = `E2E ผู้ซื้อชุด ${suffix}`

// กดซ้ำจนโมดัลเปิด — คลิกแรกอาจเกิดก่อนหน้า hydrate เสร็จ
async function openSaleModal(page: Page) {
  await page.goto('/stock/export')
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    await page.getByRole('button', { name: 'ขายสินค้า' }).click()
    await expect(dialog).toBeVisible({ timeout: 2000 })
  }).toPass()
  return dialog
}

async function pickOption(page: Page, selectId: string, text: string) {
  await page.locator(`#${selectId}`).click({ force: true })
  await page.locator(`#${selectId}`).fill(text)
  await page.locator('.ant-select-item-option', { hasText: text }).click()
}

test.describe('ขายสินค้า — บันทึกหลายรายการในครั้งเดียว', () => {
  let productA: string
  let productB: string
  let buyerId: string
  const stockInIds: string[] = []

  test.beforeEach(async ({ page }) => {
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    const post = async <T,>(url: string, data: object) => expectJson<T>(await page.request.post(url, { data }))

    productA = (await post<{ id: string }>('/api/stock/products', { name: nameA, sellingPrice: 150 })).id
    productB = (await post<{ id: string }>('/api/stock/products', { name: nameB, sellingPrice: 80 })).id
    buyerId = (await post<{ id: string }>('/api/stock/buyers', { name: buyerName })).id
    for (const productId of [productA, productB]) {
      stockInIds.push((await post<{ id: string }>('/api/stock/import', {
        productId, purchasePrice: 50, quantity: 5, date: '2099-01-01T00:00:00.000Z',
      })).id)
    }
  })

  test.afterEach(async ({ page }) => {
    const outs = await expectJson<StockOutRow[]>(await page.request.get('/api/stock/export'))
    for (const so of outs.filter(o => o.buyerId === buyerId)) {
      await page.request.delete(`/api/stock/export/${so.id}`)
    }
    for (const id of stockInIds.splice(0)) await page.request.delete(`/api/stock/import/${id}`)
    await page.request.delete(`/api/stock/products/${productA}`)
    await page.request.delete(`/api/stock/products/${productB}`)
    await page.request.delete(`/api/stock/buyers/${buyerId}`)
  })

  test('success: เพิ่ม 2 แถว → ราคาเติมจากสินค้า ยอดรวมถูก บันทึกได้ 2 รายการ', async ({ page }) => {
    const dialog = await openSaleModal(page)

    await pickOption(page, 'buyerId', buyerName)
    await pickOption(page, 'items_0_productId', nameA)
    await expect(dialog.locator('#items_0_sellingPrice')).toHaveValue('150')
    await dialog.locator('#items_0_quantity').fill('2')

    await dialog.getByRole('button', { name: 'เพิ่มรายการ' }).click()
    await pickOption(page, 'items_1_productId', nameB)
    await dialog.locator('#items_1_quantity').fill('1')

    await expect(dialog.getByText('รวมทั้งสิ้น 380.00 บาท')).toBeVisible()
    await dialog.getByRole('button', { name: 'บันทึก 2 รายการ' }).click()
    await expect(page.getByText('ขายสินค้าสำเร็จ 2 รายการ')).toBeVisible()

    const outs = (await expectJson<StockOutRow[]>(await page.request.get('/api/stock/export')))
      .filter(o => o.buyerId === buyerId)
    expect(outs.map(o => [o.productId, o.quantity, o.sellingPrice]).sort()).toEqual(
      [[productA, 2, 150], [productB, 1, 80]].sort(),
    )
  })

  test('fail: สินค้าเดียวกันหลายแถวรวมเกินคงเหลือ → 400 และไม่บันทึกสักรายการ', async ({ page }) => {
    const res = await page.request.post('/api/stock/export', {
      data: {
        buyerId,
        date: '2099-01-02T00:00:00.000Z',
        items: [
          { productId: productB, quantity: 1, sellingPrice: 80 },
          { productId: productA, quantity: 3, sellingPrice: 150 },
          { productId: productA, quantity: 3, sellingPrice: 150 },
        ],
      },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe(`สินค้า "${nameA}" คงเหลือไม่เพียงพอ (คงเหลือ 5 ชิ้น)`)

    const outs = (await expectJson<StockOutRow[]>(await page.request.get('/api/stock/export')))
      .filter(o => o.buyerId === buyerId)
    expect(outs).toHaveLength(0)
  })

  test('fail: แถวไม่มีสินค้า → modal ไม่ส่ง และแสดงข้อความให้เลือกสินค้า', async ({ page }) => {
    const dialog = await openSaleModal(page)

    await pickOption(page, 'buyerId', buyerName)
    await dialog.getByRole('button', { name: 'บันทึก 1 รายการ' }).click()
    await expect(dialog.getByText('กรุณาเลือกสินค้า')).toBeVisible()
    await expect(dialog).toBeVisible()
  })
})
