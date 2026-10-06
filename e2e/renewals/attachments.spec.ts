import { test, expect } from '@playwright/test'
import { todayInBangkok } from '../../lib/renewals/dateOnly'
import type { AttachmentDto } from '../../types/renewals'
import { cleanupRenewals, createCoverage, createVehicle, expectJson, getVehicleDetail, login } from './helpers'

// PNG 1x1
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

test.describe.serial('ไฟล์แนบ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())

  test('แนบไฟล์ชื่อภาษาไทยจากหน้ารถ → เปิดดูได้ → STAFF ได้ 403 → ลบได้', async ({ page, browser }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const vid = await createVehicle(page, 'E2E-7001 กท')
    const cid = await createCoverage(page, vid, 'PRB', '2027-03-31')

    await page.goto(`/renewals/vehicles/${vid}`)
    await page.getByTestId(`attachments-btn-${cid}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles({ name: 'กรมธรรม์ 2569.png', mimeType: 'image/png', buffer: PNG })
    await expect(dialog.getByRole('link', { name: 'กรมธรรม์ 2569.png' })).toBeVisible()

    const [attachment] = await expectJson<AttachmentDto[]>(await page.request.get(`/api/renewals/coverages/${cid}/attachments`))
    const file = await page.request.get(`/api/renewals/attachments/${attachment.id}`)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toBe('image/png')
    expect(file.headers()['content-disposition']).toContain("filename*=UTF-8''")
    expect(file.headers()['x-content-type-options']).toBe('nosniff')
    expect(Buffer.from(await file.body()).equals(PNG)).toBe(true)

    const staffContext = await browser.newContext()
    const staff = await staffContext.newPage()
    await login(staff, 'teststaff', /\/jobs/)
    expect((await staff.request.get(`/api/renewals/attachments/${attachment.id}`)).status()).toBe(403)
    await staffContext.close()

    await dialog.getByTestId(`attachment-delete-btn-${attachment.id}`).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(dialog.getByRole('link', { name: 'กรมธรรม์ 2569.png' })).toHaveCount(0)
    expect(await expectJson<AttachmentDto[]>(await page.request.get(`/api/renewals/coverages/${cid}/attachments`))).toEqual([])
  })

  test('แนบไฟล์ตอนกดต่อแล้วจาก dashboard → ไฟล์ผูกกับงวดใหม่', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const vid = await createVehicle(page, 'E2E-7002 กท')
    const cid = await createCoverage(page, vid, 'TAX', todayInBangkok())

    await page.reload()
    await page.getByTestId(`renew-btn-${cid}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'ป้ายภาษี.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e'),
    })
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.locator(`tr[data-row-key="${cid}"]`)).toHaveCount(0)

    await expect
      .poll(async () => (await getVehicleDetail(page, vid)).coverages.find((c) => c.id !== cid)?.attachmentCount)
      .toBe(1)
  })

  test('ไฟล์นามสกุลไม่รองรับ → 400 ข้อความไทย', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const cid = await createCoverage(page, await createVehicle(page, 'E2E-7003 กท'), 'PRB', '2027-03-31')
    const res = await page.request.post(`/api/renewals/coverages/${cid}/attachments`, {
      multipart: { files: { name: 'x.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') } },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('x.exe: รองรับเฉพาะไฟล์ PDF, JPG, PNG')
  })
})
