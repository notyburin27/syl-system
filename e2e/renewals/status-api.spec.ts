import { test, expect } from '@playwright/test'
import { cleanupRenewals, createCoverage, createInsurer, createVehicle, getVehicleDetail, login } from './helpers'

test.describe.serial('API สถานะการต่อ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('ต่อแล้ว: สร้างงวดใหม่ ผูกกับงวดเดิม; วันหมดไม่หลังงวดเดิม → 400', async ({ page }) => {
    const insurerId = await createInsurer(page, 'E2E ประกันภัย S')
    const vid = await createVehicle(page, 'E2E-2001 กท')
    const cid = await createCoverage(page, vid, 'MOTOR_INSURANCE', '2026-12-31')

    const bad = await page.request.post(`/api/renewals/coverages/${cid}/renew`, { data: { endDate: '2026-12-31' } })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).error).toBe('วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม')

    const res = await page.request.post(`/api/renewals/coverages/${cid}/renew`, {
      data: { insurerId, coverageClass: 'ป.3', startDate: '2027-01-01', endDate: '2027-12-31', amount: 19900 },
    })
    expect(res.status()).toBe(201)
    const { id: newId } = await res.json()
    const detail = await getVehicleDetail(page, vid)
    expect(detail.coverages.find((c) => c.id === cid)).toMatchObject({ renewalStatus: 'RENEWED', renewedToId: newId })
    expect(detail.coverages.find((c) => c.id === newId)).toMatchObject({
      renewalStatus: 'PENDING',
      insurerId,
      coverageClass: 'ป.3',
      amount: 19900,
      startDate: '2027-01-01',
    })
  })

  test('กดต่อแล้วพร้อมกัน 2 ครั้ง → สำเร็จ 1 ครั้ง อีกครั้ง 409 และมีงวดใหม่งวดเดียว', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-2002 กท')
    const cid = await createCoverage(page, vid, 'PRB', '2026-12-31')
    const body = { data: { startDate: '2027-01-01', endDate: '2027-12-31' } }
    const [a, b] = await Promise.all([
      page.request.post(`/api/renewals/coverages/${cid}/renew`, body),
      page.request.post(`/api/renewals/coverages/${cid}/renew`, body),
    ])
    expect([a.status(), b.status()].sort()).toEqual([201, 409])
    expect((await getVehicleDetail(page, vid)).coverages).toHaveLength(2)
  })

  test('bulk-status: กำลังดำเนินการ, ไม่ต่อต้องมีเหตุผล, ชนงวดที่ปิดแล้ว → 409 และไม่มีอะไรเปลี่ยน', async ({ page }) => {
    const v1 = await createVehicle(page, 'E2E-2003 กท')
    const v2 = await createVehicle(page, 'E2E-2004 กท')
    const c1 = await createCoverage(page, v1, 'TAX', '2026-12-31')
    const c2 = await createCoverage(page, v2, 'TAX', '2026-12-31')

    const inProgress = await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [c1, c2], status: 'IN_PROGRESS' },
    })
    expect(await inProgress.json()).toEqual({ count: 2 })

    const noReason = await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [c1], status: 'NOT_RENEWED' },
    })
    expect(noReason.status()).toBe(400)

    const repair = await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [c1], status: 'NOT_RENEWED', reason: 'REPAIR', note: 'ซ่อมเครื่อง' },
    })
    expect(repair.status()).toBe(200)

    const mixed = await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [c1, c2], status: 'PENDING' },
    })
    expect(mixed.status()).toBe(409)
    expect((await mixed.json()).error).toContain('E2E-2003 กท')
    expect((await getVehicleDetail(page, v2)).coverages[0].renewalStatus).toBe('IN_PROGRESS')
    expect((await getVehicleDetail(page, v1)).coverages[0]).toMatchObject({
      renewalStatus: 'NOT_RENEWED',
      notRenewedReason: 'REPAIR',
      renewalNote: 'ซ่อมเครื่อง',
    })
  })

  test('bulk-renew: ประเภทปนกัน → 400; ประเภทเดียวกัน → คัดลอกเบี้ย/ค่าบริการจากงวดเดิม', async ({ page }) => {
    const v1 = await createVehicle(page, 'E2E-2005 กท')
    const v2 = await createVehicle(page, 'E2E-2006 กท')
    const p1 = await createCoverage(page, v1, 'PRB', '2027-03-31', { amount: 645.21 })
    const p2 = await createCoverage(page, v2, 'PRB', '2027-03-31', { amount: 1182.35 })
    const t1 = await createCoverage(page, v1, 'TAX', '2027-03-31')

    const mixed = await page.request.post('/api/renewals/coverages/bulk-renew', {
      data: { ids: [p1, t1], endDate: '2028-03-31' },
    })
    expect(mixed.status()).toBe(400)
    expect((await mixed.json()).error).toBe('ต่อแล้วแบบหลายรายการต้องเป็นประเภทเดียวกัน')

    const res = await page.request.post('/api/renewals/coverages/bulk-renew', {
      data: { ids: [p1, p2], startDate: '2027-04-01', endDate: '2028-03-31' },
    })
    expect(await res.json()).toEqual({ count: 2 })
    const renewed = (await getVehicleDetail(page, v2)).coverages.find((c) => c.type === 'PRB' && c.renewalStatus === 'PENDING')
    expect(renewed).toMatchObject({ endDate: '2028-03-31', amount: 1182.35, policyNumber: null })
  })

  test('เปิดใหม่: ไม่ต่อ → รอต่อ; งวดที่มีงวดใหม่กว่าแล้ว → 409; งวดที่ยังเปิด → 409', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-2007 กท')
    const cid = await createCoverage(page, vid, 'CARGO_INSURANCE', '2026-12-31')
    await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [cid], status: 'NOT_RENEWED', reason: 'SUSPENDED' },
    })
    expect((await page.request.post(`/api/renewals/coverages/${cid}/reopen`)).status()).toBe(200)
    expect((await getVehicleDetail(page, vid)).coverages[0].renewalStatus).toBe('PENDING')

    const again = await page.request.post(`/api/renewals/coverages/${cid}/reopen`)
    expect(again.status()).toBe(409)

    await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [cid], status: 'NOT_RENEWED', reason: 'SUSPENDED' },
    })
    await createCoverage(page, vid, 'CARGO_INSURANCE', '2027-12-31')
    const blocked = await page.request.post(`/api/renewals/coverages/${cid}/reopen`)
    expect(blocked.status()).toBe(409)
    expect((await blocked.json()).error).toBe('เปิดใหม่ไม่ได้ เพราะมีงวดที่หมดช้ากว่าแล้ว')
  })
})
