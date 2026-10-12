import { test, expect, type Page } from '@playwright/test'
import { login, expectJson } from '../renewals/helpers'

type Summary = { revenue: number; cost: number; profit: number; stockValue: number }

const suffix = Date.now()
// เดือนไกลในอนาคต — ยอดขาย/กำไรของเดือนนี้มาจากข้อมูลของ spec นี้เท่านั้น
const YEAR = 2099
const MONTH = 3

async function summary(page: Page): Promise<Summary> {
  return expectJson<Summary>(await page.request.get(`/api/stock/summary?year=${YEAR}&month=${MONTH}`))
}

async function post<T>(page: Page, url: string, data: unknown): Promise<T> {
  return expectJson<T>(await page.request.post(url, { data }))
}

test.describe('ภาพรวมคลังสินค้า — กำไรจากสินค้าที่ขาย และมูลค่าสต๊อกคงค้าง', () => {
  const created = { stockIns: [] as string[], stockOuts: [] as string[], invoices: [] as string[] }
  let productId: string
  let buyerId: string

  test.beforeEach(async ({ page }) => {
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    productId = (await post<{ id: string }>(page, '/api/stock/products', { name: `E2E กำไร ${suffix}`, sellingPrice: 100 })).id
    buyerId = (await post<{ id: string }>(page, '/api/stock/buyers', { name: `E2E กำไร ลูกค้า ${suffix}` })).id
  })

  test.afterEach(async ({ page }) => {
    for (const id of created.invoices) await page.request.delete(`/api/stock/invoices/${id}`)
    for (const id of created.stockOuts) await page.request.delete(`/api/stock/export/${id}`)
    for (const id of created.stockIns) await page.request.delete(`/api/stock/import/${id}`)
    await page.request.delete(`/api/stock/products/${productId}`)
    await page.request.delete(`/api/stock/buyers/${buyerId}`)
  })

  test('กำไร = ยอดขาย − (จำนวนขาย × ต้นทุนเฉลี่ย), ไม่หักของที่ซื้อแต่ยังไม่ขาย', async ({ page }) => {
    const before = await summary(page)

    // ซื้อ 10 ชิ้น @50 + 10 ชิ้น @70 ในเดือนเดียวกัน → ต้นทุนเฉลี่ย 60
    for (const purchasePrice of [50, 70]) {
      const si = await post<{ id: string }>(page, '/api/stock/import', {
        productId, purchasePrice, quantity: 10, date: `${YEAR}-0${MONTH}-05T00:00:00.000Z`,
      })
      created.stockIns.push(si.id)
    }
    // ขาย 5 ชิ้น @100
    const so = await post<{ id: string }>(page, '/api/stock/export', {
      buyerId, productId, quantity: 5, sellingPrice: 100, date: `${YEAR}-0${MONTH}-10T00:00:00.000Z`,
    })
    created.stockOuts.push(so.id)

    const after = await summary(page)
    expect(after.revenue - before.revenue).toBeCloseTo(500)
    expect(after.cost - before.cost).toBeCloseTo(300)
    expect(after.profit - before.profit).toBeCloseTo(200)
    // คงเหลือ 15 ชิ้น × 60
    expect(after.stockValue - before.stockValue).toBeCloseTo(900)

    await page.goto('/stock')
    await expect(page.getByText('มูลค่าสต๊อกคงค้าง (ราคาทุน)')).toBeVisible()
  })

  test('รายการลูกค้า: แสดงวันครบกำหนดที่ใกล้ที่สุดของใบเสร็จที่ยังไม่ชำระ', async ({ page }) => {
    const si = await post<{ id: string }>(page, '/api/stock/import', {
      productId, purchasePrice: 50, quantity: 10, date: `${YEAR}-0${MONTH}-05T00:00:00.000Z`,
    })
    created.stockIns.push(si.id)

    for (const [day, due] of [[10, '2099-05-20'], [11, '2099-04-15']] as const) {
      const so = await post<{ id: string }>(page, '/api/stock/export', {
        buyerId, productId, quantity: 1, sellingPrice: 100, date: `${YEAR}-0${MONTH}-${day}T00:00:00.000Z`,
      })
      created.stockOuts.push(so.id)
      const inv = await post<{ id: string }>(page, '/api/stock/invoices', {
        buyerId, stockOutIds: [so.id], dueDate: `${due}T00:00:00.000Z`,
      })
      created.invoices.push(inv.id)
    }

    await page.goto('/stock/buyers')
    await expect(page.getByRole('columnheader', { name: 'เบอร์โทร' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'วันครบกำหนดชำระ' })).toBeVisible()
    const row = page.getByRole('row', { name: new RegExp(`E2E กำไร ลูกค้า ${suffix}`) })
    await expect(row).toContainText('15/04/2099')
  })
})
