import { test, expect } from '@playwright/test'
import { cleanupRenewals, createCoverage, createInsurer, createVehicle, getVehicleDetail, login } from './helpers'

test.describe.serial('API รถและงวด', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('ทะเบียน normalize และกันซ้ำแม้พิมพ์ต่างรูปแบบ', async ({ page }) => {
    const res = await page.request.post('/api/renewals/vehicles', {
      data: { plate: ' E2E-1001  กท. ', ownerName: 'E2E บริษัท', vehicleType: 'ลากจูง' },
    })
    expect(res.status()).toBe(201)
    expect((await res.json()).plate).toBe('E2E-1001 กท')

    const dup = await page.request.post('/api/renewals/vehicles', {
      data: { plate: 'E2E-1001 กท', ownerName: 'E2E บริษัท', vehicleType: 'หาง' },
    })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('ทะเบียนนี้มีอยู่แล้ว')
  })

  test('เพิ่มงวดที่หมดช้ากว่า → งวดเก่าปิดเป็นต่อแล้วและผูกกัน; ลบงวดใหม่ → งวดเก่ากลับเป็นรอต่อ', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-1002 กท')
    const oldId = await createCoverage(page, vid, 'PRB', '2026-03-31')
    const newId = await createCoverage(page, vid, 'PRB', '2027-03-31')

    let detail = await getVehicleDetail(page, vid)
    expect(detail.coverages.find((c) => c.id === oldId)).toMatchObject({ renewalStatus: 'RENEWED', renewedToId: newId })
    expect(detail.coverages.find((c) => c.id === newId)).toMatchObject({ renewalStatus: 'PENDING' })

    expect((await page.request.delete(`/api/renewals/coverages/${newId}`)).status()).toBe(200)
    detail = await getVehicleDetail(page, vid)
    expect(detail.coverages).toHaveLength(1)
    expect(detail.coverages[0]).toMatchObject({ id: oldId, renewalStatus: 'PENDING', renewedToId: null })
  })

  test('งวดซ้ำ (รถ + ประเภท + วันสิ้นสุด) → 409', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-1003 กท')
    await createCoverage(page, vid, 'TAX', '2027-06-30')
    const dup = await page.request.post('/api/renewals/coverages', {
      data: { vehicleId: vid, type: 'TAX', endDate: '2027-06-30' },
    })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('มีงวดประเภทนี้ที่หมดวันเดียวกันอยู่แล้ว')
  })

  test('ภาษีล้างบริษัทประกัน; ประกันสินค้าล้างชั้น; หางคู่ต้องเป็นคนละคัน', async ({ page }) => {
    const insurerId = await createInsurer(page, 'E2E ประกันภัย V')
    const vid = await createVehicle(page, 'E2E-1004 กท')
    await createCoverage(page, vid, 'TAX', '2027-06-30', { insurerId, amount: 4350, serviceFee: 1300 })
    await createCoverage(page, vid, 'CARGO_INSURANCE', '2027-01-11', { insurerId, coverageClass: 'ป.3' })
    const detail = await getVehicleDetail(page, vid)
    expect(detail.coverages.find((c) => c.type === 'TAX')).toMatchObject({ insurerId: null, amount: 4350, serviceFee: 1300 })
    expect(detail.coverages.find((c) => c.type === 'CARGO_INSURANCE')).toMatchObject({ insurerId, coverageClass: null })

    const self = await page.request.post('/api/renewals/coverages', {
      data: { vehicleId: vid, type: 'MOTOR_INSURANCE', endDate: '2027-01-09', pairedVehicleId: vid },
    })
    expect(self.status()).toBe(400)
    expect((await self.json()).error).toBe('หางคู่ต้องเป็นรถคนละคัน')
  })

  test('เปลี่ยนรถเป็นขาย → งวดเปิดเป็นไม่ต่อ/ขายรถ; ลบรถที่มีงวด → 409', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-1005 กท')
    const cid = await createCoverage(page, vid, 'MOTOR_INSURANCE', '2027-01-09')
    const res = await page.request.patch(`/api/renewals/vehicles/${vid}`, {
      data: { plate: 'E2E-1005 กท', ownerName: 'E2E บริษัท', vehicleType: 'ลากจูง', status: 'SOLD', statusDate: '2026-07-06' },
    })
    expect(res.status()).toBe(200)
    expect((await getVehicleDetail(page, vid)).coverages[0]).toMatchObject({
      id: cid,
      renewalStatus: 'NOT_RENEWED',
      notRenewedReason: 'SOLD',
    })

    const del = await page.request.delete(`/api/renewals/vehicles/${vid}`)
    expect(del.status()).toBe(409)
  })
})
