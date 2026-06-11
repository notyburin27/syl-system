import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseFuelRange,
  parseFuelRateRows,
  toStoredMax,
  fromStoredMax,
  FUEL_RATE_HEADERS,
} from '../fuelRateExcel'

const HEADER = [...FUEL_RATE_HEADERS]

test('parseFuelRange: รูปแบบถูกต้อง', () => {
  assert.deepEqual(parseFuelRange('30.00-34.99'), { min: 30, max: 34.99 })
  assert.deepEqual(parseFuelRange(' 35.00 - 39.99 '), { min: 35, max: 39.99 })
  assert.deepEqual(parseFuelRange('40-44.99'), { min: 40, max: 44.99 })
})

test('parseFuelRange: รูปแบบผิด → null', () => {
  assert.equal(parseFuelRange('abc'), null)
  assert.equal(parseFuelRange('30.00'), null)
  assert.equal(parseFuelRange('39.99-35.00'), null) // min >= max
  assert.equal(parseFuelRange('30.00-30.00'), null)
  assert.equal(parseFuelRange(''), null)
})

test('toStoredMax/fromStoredMax: แปลงไป-กลับได้ค่าเดิม ไม่มีปัญหา floating point', () => {
  assert.equal(toStoredMax(34.99), 35)
  assert.equal(fromStoredMax(35), 34.99)
  assert.equal(fromStoredMax(toStoredMax(39.99)), 39.99)
  assert.equal(fromStoredMax(toStoredMax(44.5)), 44.5)
})

test('parseFuelRateRows: happy path — ราคาฐาน = ช่วงต่ำสุด, surcharge ถูกต้อง, เรียงช่วง', () => {
  const result = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '35.00-39.99', 10500],
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาเข้า', '40DC', '30.00-34.99', '12,000'], // ตัวเลขแบบ string มี comma ต้องรับได้
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rates.length, 2)

  const r20 = result.rates.find((r) => r.size === '20DC')!
  assert.equal(r20.jobType, 'inbound') // label ไทย → value
  assert.equal(r20.baseIncome, 10000)
  assert.deepEqual(
    r20.ranges.map((x) => [x.fuelPriceMin, x.fuelPriceMax, x.income, x.surcharge]),
    [
      [30, 34.99, 10000, 0],
      [35, 39.99, 10500, 500],
    ]
  )

  const r40 = result.rates.find((r) => r.size === '40DC')!
  assert.equal(r40.baseIncome, 12000)
})

test('parseFuelRateRows: รับ jobType เป็น value ภาษาอังกฤษได้ และข้ามแถวว่าง', () => {
  const result = parseFuelRateRows([
    HEADER,
    ['inbound', '20DC', '30.00-34.99', 10000],
    ['', '', '', ''],
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rates.length, 1)
  assert.equal(result.rates[0].jobType, 'inbound')
})

test('parseFuelRateRows: header ผิด → error', () => {
  const result = parseFuelRateRows([['ผิด', 'SIZE', 'ช่วงราคาน้ำมัน', 'ค่าขนส่ง']])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.errors[0].row, 1)
})

test('parseFuelRateRows: ไฟล์ว่าง → error', () => {
  const result = parseFuelRateRows([])
  assert.equal(result.ok, false)
})

