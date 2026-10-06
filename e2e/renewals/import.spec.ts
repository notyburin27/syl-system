import { test, expect, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import type { VehicleListItemDto } from '../../types/renewals'
import { cleanupRenewals, expectJson, getVehicleDetail, login } from './helpers'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** ดาวน์โหลด template จาก API แล้วเติมแถว (เริ่มแถว 2) */
async function buildFile(page: Page, vehicles: unknown[][], coverages: unknown[][]): Promise<Buffer> {
  const template = await page.request.get('/api/renewals/import/template')
  expect(template.status()).toBe(200)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((await template.body()) as unknown as ExcelJS.Buffer)
  vehicles.forEach((values, i) => {
    wb.getWorksheet('รถ')!.getRow(i + 2).values = values as ExcelJS.CellValue[]
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
        ['E2E-6001 กท', '901', 'E2E บริษัท', 'ลากจูง'],
        ['E2E-6002 กท.', '902', 'E2E บริษัท', 'หาง'],
        ['E2E-6003 กท', '903', 'E2E บริษัท', 'ลากจูง', '', '', '', '', 'ขาย', '06/07/2569'],
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

    expect((await getVehicleDetail(page, idOf('E2E-6001 กท'))).coverages[0]).toMatchObject({
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

  test('ปีแบบ 2 หลัก → error ชัดเจน และกดนำเข้าไม่ได้', async ({ page }) => {
    const buffer = await buildFile(
      page,
      [['E2E-6101 กท', '', 'E2E บริษัท', 'ลากจูง']],
      [['E2E-6101 กท', 'พรบ.', '', '', '', '', '31/03/70']],
    )
    await uploadAndPreview(page, buffer)
    await expect(page.getByText('วันที่ "31/03/70" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570')).toBeVisible()
    await expect(page.getByTestId('import-commit-btn')).toBeDisabled()
  })
})
