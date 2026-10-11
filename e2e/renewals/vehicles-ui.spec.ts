import { test, expect } from '@playwright/test'
import type { AttachmentDto } from '../../types/renewals'
import { cleanupRenewals, createCoverage, createVehicle, expectJson, fillDate, getVehicleDetail, login } from './helpers'

// PNG 1x1
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

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

    const row = page.getByRole('row', { name: /E2E-5001 กท/ })
    await expect(row).toBeVisible()
    await expect(row.locator('.ant-tag')).toHaveText('เพิ่ม') // รถใหม่เริ่มที่สถานะ "เพิ่ม"
    for (const name of ['ลักษณะ', 'ยี่ห้อ']) await expect(page.getByRole('columnheader', { name, exact: true })).toHaveCount(0)
    await row.getByRole('button', { name: 'แก้ไขข้อมูล' }).click()
    await expect(dialog.getByTestId('vehicle-plate-input')).toHaveValue('E2E-5001 กท')
    await dialog.getByRole('button', { name: 'ยกเลิก' }).click()
    await row.getByRole('button', { name: 'ดูรายละเอียด' }).click()
    await expect(page.getByRole('heading', { name: 'E2E-5001 กท' })).toBeVisible()
  })

  test('เพิ่มรถพร้อมข้อมูลเล่มทะเบียน + แนบเอกสารสำเนารถ → หน้ารถแสดงครบ → ลบเอกสาร → ลบรถได้', async ({ page }) => {
    await page.goto('/renewals/vehicles')
    await page.getByTestId('vehicle-add-btn').click()
    const dialog = page.getByRole('dialog')
    await fillDate(page, '#vehicle-registration-date', '2020-05-01')
    await dialog.getByTestId('vehicle-plate-input').fill('E2E-5005')
    await page.locator('#vehicle-plate-province').fill('ชลบุ')
    await page.locator('.ant-select-item-option', { hasText: 'ชลบุรี' }).click()
    await page.locator('#vehicle-owner').fill('E2E บริษัท')
    await page.locator('#vehicle-type').fill('ลากจูง')
    await dialog.locator('.ant-modal-title').click() // ปิด dropdown ของ AutoComplete
    await dialog.getByTestId('vehicle-model-input').fill('R450')
    await dialog.getByTestId('vehicle-color-input').fill('ขาว')
    await dialog.getByTestId('vehicle-chassis-input').fill('YS2R4X20005412345')
    await dialog.getByTestId('vehicle-chassis-position-input').fill('โครงคัสซีขวา')
    await dialog.getByTestId('vehicle-engine-number-input').fill('DC13 148 L01')
    await page.locator('#vehicle-engine-cylinders').fill('6')
    await page.locator('#vehicle-engine-horsepower').fill('450')
    await page.locator('#vehicle-axle-count').fill('3')
    await page.locator('#vehicle-location').click()
    await page.locator('.ant-select-item-option', { hasText: 'โรงสี' }).click()
    await dialog.locator('input[type=file]').setInputFiles({ name: 'สำเนาเล่มทะเบียน.png', mimeType: 'image/png', buffer: PNG })
    await expect(dialog.getByText('สำเนาเล่มทะเบียน.png')).toBeVisible()
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    const listRow = page.getByRole('row', { name: /E2E-5005/ })
    await expect(listRow).toContainText('โรงสี')
    // กรองรถอยู่ไหน = โรงสี → เหลือเฉพาะรถที่อยู่โรงสี (E2E-5001 จาก test ก่อนหน้าไม่ได้ระบุ)
    await page.locator('#vehicle-location-filter').click()
    await page.locator('.ant-select-item-option', { hasText: 'โรงสี' }).click()
    await expect(listRow).toBeVisible()
    await expect(page.getByRole('row', { name: /E2E-5001/ })).toHaveCount(0)
    await listRow.getByRole('button', { name: 'ดูรายละเอียด' }).click()
    await expect(page.getByRole('heading', { name: 'E2E-5005' })).toBeVisible()
    const vid = page.url().split('/').pop()!
    const { vehicle } = await getVehicleDetail(page, vid)
    expect(vehicle).toMatchObject({
      registrationDate: '2020-05-01',
      plateProvince: 'ชลบุรี',
      modelName: 'R450',
      color: 'ขาว',
      chassisNumber: 'YS2R4X20005412345',
      chassisPosition: 'โครงคัสซีขวา',
      engineNumber: 'DC13 148 L01',
      engineCylinders: 6,
      engineHorsepower: 450,
      axleCount: 3,
      currentLocation: 'โรงสี',
    })
    await expect(page.getByText('6 สูบ 450 แรงม้า 3 เพลา')).toBeVisible()
    await expect(page.getByText('โรงสี')).toBeVisible()

    // ล้างรถอยู่ไหน → null
    await page.getByTestId('vehicle-detail-edit-btn').click()
    const locationSelect = dialog.locator('.ant-select', { has: page.locator('#vehicle-location') })
    await locationSelect.hover()
    await locationSelect.locator('.ant-select-clear').click()
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(dialog).toBeHidden()
    expect((await getVehicleDetail(page, vid)).vehicle.currentLocation).toBeNull()

    const docs = page.getByTestId('vehicle-docs')
    await expect(docs.getByRole('link', { name: 'สำเนาเล่มทะเบียน.png' })).toBeVisible()
    const [doc] = await expectJson<AttachmentDto[]>(await page.request.get(`/api/renewals/vehicles/${vid}/attachments`))
    const file = await page.request.get(`/api/renewals/vehicle-attachments/${doc.id}`)
    expect(file.headers()['content-type']).toBe('image/png')
    expect(Buffer.from(await file.body()).equals(PNG)).toBe(true)

    await docs.getByTestId(`attachment-delete-btn-${doc.id}`).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(docs.getByRole('link', { name: 'สำเนาเล่มทะเบียน.png' })).toHaveCount(0)

    // อัปโหลดจากหน้ารถแล้วลบรถ → เอกสารลบตาม
    await docs.locator('input[type=file]').setInputFiles({ name: 'เล่ม.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') })
    await expect(docs.getByRole('link', { name: 'เล่ม.pdf' })).toBeVisible()
    const [pdf] = await expectJson<AttachmentDto[]>(await page.request.get(`/api/renewals/vehicles/${vid}/attachments`))
    await page.getByTestId('vehicle-detail-delete-btn').click()
    await page.getByRole('button', { name: 'ลบ', exact: true }).click()
    await expect(page).toHaveURL(/\/renewals\/vehicles$/)
    expect((await page.request.get(`/api/renewals/vehicle-attachments/${pdf.id}`)).status()).toBe(404)
  })

  test('เพิ่มงวดจากหน้ารถ → งวดใหม่กว่าทำให้งวดเก่าเป็นต่อแล้ว → ลบงวดใหม่ → กลับเป็นรอต่อ', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5002 กท')
    await page.goto(`/renewals/vehicles/${vid}`)

    // ปุ่มแยกตามประเภท → สลับแท็บและเปิดฟอร์มของประเภทนั้น
    await page.getByTestId('coverage-add-btn-TAX').click()
    await expect(page.getByRole('dialog')).toContainText('เพิ่มงวดภาษี')
    await expect(page.getByRole('tab', { name: /ภาษี/ })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('dialog').getByRole('button', { name: 'ยกเลิก' }).click()

    await page.getByTestId('coverage-add-btn-PRB').click()
    await expect(page.getByRole('dialog')).toContainText('เพิ่มงวดพรบ.')
    // ปฏิทินเมนูนี้แสดงปี พ.ศ.
    await page.locator('#coverage-end-date').click()
    await expect(page.locator('.ant-picker-dropdown .ant-picker-year-btn').first()).toHaveText(String(new Date().getFullYear() + 543))
    await fillDate(page, '#coverage-end-date', '2026-03-31')
    await expect(page.locator('#coverage-end-date')).toHaveValue('31/03/2569')
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
    await expect.poll(async () => (await getVehicleDetail(page, vid)).coverages.length).toBe(1)
    const oldId = (await getVehicleDetail(page, vid)).coverages[0].id
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('รอต่อ')

    await page.getByTestId('coverage-add-btn-PRB').click()
    await fillDate(page, '#coverage-end-date', '2027-03-31')
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('ต่อแล้ว')

    const newId = (await getVehicleDetail(page, vid)).coverages.find((c) => c.id !== oldId)!.id
    await page.getByTestId(`coverage-delete-btn-${newId}`).click()
    await page.getByRole('button', { name: 'ลบ', exact: true }).click()
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('รอต่อ')
  })

  test('เพิ่มงวดประกันรถยนต์: กรอกตัวแทน + แนบกรมธรรม์ → ตารางแสดงตัวแทนและจำนวนไฟล์; ภาษีไม่มีช่องตัวแทน/แนบกรมธรรม์', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5006 กท')
    await page.goto(`/renewals/vehicles/${vid}`)

    await page.getByTestId('coverage-add-btn-TAX').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('เพิ่มงวดภาษี')
    await expect(page.locator('#coverage-agent')).toHaveCount(0)
    await expect(dialog.getByTestId('coverage-attach-btn')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'ยกเลิก' }).click()

    await page.getByTestId('coverage-add-btn-MOTOR_INSURANCE').click()
    await expect(dialog).toContainText('เพิ่มงวดประกันรถยนต์')
    await page.locator('#coverage-agent').fill('E2E ตัวแทนสมชาย')
    await dialog.locator('.ant-modal-title').click() // ปิด dropdown ของ AutoComplete
    await fillDate(page, '#coverage-end-date', '2027-05-31')
    await dialog.locator('input[type=file]').setInputFiles([
      { name: 'กรมธรรม์.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') },
      { name: 'หน้าตาราง.png', mimeType: 'image/png', buffer: PNG },
    ])
    await expect(dialog.getByText('กรมธรรม์.pdf')).toBeVisible()
    await expect(dialog.getByText('หน้าตาราง.png')).toBeVisible()
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(dialog).toBeHidden() // ปิดหลังอัปโหลดไฟล์เสร็จ (งวดถูกสร้างก่อนไฟล์)

    const [coverage] = (await getVehicleDetail(page, vid)).coverages
    expect(coverage).toMatchObject({ type: 'MOTOR_INSURANCE', agentName: 'E2E ตัวแทนสมชาย', attachmentCount: 2 })
    await expect(page.getByRole('cell', { name: 'E2E ตัวแทนสมชาย' })).toBeVisible()
    await expect(page.getByTestId(`attachments-btn-${coverage.id}`)).toHaveText('2')

    // แก้ไขงวด: ตัวแทนเดิมขึ้นในฟอร์ม และแนบเพิ่มได้
    await page.getByTestId(`coverage-edit-btn-${coverage.id}`).click()
    await expect(page.locator('#coverage-agent')).toHaveValue('E2E ตัวแทนสมชาย')
    await dialog.locator('input[type=file]').setInputFiles({ name: 'สลักหลัง.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') })
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByTestId(`attachments-btn-${coverage.id}`)).toHaveText('3')
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

  test('เปลี่ยนรถเป็นงดใช้ + แจ้ง ม.89 ก่อนครบภาษี → ภาษีติ๊กไว้ให้ → ปิดเป็นไม่ต่อ (งดใช้); พรบ. ยังรอต่อ', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5009 กท')
    const tax = await createCoverage(page, vid, 'TAX', '2027-03-31')
    const prb = await createCoverage(page, vid, 'PRB', '2027-03-31')
    await page.goto(`/renewals/vehicles/${vid}`)

    await page.getByTestId('vehicle-detail-edit-btn').click()
    await page.locator('.ant-select', { has: page.locator('#vehicle-status') }).click()
    await page.locator('.ant-select-item-option', { hasText: 'งดใช้' }).click()
    await fillDate(page, '#vehicle-status-date', '2027-01-15')
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()

    const confirm = page.locator('.ant-modal-confirm')
    await expect(confirm.getByRole('checkbox', { name: /^ภาษี/ })).toBeChecked()
    await expect(confirm.getByRole('checkbox', { name: /^พรบ/ })).not.toBeChecked()
    await confirm.getByRole('button', { name: 'ยืนยัน' }).click()

    const statuses = async () =>
      Object.fromEntries((await getVehicleDetail(page, vid)).coverages.map((c) => [c.id, `${c.renewalStatus}/${c.notRenewedReason}`]))
    await expect.poll(statuses).toEqual({ [tax]: 'NOT_RENEWED/SUSPENDED', [prb]: 'PENDING/null' })
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
