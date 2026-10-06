import { test, expect, type Page } from '@playwright/test'
import { addDays, addYears, todayInBangkok } from '../../lib/renewals/dateOnly'
import { endOfNextMonth } from '../../lib/renewals/dueWindow'
import {
  cleanupRenewals,
  createCoverage,
  createInsurer,
  createVehicle,
  getVehicleDetail,
  login,
  toPickerText,
} from './helpers'

const countOf = (page: Page, key: string) => page.getByTestId(`count-${key}`).locator('.ant-statistic-content-value')
const rowOf = (page: Page, id: string) => page.locator(`tr[data-row-key="${id}"]`)

test.describe.serial('Dashboard ต่ออายุรถ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('แสดงเฉพาะงวดที่หมดภายในสิ้นเดือนหน้า แยกสีตามช่วง (ค้นหาทะเบียนแบบมีจุดท้ายได้)', async ({ page }) => {
    const today = todayInBangkok()
    const vid = await createVehicle(page, 'E2E-3001 กท')
    const overdue = await createCoverage(page, vid, 'PRB', addDays(today, -5))
    const thisMonth = await createCoverage(page, vid, 'TAX', today)
    const nextMonth = await createCoverage(page, vid, 'MOTOR_INSURANCE', endOfNextMonth(today))
    const later = await createCoverage(page, vid, 'CARGO_INSURANCE', addDays(endOfNextMonth(today), 1))

    await page.reload()
    await page.getByPlaceholder('ค้นหาทะเบียน/เบอร์รถ').fill('E2E-3001 กท.')
    await expect(countOf(page, 'OVERDUE')).toHaveText('1')
    await expect(countOf(page, 'THIS_MONTH')).toHaveText('1')
    await expect(countOf(page, 'NEXT_MONTH')).toHaveText('1')
    await expect(page.getByTestId(`due-tag-${overdue}`)).toHaveClass(/ant-tag-red/)
    await expect(page.getByTestId(`due-tag-${thisMonth}`)).toHaveClass(/ant-tag-orange/)
    await expect(page.getByTestId(`due-tag-${nextMonth}`)).toHaveClass(/ant-tag-blue/)
    await expect(rowOf(page, later)).toHaveCount(0)
  })

  test('ต่อแล้วทีละคัน: ค่าเริ่มต้นมาจากงวดเดิม และรายการหายจาก dashboard', async ({ page }) => {
    const today = todayInBangkok()
    const insurerId = await createInsurer(page, 'E2E ประกันภัย D')
    const vid = await createVehicle(page, 'E2E-3002 กท')
    const cid = await createCoverage(page, vid, 'MOTOR_INSURANCE', today, { insurerId, coverageClass: 'ป.3', amount: 19900 })

    await page.reload()
    await page.getByTestId(`renew-btn-${cid}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('#coverage-amount')).toHaveValue('19900.00')
    await expect(dialog.locator('#coverage-end-date')).toHaveValue(toPickerText(addYears(today, 1)))
    await dialog.getByTestId('coverage-policy-input').fill('E2E-POL-1')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    await expect(rowOf(page, cid)).toHaveCount(0)
    const renewed = (await getVehicleDetail(page, vid)).coverages.find((c) => c.id !== cid)
    expect(renewed).toMatchObject({
      policyNumber: 'E2E-POL-1',
      insurerId,
      coverageClass: 'ป.3',
      amount: 19900,
      startDate: addDays(today, 1),
      endDate: addYears(today, 1),
    })
  })

  test('ไม่ต่อพร้อมเหตุผล → รายการหายจาก dashboard', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-3003 กท')
    const cid = await createCoverage(page, vid, 'TAX', todayInBangkok())

    await page.reload()
    await page.getByTestId(`not-renew-btn-${cid}`).click()
    await page.locator('#not-renew-reason').click()
    await page.locator('.ant-select-item-option', { hasText: 'รถซ่อม' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()

    await expect(rowOf(page, cid)).toHaveCount(0)
    expect((await getVehicleDetail(page, vid)).coverages[0]).toMatchObject({
      renewalStatus: 'NOT_RENEWED',
      notRenewedReason: 'REPAIR',
    })
  })

  test('เลือกหลายแถว: กำลังดำเนินการ แล้วต่อแล้วพร้อมกัน', async ({ page }) => {
    const today = todayInBangkok()
    const c1 = await createCoverage(page, await createVehicle(page, 'E2E-3104 กท'), 'PRB', today)
    const c2 = await createCoverage(page, await createVehicle(page, 'E2E-3105 กท'), 'PRB', today)

    await page.reload()
    await page.getByPlaceholder('ค้นหาทะเบียน/เบอร์รถ').fill('E2E-310')
    for (const id of [c1, c2]) await rowOf(page, id).locator('.ant-checkbox-input').check()
    await page.getByTestId('bulk-in-progress-btn').click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    for (const id of [c1, c2]) await expect(page.getByTestId(`status-tag-${id}`)).toHaveText('กำลังดำเนินการ')
    await expect(countOf(page, 'IN_PROGRESS')).toHaveText('2')

    for (const id of [c1, c2]) await rowOf(page, id).locator('.ant-checkbox-input').check()
    await page.getByTestId('bulk-renew-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('#bulk-renew-end-date')).toHaveValue(toPickerText(addYears(today, 1)))
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    for (const id of [c1, c2]) await expect(rowOf(page, id)).toHaveCount(0)
  })
})
