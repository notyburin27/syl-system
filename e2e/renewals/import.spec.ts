import { test, expect, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import type { VehicleListItemDto } from '../../types/renewals'
import { cleanupRenewals, expectJson, getVehicleDetail, login } from './helpers'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** ดาวน์โหลด template จาก API แล้วเติมแถว (เริ่มแถว 2) — ชีตรถใส่ค่าตามชื่อหัวคอลัมน์ใน template */
async function buildFile(page: Page, vehicles: Record<string, unknown>[], coverages: unknown[][]): Promise<Buffer> {
  const template = await page.request.get('/api/renewals/import/template')
  expect(template.status()).toBe(200)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((await template.body()) as unknown as ExcelJS.Buffer)
  const vehicleSheet = wb.getWorksheet('รถ')!
  const headers = (vehicleSheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String)
  vehicles.forEach((values, i) => {
    for (const header of Object.keys(values)) expect(headers).toContain(header)
    vehicleSheet.getRow(i + 2).values = headers.map((h) => values[h] ?? '') as ExcelJS.CellValue[]
  })
  coverages.forEach((values, i) => {
    wb.getWorksheet('งวด')!.getRow(i + 2).values = values as ExcelJS.CellValue[]
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function uploadAndPreview(page: Page, buffer: Buffer) {
  await page.goto('/renewals/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'import.xlsx', mimeType: XLSX, buffer })
  await page.getByTestId('import-preview-btn').click()
}

const summaryOf = (page: Page, key: string) => page.getByTestId(`import-summary-${key}`)

test.describe.serial('นำเข้า Excel', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('preview → เพิ่มบริษัทประกันที่ไม่มี → commit; รถที่ขายในไฟล์ปิดงวดอัตโนมัติ', async ({ page }) => {
    const buffer = await buildFile(
      page,
      [
        {
          ทะเบียน: 'E2E-6001 กท',
          'จังหวัด (ทะเบียนรถ)': 'กทม.',
          วันที่จดทะเบียน: '15/08/2565',
          เบอร์รถ: '901',
          บริษัท: 'E2E บริษัท',
          ลักษณะ: 'ลากจูง',
          'แบบ/รุ่น': 'FVZ34',
          สีรถ: 'ขาว',
          'เลขตัวรถ (คัสซี)': 'CH-6001',
          ตำแหน่งคัสซี: 'โครงขวาหน้า',
          เลขเครื่องยนต์: '6HK1-6001',
          จำนวนสูบ: '6',
          แรงม้า: '300',
          จำนวนเพลา: '3',
          'น้ำหนักตัวรถ (กก.)': '7,900',
        },
        { ทะเบียน: 'E2E-6002 กท.', เบอร์รถ: '902', บริษัท: 'E2E บริษัท', ลักษณะ: 'หาง' },
        { ทะเบียน: 'E2E-6003 กท', เบอร์รถ: '903', บริษัท: 'E2E บริษัท', ลักษณะ: 'ลากจูง', สถานะ: 'ขาย', วันที่แจ้งสถานะ: '06/07/2569' },
      ],
      [
        ['E2E-6001 กท', 'ประกันรถยนต์', 'E2E ประกันภัย ใหม่', 'ป.3', 'POL-1', '09/01/2569', '09/01/2570', '19,900', '', 'E2E-6002  กท'],
        ['E2E-6003 กท', 'พรบ.', 'E2E ประกันภัย ใหม่', '', '', '', '31/03/2570', '', '', '', 'รอต่อ'],
      ],
    )
    await uploadAndPreview(page, buffer)
    await expect(page.getByText('ไม่พบบริษัทประกัน "E2E ประกันภัย ใหม่" ในระบบ').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('import-commit-btn')).toBeDisabled()

    await page.getByTestId('import-add-insurers-btn').click()
    await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
    await expect(page.getByText('ไฟล์ถูกต้อง พร้อมนำเข้า')).toBeVisible()
    await expect(summaryOf(page, 'vehiclesCreated')).toHaveText('3')
    await expect(summaryOf(page, 'coveragesCreated')).toHaveText('2')
    await expect(summaryOf(page, 'coveragesAutoClosed')).toHaveText('1')

    await page.getByTestId('import-commit-btn').click()
    await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
    await expect(page.getByText(/นำเข้าสำเร็จ/)).toBeVisible()

    const vehicles = await expectJson<VehicleListItemDto[]>(await page.request.get('/api/renewals/vehicles'))
    const idOf = (plate: string) => vehicles.find((v) => v.plate === plate)!.id
    expect(vehicles.map((v) => v.plate)).toEqual(expect.arrayContaining(['E2E-6001 กท', 'E2E-6002 กท', 'E2E-6003 กท']))

    const tractor = await getVehicleDetail(page, idOf('E2E-6001 กท'))
    expect(tractor.vehicle).toMatchObject({
      plateProvince: 'กรุงเทพมหานคร',
      registrationDate: '2022-08-15',
      modelName: 'FVZ34',
      color: 'ขาว',
      chassisNumber: 'CH-6001',
      chassisPosition: 'โครงขวาหน้า',
      engineNumber: '6HK1-6001',
      engineCylinders: 6,
      engineHorsepower: 300,
      axleCount: 3,
      weightKg: 7900,
    })
    expect(tractor.coverages[0]).toMatchObject({
      type: 'MOTOR_INSURANCE',
      coverageClass: 'ป.3',
      policyNumber: 'POL-1',
      startDate: '2026-01-09',
      endDate: '2027-01-09',
      amount: 19900,
      pairedPlate: 'E2E-6002 กท',
      insurerName: 'E2E ประกันภัย ใหม่',
    })
    const sold = await getVehicleDetail(page, idOf('E2E-6003 กท'))
    expect(sold.vehicle).toMatchObject({ status: 'SOLD', statusDate: '2026-07-06' })
    expect(sold.coverages[0]).toMatchObject({ renewalStatus: 'NOT_RENEWED', notRenewedReason: 'SOLD' })
  })

  test('ไฟล์ template เดิม (หัวคอลัมน์ชื่อเดิม ไม่มีคอลัมน์ใหม่) → อัปเดตได้ และข้อมูลเล่มทะเบียนเดิมไม่หาย', async ({ page }) => {
    const wb = new ExcelJS.Workbook()
    const vehicles = wb.addWorksheet('รถ')
    vehicles.addRow(['ทะเบียน', 'เบอร์รถ', 'บริษัท', 'ลักษณะ', 'ยี่ห้อ', 'เลขตัวถัง', 'เชื้อเพลิง', 'น้ำหนัก(กก.)', 'สถานะ', 'วันที่สถานะ', 'หมายเหตุ'])
    vehicles.addRow(['E2E-6001 กท', '', '', '', 'ISUZU', 'CH-6001-NEW', '', '8,100', '', '', ''])
    wb.addWorksheet('งวด').addRow(['ทะเบียน', 'ประเภท', 'บริษัทประกัน', 'ชั้น', 'เลขกรมธรรม์', 'วันเริ่ม', 'วันสิ้นสุด', 'เบี้ย/ภาษี', 'ค่าบริการ', 'ทะเบียนหางคู่', 'สถานะการต่อ', 'เหตุผลไม่ต่อ', 'หมายเหตุ'])
    await uploadAndPreview(page, Buffer.from(await wb.xlsx.writeBuffer()))
    await expect(page.getByText('ไฟล์ถูกต้อง พร้อมนำเข้า')).toBeVisible({ timeout: 15_000 })
    await expect(summaryOf(page, 'vehiclesUpdated')).toHaveText('1')

    await page.getByTestId('import-commit-btn').click()
    await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
    await expect(page.getByText(/นำเข้าสำเร็จ/)).toBeVisible()

    const list = await expectJson<VehicleListItemDto[]>(await page.request.get('/api/renewals/vehicles'))
    const id = list.find((v) => v.plate === 'E2E-6001 กท')!.id
    expect((await getVehicleDetail(page, id)).vehicle).toMatchObject({
      brand: 'ISUZU',
      chassisNumber: 'CH-6001-NEW',
      weightKg: 8100,
      fleetNumber: '901',
      plateProvince: 'กรุงเทพมหานคร',
      registrationDate: '2022-08-15',
      modelName: 'FVZ34',
      engineCylinders: 6,
      axleCount: 3,
    })
  })

  test('ปีแบบ 2 หลัก → error ชัดเจน และกดนำเข้าไม่ได้', async ({ page }) => {
    const buffer = await buildFile(
      page,
      [{ ทะเบียน: 'E2E-6101 กท', บริษัท: 'E2E บริษัท', ลักษณะ: 'ลากจูง' }],
      [['E2E-6101 กท', 'พรบ.', '', '', '', '', '31/03/70']],
    )
    await uploadAndPreview(page, buffer)
    await expect(page.getByText('วันที่ "31/03/70" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570')).toBeVisible()
    await expect(page.getByTestId('import-commit-btn')).toBeDisabled()
  })
})
