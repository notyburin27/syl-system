import { test, expect } from '@playwright/test'
import { cleanupRenewals, createCoverage, createVehicle, fillDate, getVehicleDetail, login } from './helpers'

test.describe.serial('หน้าทะเบียนรถ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('เพิ่มรถผ่านหน้าจอ: ทะเบียน normalize และกดเข้าไปดูรายละเอียดได้', async ({ page }) => {
    await page.goto('/renewals/vehicles')
    await page.getByTestId('vehicle-add-btn').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('vehicle-plate-input').fill(' E2E-5001  กท. ')
    await page.locator('#vehicle-owner').fill('E2E บริษัท')
    await page.locator('#vehicle-type').fill('ลากจูง')
    await dialog.locator('.ant-modal-title').click() // ปิด dropdown ของ AutoComplete
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    const link = page.getByRole('link', { name: 'E2E-5001 กท', exact: true })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page.getByRole('heading', { name: 'E2E-5001 กท' })).toBeVisible()
  })

  test('เพิ่มงวดจากหน้ารถ → งวดใหม่กว่าทำให้งวดเก่าเป็นต่อแล้ว → ลบงวดใหม่ → กลับเป็นรอต่อ', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5002 กท')
    await page.goto(`/renewals/vehicles/${vid}`)

    await page.getByTestId('coverage-add-btn').click() // แท็บเริ่มต้น = พรบ.
    await fillDate(page, '#coverage-end-date', '2026-03-31')
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
    await expect.poll(async () => (await getVehicleDetail(page, vid)).coverages.length).toBe(1)
    const oldId = (await getVehicleDetail(page, vid)).coverages[0].id
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('รอต่อ')

    await page.getByTestId('coverage-add-btn').click()
    await fillDate(page, '#coverage-end-date', '2027-03-31')
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('ต่อแล้ว')

    const newId = (await getVehicleDetail(page, vid)).coverages.find((c) => c.id !== oldId)!.id
    await page.getByTestId(`coverage-delete-btn-${newId}`).click()
    await page.getByRole('button', { name: 'ลบ', exact: true }).click()
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('รอต่อ')
  })

  test('เปลี่ยนรถเป็นขาย (ยืนยัน) → งวดเปิดเป็นไม่ต่อ (ขายรถ)', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5003 กท')
    const cid = await createCoverage(page, vid, 'PRB', '2027-03-31')
    await page.goto(`/renewals/vehicles/${vid}`)

    await page.getByTestId('vehicle-detail-edit-btn').click()
    await page.locator('.ant-select', { has: page.locator('#vehicle-status') }).click() // มีค่าอยู่แล้ว → selection-item บัง input
    await page.locator('.ant-select-item-option', { hasText: 'ขาย' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(page.getByTestId(`coverage-status-${cid}`)).toHaveText('ไม่ต่อ (ขายรถ)')
  })

  test('งวดไม่ต่อของรถที่ใช้งาน → เปิดใหม่ได้', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5004 กท')
    const cid = await createCoverage(page, vid, 'TAX', '2027-06-30')
    await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [cid], status: 'NOT_RENEWED', reason: 'REPAIR' },
    })
    await page.goto(`/renewals/vehicles/${vid}`)
    await page.getByRole('tab', { name: /ภาษี/ }).click()
    await page.getByTestId(`coverage-reopen-btn-${cid}`).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(page.getByTestId(`coverage-status-${cid}`)).toHaveText('รอต่อ')
  })
})
