import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// antd Select showSearch: id prop อยู่บน search input โดยตรง
// ใช้ aria-controls ที่ input มีเพื่อหา popup id แล้ว scope option locator ให้อยู่ใน popup นั้น
async function selectOption(page: Page, selectId: string, text: string) {
  const input = page.locator(`#${selectId}`)
  // click parent wrapper เพื่อเปิด dropdown
  await input.locator('..').locator('..').click()
  await input.fill(text)
  // scope option ใน popup ที่ผูกกับ select นี้ (aria-controls = "${selectId}_list")
  const popupId = `${selectId}_list`
  const dropdown = page.locator(`[id="${popupId}"]`).locator('..')
  await dropdown.locator('.ant-select-item-option-content', { hasText: text }).first().click()
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs/, { timeout: 10_000 })
}

// suffix unique ต่อ test เพื่อป้องกัน unique constraint conflict ระหว่าง test runs
async function seedRefData(page: Page, suffix: string) {
  const locGeneral = await page.request.post('/api/locations', {
    data: { name: `E2E_TEST_LOC_GENERAL_${suffix}`, type: 'general' },
  })
  if (!locGeneral.ok()) throw new Error(`seedRefData: create general location failed — ${await locGeneral.text()}`)

  const locFactory = await page.request.post('/api/locations', {
    data: { name: `E2E_TEST_LOC_FACTORY_${suffix}`, type: 'factory' },
  })
  if (!locFactory.ok()) throw new Error(`seedRefData: create factory location failed — ${await locFactory.text()}`)

  const customer = await page.request.post('/api/customers', {
    data: { name: `E2E_TEST_CUST_${suffix}` },
  })
  if (!customer.ok()) throw new Error(`seedRefData: create customer failed — ${await customer.text()}`)

  return {
    locationGeneralId: ((await locGeneral.json()) as { id: string }).id,
    locationFactoryId: ((await locFactory.json()) as { id: string }).id,
    customerId: ((await customer.json()) as { id: string }).id,
    locGeneralName: `E2E_TEST_LOC_GENERAL_${suffix}`,
    locFactoryName: `E2E_TEST_LOC_FACTORY_${suffix}`,
    customerName: `E2E_TEST_CUST_${suffix}`,
  }
}

