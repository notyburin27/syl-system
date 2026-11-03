import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  previousMonth, defaultFuelRange, suggestIncomeRanges, pickCustomerRanges,
  buildIncomeRateData, fuelPriceAt, incomeForRate, validateIncomeInput, groupMissing, incomeKey, wageKey,
  type MissingJobInput,
} from '../missingRates'

const job = (over: Partial<MissingJobInput> = {}): MissingJobInput => ({
  id: 'j1', jobNumber: 'JOB-1', jobDate: '2026-10-05',
  jobType: 'outbound', size: '20DC',
  customerId: 'c1', customerName: 'ลูกค้า 1',
  factoryLocationId: 'f1', factoryName: 'โรงงาน 1',
  driverName: 'คนขับ', vehicleNumber: '70-1234',
  income: null, driverWage: null,
  isCancelled: false, isTowingAbsorbed: false, pairRole: null, fuelPrice: null,
  ...over,
})
const base = { month: '2026-10', incomeRateKeys: new Set<string>(), wageRateKeys: new Set<string>(), customerRanges: () => null }

test('previousMonth: ตามเวลาไทย', () => {
  assert.equal(previousMonth(new Date('2026-11-04T03:00:00Z')), '2026-10')
  assert.equal(previousMonth(new Date('2026-01-15T00:00:00Z')), '2025-12')
  assert.equal(previousMonth(new Date('2026-10-31T18:00:00Z')), '2026-10')
  assert.equal(previousMonth(new Date('2026-10-31T16:00:00Z')), '2026-09')
})
test('defaultFuelRange: ขั้น 2 บาท', () => {
  assert.deepEqual(defaultFuelRange(41.44), { fuelPriceMin: 40.01, fuelPriceMax: 42.01 })
  assert.deepEqual(defaultFuelRange(43.54), { fuelPriceMin: 42.01, fuelPriceMax: 44.01 })
})
test('defaultFuelRange: ขอบช่วง', () => {
  assert.deepEqual(defaultFuelRange(42.01), { fuelPriceMin: 42.01, fuelPriceMax: 44.01 })
  assert.deepEqual(defaultFuelRange(42.0), { fuelPriceMin: 40.01, fuelPriceMax: 42.01 })
})
test('suggestIncomeRanges: ครอบทุก job ไม่ซ้ำ เรียง', () => {
  assert.deepEqual(suggestIncomeRanges([43.54, 41.44, 42.19, 41.44], null), {
    ranges: [{ fuelPriceMin: 40.01, fuelPriceMax: 42.01 }, { fuelPriceMin: 42.01, fuelPriceMax: 44.01 }],
    hasMissingFuelPrice: false,
  })
})
test('suggestIncomeRanges: ใช้ตารางของลูกค้า และ fallback เมื่อนอกตาราง', () => {
  const table = [{ fuelPriceMin: 41.01, fuelPriceMax: 42.01 }, { fuelPriceMin: 42.01, fuelPriceMax: 43.01 }]
  assert.deepEqual(suggestIncomeRanges([41.44, 55], table).ranges,
    [{ fuelPriceMin: 41.01, fuelPriceMax: 42.01 }, { fuelPriceMin: 54.01, fuelPriceMax: 56.01 }])
})
test('suggestIncomeRanges: ไม่มีราคาน้ำมัน', () => {
  assert.deepEqual(suggestIncomeRanges([null], null), { ranges: [], hasMissingFuelPrice: true })
})
test('pickCustomerRanges: jobType เดียวกันก่อน แล้วล่าสุด', () => {
  const r = (n: number) => [{ fuelPriceMin: n, fuelPriceMax: n + 2 }]
  const rates = [
    { customerId: 'c1', jobType: 'outbound', updatedAt: new Date('2026-01-01'), ranges: r(1) },
    { customerId: 'c1', jobType: 'outbound', updatedAt: new Date('2026-05-01'), ranges: r(2) },
    { customerId: 'c1', jobType: 'inbound', updatedAt: new Date('2026-09-01'), ranges: r(3) },
    { customerId: 'c3', jobType: 'outbound', updatedAt: new Date('2026-09-01'), ranges: [] },
  ]
  assert.deepEqual(pickCustomerRanges(rates, 'c1', 'outbound'), r(2))
  assert.deepEqual(pickCustomerRanges(rates, 'c1', 'towing'), r(3))
  assert.equal(pickCustomerRanges(rates, 'c2', 'outbound'), null)
  assert.equal(pickCustomerRanges(rates, 'c3', 'outbound'), null)
})
test('buildIncomeRateData: ราคาต่ำสุดเป็นฐาน', () => {
  assert.deepEqual(buildIncomeRateData([
    { fuelPriceMin: 42.01, fuelPriceMax: 44.01, price: 6300 },
    { fuelPriceMin: 40.01, fuelPriceMax: 42.01, price: 6000 },
  ], null), { income: 6000, surcharges: [
    { fuelPriceMin: 42.01, fuelPriceMax: 44.01, surcharge: 300 },
    { fuelPriceMin: 40.01, fuelPriceMax: 42.01, surcharge: 0 },
  ] })
})
test('buildIncomeRateData: basePrice', () => {
  assert.equal(buildIncomeRateData([{ fuelPriceMin: 40.01, fuelPriceMax: 42.01, price: 6000 }], 5800).surcharges[0].surcharge, 200)
  assert.deepEqual(buildIncomeRateData([], 5800), { income: 5800, surcharges: [] })
})
test('incomeForRate', () => {
  const rate = { income: 6000, surcharges: [{ fuelPriceMin: 42.01, fuelPriceMax: 44.01, surcharge: 300 }] }
  assert.equal(incomeForRate(rate, 43.54), 6300)
  assert.equal(incomeForRate(rate, 42.01), 6300)
  assert.equal(incomeForRate(rate, 44.01), 6000)
  assert.equal(incomeForRate(rate, null), 6000)
})
test('validateIncomeInput', () => {
  assert.equal(validateIncomeInput([], null), 'กรุณากรอกราคา')
  assert.equal(validateIncomeInput([{ fuelPriceMin: 40.01, fuelPriceMax: 42.01, price: -1 }], null), 'ราคาต้องไม่ติดลบ')
  assert.equal(validateIncomeInput([{ fuelPriceMin: 42.01, fuelPriceMax: 40.01, price: 1 }], null), 'ช่วงราคาน้ำมันไม่ถูกต้อง')
  assert.equal(validateIncomeInput([
    { fuelPriceMin: 40.01, fuelPriceMax: 42.5, price: 1 }, { fuelPriceMin: 42.01, fuelPriceMax: 44.01, price: 1 },
  ], null), 'ช่วงราคาน้ำมันทับกัน')
  assert.equal(validateIncomeInput([{ fuelPriceMin: 40.01, fuelPriceMax: 42.01, price: 6000 }], null), null)
})