test('parseFuelRateRows: error รายแถว — jobType/SIZE ไม่รู้จัก, ช่วงผิด, ค่าขนส่งผิด', () => {
  const result = parseFuelRateRows([
    HEADER,
    ['ไม่มีจริง', '20DC', '30.00-34.99', 10000], // row 2: jobType ไม่รู้จัก
    ['ขาเข้า', '99XX', '30.00-34.99', 10000], // row 3: SIZE ไม่รู้จัก
    ['ขาเข้า', '20DC', 'abc', 10000], // row 4: ช่วงผิด
    ['ขาเข้า', '40DC', '30.00-34.99', -5], // row 5: ค่าขนส่งติดลบ
    ['ขาเข้า', '40RF', '30.00-34.99', 'xyz'], // row 6: ค่าขนส่งไม่ใช่ตัวเลข
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.deepEqual(result.errors.map((e) => e.row), [2, 3, 4, 5, 6])
})

test('parseFuelRateRows: ช่วงทับซ้อน/ซ้ำใน ลักษณะงาน/SIZE เดียวกัน → error (คนละกลุ่มไม่ error)', () => {
  const overlap = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '30.00-35.00', 10000],
    ['ขาเข้า', '20DC', '35.00-39.99', 10500], // ทับที่ 35.00 (รวมปลาย)
  ])
  assert.equal(overlap.ok, false)

  const duplicate = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาเข้า', '20DC', '30.00-34.99', 10500],
  ])
  assert.equal(duplicate.ok, false)

  const differentGroup = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาออก', '20DC', '30.00-34.99', 11000],
  ])
  assert.equal(differentGroup.ok, true)
})

test('parseFuelRateRows: ช่วงมี gap ได้ ไม่ error', () => {
  const result = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาเข้า', '20DC', '40.00-44.99', 11000], // เว้น 35-39.99
  ])
  assert.equal(result.ok, true)
})

import {
  buildFuelRateSheetRows,
  FUEL_RATE_TEMPLATE_ROWS,
  effectiveIncome,
} from '../fuelRateExcel'

test('buildFuelRateSheetRows: สร้างแถว long format จากข้อมูล DB (แปลง storedMax กลับ)', () => {
  const rows = buildFuelRateSheetRows([
    {
      jobType: 'inbound',
      size: '20DC',
      income: 10000,
      fuelSurcharges: [
        { fuelPriceMin: 35, fuelPriceMax: 40, surcharge: 500 }, // stored: 40 = 39.99 รวมปลาย
        { fuelPriceMin: 30, fuelPriceMax: 35, surcharge: 0 },
      ],
    },
  ])
  assert.deepEqual(rows, [
    ['ลักษณะงาน', 'SIZE', 'ช่วงราคาน้ำมัน', 'ค่าขนส่ง'],
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาเข้า', '20DC', '35.00-39.99', 10500],
  ])
})

test('round-trip: export → parse ได้ข้อมูลเดิม', () => {
  const rows = buildFuelRateSheetRows([
    {
      jobType: 'outbound',
      size: '40DC',
      income: 12000,
      fuelSurcharges: [
        { fuelPriceMin: 30, fuelPriceMax: 35, surcharge: 0 },
        { fuelPriceMin: 35, fuelPriceMax: 40, surcharge: 600 },
      ],
    },
  ])
  const parsed = parseFuelRateRows(rows)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.rates[0].baseIncome, 12000)
  assert.deepEqual(
    parsed.rates[0].ranges.map((r) => r.surcharge),
    [0, 600]
  )
})

test('FUEL_RATE_TEMPLATE_ROWS: parse ผ่าน', () => {
  assert.equal(parseFuelRateRows(FUEL_RATE_TEMPLATE_ROWS.map((r) => [...r])).ok, true)
})

test('effectiveIncome: เลือกช่วงตรงราคา, นอกช่วง/ไม่มีราคา/ไม่มีช่วง → ราคาฐาน', () => {
  const rate = {
    income: '10000', // Prisma Decimal มาเป็น string ได้
    fuelSurcharges: [
      { fuelPriceMin: '30', fuelPriceMax: '35', surcharge: '0' },
      { fuelPriceMin: '35', fuelPriceMax: '40', surcharge: '500' },
    ],
  }
  assert.equal(effectiveIncome(rate, 36.5), 10500)
  assert.equal(effectiveIncome(rate, 39.99), 10500) // ขอบบนรวมปลาย (< 40)
  assert.equal(effectiveIncome(rate, 50), 10000) // นอกช่วง → ฐาน
  assert.equal(effectiveIncome(rate, null), 10000) // ไม่มีบันทึกราคาน้ำมัน
  assert.equal(effectiveIncome({ income: 8000, fuelSurcharges: [] }, 36.5), 8000)
})