function cleanup() {
  execSync('npx tsx e2e/scripts/cleanup-settings.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ราคาน้ำมัน (FuelPriceLog)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('ราคาน้ำมัน — CRUD', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  test.afterEach(() => cleanup())

  test('Case 1: เพิ่มราคาน้ำมัน → แสดงในตาราง', async ({ page }) => {
    await page.goto('/jobs/settings/fuel-price')
    await expect(page.getByText('บันทึกราคาน้ำมัน')).toBeVisible()

    await page.getByTestId('fuel-price-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.locator('#fuel-price-effective-date').fill('01/12/2099')
    await page.locator('#fuel-price-effective-date').press('Tab')

    await page.getByTestId('fuel-price-per-liter-input').click()
    await page.getByTestId('fuel-price-per-liter-input').fill('42.50')
    await page.getByTestId('fuel-price-note-input').fill('ราคาน้ำมัน E2E Test')

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('42.50')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('ราคาน้ำมัน E2E Test')).toBeVisible()
  })

  test('Case 2: validation — ส่ง form เปล่าต้องแสดง error', async ({ page }) => {
    await page.goto('/jobs/settings/fuel-price')
    await page.getByTestId('fuel-price-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(dialog.getByText('กรุณาเลือกวันที่')).toBeVisible({ timeout: 3_000 })
    await expect(dialog.getByText('กรุณากรอกราคาน้ำมัน')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('Case 3: แก้ไขราคาน้ำมัน → ค่าใหม่ปรากฏในตาราง', async ({ page }) => {
    const res = await page.request.post('/api/fuel-price-log', {
      data: { effectiveDate: '2099-12-02', pricePerLiter: 40.00, note: 'before edit' },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/fuel-price')
    await expect(page.getByText('40.00')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId(`fuel-price-edit-btn-${id}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const priceInput = page.getByTestId('fuel-price-per-liter-input')
    await priceInput.click({ clickCount: 3 })
    await priceInput.fill('45.75')

    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('แก้ไขสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('45.75')).toBeVisible({ timeout: 5_000 })
  })

  test('Case 4: ลบราคาน้ำมัน → หายออกจากตาราง', async ({ page }) => {
    const res = await page.request.post('/api/fuel-price-log', {
      data: { effectiveDate: '2099-12-03', pricePerLiter: 99.99, note: 'delete me' },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/fuel-price')
    await expect(page.getByText('99.99')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId(`fuel-price-delete-btn-${id}`).click()
    await page.getByRole('button', { name: 'ลบ' }).click()
    await expect(page.getByText('ลบสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('99.99')).not.toBeVisible({ timeout: 5_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. อัตราคาดการณ์โอน (RateTransfer)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('อัตราคาดการณ์โอน — CRUD', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  test.afterEach(() => cleanup())

  test('Case 1: เพิ่มอัตราคาดการณ์โอน → แสดงในตาราง', async ({ page }) => {
    const { locGeneralName } = await seedRefData(page, test.info().testId)

    await page.goto('/jobs/settings/rates/transfer')
    await expect(page.getByText('อัตราคาดการณ์โอน')).toBeVisible()

    await page.getByTestId('rate-transfer-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.locator('#rate-transfer-job-type').click()
    await page.locator('.ant-select-item-option-content', { hasText: 'ขาเข้า' }).click()

    await page.locator('#rate-transfer-size').click()
    await page.locator('.ant-select-item-option-content').filter({ hasText: /^20DC$/ }).click()

    await selectOption(page, 'rate-transfer-location', locGeneralName)

    await page.getByTestId('rate-transfer-pickup-fee-input').fill('1000')
    await page.getByTestId('rate-transfer-return-fee-input').fill('800')

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('1,000')).toBeVisible({ timeout: 5_000 })
  })

  test('Case 2: validation — ส่ง form เปล่าต้องแสดง error', async ({ page }) => {
    await page.goto('/jobs/settings/rates/transfer')
    await page.getByTestId('rate-transfer-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(dialog.getByText('กรุณาเลือกลักษณะงาน')).toBeVisible({ timeout: 3_000 })
    await expect(dialog.getByText('กรุณาเลือก SIZE')).toBeVisible()
    await expect(dialog.getByText('กรุณาเลือกสถานที่')).toBeVisible()
  })

  test('Case 3: แก้ไขค่าธรรมเนียม → ค่าใหม่ปรากฏในตาราง', async ({ page }) => {
    const { locationGeneralId } = await seedRefData(page, test.info().testId)
    const res = await page.request.post('/api/rates/transfer', {
      data: { jobType: 'inbound', size: '20DC', locationId: locationGeneralId, pickupFee: 500, returnFee: 500 },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/rates/transfer')
    await page.getByTestId(`rate-transfer-edit-btn-${id}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const pickupInput = page.getByTestId('rate-transfer-pickup-fee-input')
    await pickupInput.click({ clickCount: 3 })
    await pickupInput.fill('1500')

    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('แก้ไขสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('1,500')).toBeVisible({ timeout: 5_000 })
  })

  test('Case 4: filter ลักษณะงาน → แสดงเฉพาะ record ที่ตรง', async ({ page }) => {
    const suffix = test.info().testId
    const { locationGeneralId } = await seedRefData(page, suffix)
    await page.request.post('/api/rates/transfer', {
      data: { jobType: 'inbound', size: '20DC', locationId: locationGeneralId, pickupFee: 100, returnFee: 100 },
    })
    // location แยกเพื่อหลีกเลี่ยง unique constraint (jobType+size+locationId)
    const loc2 = await page.request.post('/api/locations', {
      data: { name: `E2E_TEST_LOC_GENERAL2_${suffix}`, type: 'general' },
    })
    const loc2Id = ((await loc2.json()) as { id: string }).id
    await page.request.post('/api/rates/transfer', {
      data: { jobType: 'outbound', size: '20DC', locationId: loc2Id, pickupFee: 200, returnFee: 200 },
    })

    await page.goto('/jobs/settings/rates/transfer')
    await page.locator('#rate-transfer-filter-job-type').click()
    await page.locator('.ant-select-item-option-content', { hasText: 'ขาออก' }).click()

    await expect(page.getByRole('cell', { name: 'ขาออก' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('cell', { name: 'ขาเข้า' })).not.toBeVisible()
  })

  test('Case 5: ลบอัตราคาดการณ์โอน → หายออกจากตาราง', async ({ page }) => {
    const { locationGeneralId } = await seedRefData(page, test.info().testId)
    const res = await page.request.post('/api/rates/transfer', {
      data: { jobType: 'mill', size: '40DC', locationId: locationGeneralId, pickupFee: 999, returnFee: 999 },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/rates/transfer')
    await expect(page.getByText('โรงสี')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId(`rate-transfer-delete-btn-${id}`).click()
    await page.getByRole('button', { name: 'ลบ' }).click()
    await expect(page.getByText('ลบสำเร็จ')).toBeVisible({ timeout: 5_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. อัตรารายได้ (RateIncome)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('อัตรารายได้ — CRUD', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  test.afterEach(() => cleanup())

  test('Case 1: เพิ่มอัตรารายได้ → แสดงในตาราง', async ({ page }) => {
    const { locFactoryName, customerName } = await seedRefData(page, test.info().testId)

    await page.goto('/jobs/settings/rates/income')
    await expect(page.getByText('อัตรารายได้')).toBeVisible()

    await page.getByTestId('rate-income-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.locator('#rate-income-job-type').click()
    await page.locator('.ant-select-item-option-content', { hasText: 'ขาเข้า' }).click()

    await page.locator('#rate-income-size').click()
    await page.locator('.ant-select-item-option-content').filter({ hasText: /^20DC$/ }).click()

    await selectOption(page, 'rate-income-factory', locFactoryName)
    await selectOption(page, 'rate-income-customer', customerName)

    await page.getByTestId('rate-income-amount-input').fill('15000')

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('15,000')).toBeVisible({ timeout: 5_000 })
  })

  test('Case 2: validation — ส่ง form เปล่าต้องแสดง error', async ({ page }) => {
    await page.goto('/jobs/settings/rates/income')
    await page.getByTestId('rate-income-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(dialog.getByText('กรุณาเลือกลักษณะงาน')).toBeVisible({ timeout: 3_000 })
    await expect(dialog.getByText('กรุณาเลือก SIZE')).toBeVisible()
    await expect(dialog.getByText('กรุณาเลือกโรงงาน')).toBeVisible()
    await expect(dialog.getByText('กรุณาเลือกลูกค้า')).toBeVisible()
  })

  test('Case 3: แก้ไขรายได้ → ค่าใหม่ปรากฏในตาราง', async ({ page }) => {
    const { locationFactoryId, customerId } = await seedRefData(page, test.info().testId)
    const res = await page.request.post('/api/rates/income', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId: locationFactoryId, customerId, income: 10000 },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/rates/income')
    await expect(page.getByText('10,000')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId(`rate-income-edit-btn-${id}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const incomeInput = page.getByTestId('rate-income-amount-input')
    await incomeInput.click({ clickCount: 3 })
    await incomeInput.fill('12000')

    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('แก้ไขสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('12,000')).toBeVisible({ timeout: 5_000 })
  })

  test('Case 4: เพิ่มช่วงราคาน้ำมัน (surcharge) → ปรากฏใน modal ช่วงราคา', async ({ page }) => {
    const { locationFactoryId, customerId } = await seedRefData(page, test.info().testId)
    const res = await page.request.post('/api/rates/income', {
      data: { jobType: 'outbound', size: '20DC', factoryLocationId: locationFactoryId, customerId, income: 8000 },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/rates/income')
    await expect(page.getByText('8,000')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId(`rate-income-surcharge-btn-${id}`).click()
    const surchargeModal = page.getByRole('dialog')
    await expect(surchargeModal.getByText('ช่วงราคาน้ำมัน → ค่าปรับ Income')).toBeVisible()

    await surchargeModal.getByTestId('surcharge-add-btn').click()
    const formModal = page.locator('.ant-modal').last()
    await expect(formModal.getByText('เพิ่มช่วงราคาน้ำมัน')).toBeVisible()

    await page.getByTestId('surcharge-fuel-min-input').fill('40.00')
    await page.getByTestId('surcharge-fuel-max-input').fill('45.00')
    await page.getByTestId('surcharge-amount-input').fill('500')

    await formModal.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(surchargeModal.getByText('40.00')).toBeVisible({ timeout: 5_000 })
    await expect(surchargeModal.getByText('+500')).toBeVisible()
  })

  test('Case 5: ลบอัตรารายได้ → หายออกจากตาราง', async ({ page }) => {
    const { locationFactoryId, customerId } = await seedRefData(page, test.info().testId)
    const res = await page.request.post('/api/rates/income', {
      data: { jobType: 'towing', size: '20DC', factoryLocationId: locationFactoryId, customerId, income: 5000 },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/rates/income')
    await expect(page.getByText('5,000')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId(`rate-income-delete-btn-${id}`).click()
    await page.getByRole('button', { name: 'ลบ' }).click()
    await expect(page.getByText('ลบสำเร็จ')).toBeVisible({ timeout: 5_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. อัตราค่าเที่ยวคนขับ (RateDriverWage)
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('อัตราค่าเที่ยวคนขับ — CRUD', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  test.afterEach(() => cleanup())

  test('Case 1: เพิ่มค่าเที่ยว (ขาเข้า + โรงงาน) → แสดงในตาราง', async ({ page }) => {
    const { locFactoryName } = await seedRefData(page, test.info().testId)

    await page.goto('/jobs/settings/rates/driver-wage')
    await expect(page.getByText('อัตราค่าเที่ยวคนขับ')).toBeVisible()

    await page.getByTestId('rate-driver-wage-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.locator('#rate-driver-wage-job-type').click()
    await page.locator('.ant-select-item-option-content', { hasText: 'ขาเข้า' }).click()

    await page.locator('#rate-driver-wage-size').click()
    await page.locator('.ant-select-item-option-content').filter({ hasText: /^20DC$/ }).click()

    await selectOption(page, 'rate-driver-wage-factory', locFactoryName)

    await page.getByTestId('rate-driver-wage-amount-input').fill('2500')

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('2,500')).toBeVisible({ timeout: 5_000 })
  })

  test('Case 2: เพิ่มค่าเที่ยวประเภท "ทอยตู้" — ไม่ต้องเลือกโรงงาน', async ({ page }) => {
    await page.goto('/jobs/settings/rates/driver-wage')
    await page.getByTestId('rate-driver-wage-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.locator('#rate-driver-wage-job-type').click()
    await page.locator('.ant-select-item-option-content', { hasText: 'ทอยตู้' }).click()

    await expect(dialog.getByLabel('โรงงาน')).not.toBeVisible()

    await page.locator('#rate-driver-wage-size').click()
    await page.locator('.ant-select-item-option-content').filter({ hasText: /^20DC$/ }).click()

    await page.getByTestId('rate-driver-wage-amount-input').fill('1800')

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('cell', { name: '-' }).first()).toBeVisible({ timeout: 5_000 })
  })

  test('Case 3: validation — ส่ง form เปล่าต้องแสดง error', async ({ page }) => {
    await page.goto('/jobs/settings/rates/driver-wage')
    await page.getByTestId('rate-driver-wage-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(dialog.getByText('กรุณาเลือกลักษณะงาน')).toBeVisible({ timeout: 3_000 })
    await expect(dialog.getByText('กรุณาเลือก SIZE')).toBeVisible()
  })

  test('Case 4: "เบิกล่วงหน้า" ต้องไม่อยู่ใน dropdown ลักษณะงาน', async ({ page }) => {
    await page.goto('/jobs/settings/rates/driver-wage')
    await page.getByTestId('rate-driver-wage-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.locator('#rate-driver-wage-job-type').click()
    await expect(page.locator('.ant-select-item-option-content', { hasText: 'เบิกล่วงหน้า' })).not.toBeVisible()
  })

  test('Case 5: แก้ไขค่าเที่ยว → ค่าใหม่ปรากฏในตาราง', async ({ page }) => {
    const { locationFactoryId } = await seedRefData(page, test.info().testId)
    const res = await page.request.post('/api/rates/driver-wage', {
      data: { jobType: 'inbound', size: '20DC', factoryLocationId: locationFactoryId, driverWage: 2000 },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/rates/driver-wage')
    await expect(page.getByText('2,000')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId(`rate-driver-wage-edit-btn-${id}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const wageInput = page.getByTestId('rate-driver-wage-amount-input')
    await wageInput.click({ clickCount: 3 })
    await wageInput.fill('3000')

    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('แก้ไขสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('3,000')).toBeVisible({ timeout: 5_000 })
  })

  test('Case 6: ลบค่าเที่ยว → หายออกจากตาราง', async ({ page }) => {
    const { locationFactoryId } = await seedRefData(page, test.info().testId)
    const res = await page.request.post('/api/rates/driver-wage', {
      data: { jobType: 'mill', size: '40DC', factoryLocationId: locationFactoryId, driverWage: 1111 },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/rates/driver-wage')
    await expect(page.getByText('1,111')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId(`rate-driver-wage-delete-btn-${id}`).click()
    await page.getByRole('button', { name: 'ลบ' }).click()
    await expect(page.getByText('ลบสำเร็จ')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('1,111')).not.toBeVisible({ timeout: 5_000 })
  })

  test('Case 7: "พื้นเรียบ" → SIZE dropdown แสดงเฉพาะ "truck"', async ({ page }) => {
    await page.goto('/jobs/settings/rates/driver-wage')
    await page.getByTestId('rate-driver-wage-add-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.locator('#rate-driver-wage-job-type').click()
    await page.locator('.ant-select-item-option-content', { hasText: 'พื้นเรียบ' }).click()

    await page.locator('#rate-driver-wage-size').click()
    await expect(page.locator('.ant-select-item-option-content', { hasText: 'truck' })).toBeVisible()
    await expect(page.locator('.ant-select-item-option-content').filter({ hasText: /^20DC$/ })).not.toBeVisible()
  })
})