test('groupMissing: ข้ามยกเลิก/เบิก/ไม่มีงาน/ใบรอง', () => {
  const r = groupMissing({ ...base, jobs: [
    job({ id: 'a', isCancelled: true }), job({ id: 'b', jobType: 'advance' }),
    job({ id: 'c', jobType: 'noJob' }), job({ id: 'd', pairRole: 'secondary' }),
  ] })
  assert.deepEqual(r.income, [])
  assert.deepEqual(r.driverWage, [])
})
test('groupMissing: ทอยตู้ปกติไม่นับค่าขนส่งแต่นับค่าเที่ยว', () => {
  const r = groupMissing({ ...base, jobs: [
    job({ id: 'a', jobType: 'towing', customerId: null, factoryLocationId: null }),
    job({ id: 'b', jobType: 'towingHeavy' }),
  ] })
  assert.deepEqual(r.income.map((g) => g.jobType), ['towingHeavy'])
  assert.deepEqual(r.driverWage.map((g) => g.jobType).sort(), ['towing', 'towingHeavy'])
  const t = r.driverWage.find((g) => g.jobType === 'towing')!
  assert.notEqual(t.status, 'incomplete')
})
test('groupMissing: ทอยที่ถูกดูดซับไม่นับค่าเที่ยว', () => {
  const r = groupMissing({ ...base, jobs: [job({ jobType: 'towing', isTowingAbsorbed: true })] })
  assert.deepEqual(r.driverWage, [])
})
test('groupMissing: ใบหลักจับคู่ใช้ 2x20DC', () => {
  const r = groupMissing({ ...base, jobs: [job({ pairRole: 'primary' })] })
  assert.equal(r.income[0].size, '2x20DC')
  assert.equal(r.income[0].key, incomeKey('outbound', '2x20DC', 'f1', 'c1'))
  assert.equal(r.driverWage[0].key, wageKey('outbound', '2x20DC', 'f1'))
})
test('groupMissing: รวมกลุ่มตาม key และแนะนำช่วง', () => {
  const r = groupMissing({ ...base, jobs: [
    job({ id: 'a', fuelPrice: 41.44 }), job({ id: 'b', jobDate: '2026-10-03', fuelPrice: 43.54 }),
  ] })
  assert.equal(r.income.length, 1)
  const g = r.income[0]
  assert.equal(g.status, 'noRate')
  assert.equal(g.jobs.length, 2)
  assert.equal(g.jobs[0].id, 'b')
  assert.equal(g.suggestedRanges.length, 2)
  assert.equal(g.fuelPriceMin, 41.44)
  assert.equal(g.fuelPriceMax, 43.54)
})
test('groupMissing: hasRate เมื่อมีอัตราตรง key', () => {
  const r = groupMissing({ ...base, incomeRateKeys: new Set([incomeKey('outbound', '20DC', 'f1', 'c1')]),
    jobs: [job({ fuelPrice: 41.44 })] })
  assert.equal(r.income[0].status, 'hasRate')
  assert.deepEqual(r.income[0].suggestedRanges, [])
})
test('groupMissing: incomplete ระบุช่องที่ขาด', () => {
  const r = groupMissing({ ...base, jobs: [job({ customerId: null, factoryLocationId: null })] })
  assert.equal(r.income[0].status, 'incomplete')
  assert.deepEqual(r.income[0].missingFields, ['customer', 'factory'])
})
test('groupMissing: job ที่มีค่าแล้วไม่ถูกนับ', () => {
  const r = groupMissing({ ...base, jobs: [job({ income: 5000 })] })
  assert.deepEqual(r.income, [])
  assert.equal(r.driverWage.length, 1)
})

