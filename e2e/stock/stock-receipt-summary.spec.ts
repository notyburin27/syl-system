import { test, expect, type Page } from '@playwright/test'
import { login, expectJson } from '../renewals/helpers'

type Summary = { revenue: number; profit: number; riceProfit: number; productProfit: number; invoices: { id: string }[] }

const suffix = Date.now()
// ปีไกลในอนาคตที่ spec อื่นไม่ใช้ — ข้อมูลเดือนนี้มาจาก spec นี้เท่านั้น
const YEAR = 2098
const MONTH = 5

async function summary(page: Page, month = MONTH): Promise<Summary> {
  return expectJson<Summary>(await page.request.get(`/api/stock/summary/receipts?year=${YEAR}&month=${month}`))
}

async function post<T>(page: Page, url: string, data: unknown): Promise<T> {
  return expectJson<T>(await page.request.post(url, { data }))
}

// วันครบกำหนดที่หน้าออกใบเสร็จส่งมา = เที่ยงคืนเวลาไทย
const thaiMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`).toISOString()

test.describe('สรุปยอดขายรายเดือน — อ้างอิงวันครบกำหนดชำระของใบเสร็จ', () => {
  const created = { products: [] as string[], stockIns: [] as string[], stockOuts: [] as string[], invoices: [] as string[] }
  let buyerId: string

  test.beforeEach(async ({ page }) => {
    await login(page, 'testadmin', /:\d+\/(?!login)/)
    buyerId = (await post<{ id: string }>(page, '/api/stock/buyers', { name: `E2E สรุป ลูกค้า ${suffix}` })).id
  })

  test.afterEach(async ({ page }) => {
    for (const id of created.invoices) await page.request.delete(`/api/stock/invoices/${id}`)
    for (const id of created.stockOuts) await page.request.delete(`/api/stock/export/${id}`)
    for (const id of created.stockIns) await page.request.delete(`/api/stock/import/${id}`)
    for (const id of created.products) await page.request.delete(`/api/stock/products/${id}`)
    await page.request.delete(`/api/stock/buyers/${buyerId}`)
  })

  test('ยอดขาย/กำไรแยกข้าวสารกับสินค้า นับเฉพาะใบเสร็จที่ครบกำหนดในเดือน', async ({ page }) => {
    const sell = async (name: string, sellingPrice: number, quantity: number, dueYmd: string) => {
      const productId = (await post<{ id: string }>(page, '/api/stock/products', { name, sellingPrice })).id
      created.products.push(productId)
      const si = await post<{ id: string }>(page, '/api/stock/import', {
        productId, purchasePrice: 50, quantity: 10, date: `${YEAR}-04-01T00:00:00.000Z`,
      })
      created.stockIns.push(si.id)
      const so = await post<{ id: string }>(page, '/api/stock/export', {
        buyerId, productId, quantity, sellingPrice, date: `${YEAR}-04-10T00:00:00.000Z`,
      })
      created.stockOuts.push(so.id)
      const inv = await post<{ id: string }>(page, '/api/stock/invoices', {
        buyerId, stockOutIds: [so.id], dueDate: thaiMidnight(dueYmd),
      })
      created.invoices.push(inv.id)
      return inv.id
    }

    // ครบกำหนดวันแรกของเดือน (UTC ยังเป็นเดือนก่อน) → ต้องนับในเดือนนี้
    const riceInv = await sell(`ข้าว E2E สรุป ${suffix}`, 80, 2, `${YEAR}-05-01`) // กำไร 60
    // ครบกำหนดวันสุดท้ายของเดือน → นับ
    const otherInv = await sell(`E2E สรุป สินค้า ${suffix}`, 100, 1, `${YEAR}-05-31`) // กำไร 50
    // ครบกำหนดเดือนถัดไป → ไม่นับ
    const nextInv = await sell(`E2E สรุป เดือนหน้า ${suffix}`, 100, 3, `${YEAR}-06-01`)

    const s = await summary(page)
    expect(s.invoices.map(i => i.id).sort()).toEqual([riceInv, otherInv].sort())
    expect(s.revenue).toBeCloseTo(260)
    expect(s.profit).toBeCloseTo(110)
    expect(s.riceProfit).toBeCloseTo(60)
    expect(s.productProfit).toBeCloseTo(50)
    expect((await summary(page, 6)).invoices.map(i => i.id)).toContain(nextInv)

    await page.goto('/stock/summary')
    await page.locator('#receipt-summary-month').click()
    await page.locator('#receipt-summary-month').fill(`0${MONTH}/${YEAR}`)
    await page.locator('#receipt-summary-month').press('Enter')

    const card = (title: string) => page.locator('.ant-statistic').filter({ has: page.getByText(title, { exact: true }) })
    await expect(card('ขายได้ทั้งหมด')).toContainText('260.00')
    await expect(card('กำไรทั้งหมด')).toContainText('110.00')
    await expect(card('กำไรสินค้า')).toContainText('50.00')
    await expect(card('กำไรข้าวสาร')).toContainText('60.00')
  })
})