test('suggestIncomeRanges: fallback ถูกตัดไม่ให้ทับช่วงตารางที่ไม่ตรงขั้น 2 บาท', () => {
  const table = [{ fuelPriceMin: 41.01, fuelPriceMax: 42.01 }, { fuelPriceMin: 42.01, fuelPriceMax: 43.01 }]
  const r = suggestIncomeRanges([42.5, 43.5], table)
  assert.deepEqual(r.ranges, [
    { fuelPriceMin: 42.01, fuelPriceMax: 43.01 },
    { fuelPriceMin: 43.01, fuelPriceMax: 44.01 },
  ])
  assert.equal(validateIncomeInput(r.ranges.map((x) => ({ ...x, price: 100 })), null), null)
})
test('suggestIncomeRanges: ตัดด้านล่างของช่องว่าง', () => {
  assert.deepEqual(
    suggestIncomeRanges([41.5], [{ fuelPriceMin: 42.01, fuelPriceMax: 43.01 }]).ranges,
    [{ fuelPriceMin: 40.01, fuelPriceMax: 42.01 }])
  assert.deepEqual(
    suggestIncomeRanges([40.5], [{ fuelPriceMin: 41.01, fuelPriceMax: 42.01 }]).ranges,
    [{ fuelPriceMin: 40.01, fuelPriceMax: 41.01 }])
})
test('fuelPriceAt: เลือก log ล่าสุดที่ effectiveDate <= jobDate, ไม่มีคืน null', () => {
  const logs = [
    { effectiveDate: new Date('2026-10-10'), pricePerLiter: 43 },
    { effectiveDate: new Date('2026-10-01'), pricePerLiter: 42 },
  ]
  assert.equal(fuelPriceAt(logs, new Date('2026-10-15')), 43)
  assert.equal(fuelPriceAt(logs, new Date('2026-10-05')), 42)
  assert.equal(fuelPriceAt(logs, new Date('2026-09-30')), null)
})
test('groupMissing: wage hasRate', () => {
  const r = groupMissing({ ...base, wageRateKeys: new Set([wageKey('outbound', '20DC', 'f1')]), jobs: [job({ income: 1 })] })
  assert.equal(r.driverWage[0].status, 'hasRate')
})
test('groupMissing: wage incomplete เมื่อไม่ใช่ towing และไม่มีโรงงาน', () => {
  const r = groupMissing({ ...base, jobs: [job({ income: 1, factoryLocationId: null })] })
  assert.equal(r.driverWage[0].status, 'incomplete')
  assert.deepEqual(r.driverWage[0].missingFields, ['factory'])
})
test('groupMissing: noRate income ที่มี job ไม่มีราคาน้ำมัน -> hasMissingFuelPrice', () => {
  const r = groupMissing({ ...base, jobs: [job({ fuelPrice: null }), job({ id: 'j2', fuelPrice: 41.44 })] })
  assert.equal(r.income[0].status, 'noRate')
  assert.equal(r.income[0].hasMissingFuelPrice, true)
})
