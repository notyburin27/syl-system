import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseFuelRange,
  parseFuelRateRows,
  toStoredMax,
  fromStoredMax,
  FUEL_RATE_HEADERS,
  matchFuelRateFilename,
  buildFuelRateFilename,
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

// ---------- matchFuelRateFilename ----------

const CUSTOMERS = [
  { id: 'c1', name: 'ALL CENTER' },
  { id: 'c2', name: 'ACCORD PILOT' },
  { id: 'c3', name: 'เทพผดุงพร' },
  { id: 'c4', name: 'ABLE' },
]
const FACTORIES = [
  { id: 'f1', name: 'ปัญจวัฒนาพลาสติก สมุทรสาคร' },
  { id: 'f2', name: 'เมจิกส์มายบางกรวย นนทบุรี' },
  { id: 'f3', name: 'เทพผดุงพร สาย4' },
  { id: 'f4', name: 'VG บางบอน' },
]

test('matchFuelRateFilename: ชื่อไฟล์ตรงรูปแบบ "ลูกค้า - โรงงาน.xlsx"', () => {
  assert.deepEqual(
    matchFuelRateFilename('ALL CENTER - ปัญจวัฒนาพลาสติก สมุทรสาคร.xlsx', CUSTOMERS, FACTORIES),
    { customerId: 'c1', factoryLocationId: 'f1' }
  )
})

test('matchFuelRateFilename: ทนต่อช่องว่างเกิน, case ต่าง, และนามสกุล .xls', () => {
  assert.deepEqual(
    matchFuelRateFilename('  all center  -  ปัญจวัฒนาพลาสติก   สมุทรสาคร .xls', CUSTOMERS, FACTORIES),
    { customerId: 'c1', factoryLocationId: 'f1' }
  )
})

test('matchFuelRateFilename: ตัด suffix ที่ browser เติมตอนโหลดซ้ำ เช่น (1)', () => {
  assert.deepEqual(
    matchFuelRateFilename('ALL CENTER - ปัญจวัฒนาพลาสติก สมุทรสาคร (1).xlsx', CUSTOMERS, FACTORIES),
    { customerId: 'c1', factoryLocationId: 'f1' }
  )
})

test('matchFuelRateFilename: ชื่อลูกค้า/โรงงานมี "-" ในตัวเอง → แยกที่ " - " ที่ทำให้ match ได้', () => {
  const customers = [...CUSTOMERS, { id: 'c5', name: 'K-APEX' }]
  const factories = [...FACTORIES, { id: 'f5', name: 'เชอร่า - ลพบุรี' }]
  assert.deepEqual(
    matchFuelRateFilename('K-APEX - เชอร่า - ลพบุรี.xlsx', customers, factories),
    { customerId: 'c5', factoryLocationId: 'f5' }
  )
})

test('matchFuelRateFilename: ชื่อลูกค้าซ้ำกับชื่อโรงงาน (เทพผดุงพร) ยัง match ถูกฝั่ง', () => {
  assert.deepEqual(
    matchFuelRateFilename('เทพผดุงพร - เทพผดุงพร สาย4.xlsx', CUSTOMERS, FACTORIES),
    { customerId: 'c3', factoryLocationId: 'f3' }
  )
})

test('matchFuelRateFilename: match ไม่ได้ → null (ไม่มี separator, ชื่อไม่มีใน DB, ฝั่งเดียว)', () => {
  assert.equal(matchFuelRateFilename('fuel_rates_current.xlsx', CUSTOMERS, FACTORIES), null)
  assert.equal(matchFuelRateFilename('ไม่มีลูกค้านี้ - ไม่มีโรงงานนี้.xlsx', CUSTOMERS, FACTORIES), null)
  assert.equal(matchFuelRateFilename('ALL CENTER - ไม่มีโรงงานนี้.xlsx', CUSTOMERS, FACTORIES), null)
  assert.equal(matchFuelRateFilename('', CUSTOMERS, FACTORIES), null)
})

test('buildFuelRateFilename: ประกอบชื่อไฟล์กลับได้รูปแบบเดิม', () => {
  assert.equal(
    buildFuelRateFilename('ALL CENTER', 'ปัญจวัฒนาพลาสติก สมุทรสาคร'),
    'ALL CENTER - ปัญจวัฒนาพลาสติก สมุทรสาคร.xlsx'
  )
})

test('matchFuelRateFilename: "-" ในชื่อไฟล์ match กับ "/" ใน DB ได้ (ชื่อไฟล์ห้ามมี /)', () => {
  const customers = [{ id: 'c1', name: 'ASIA INTERTRADE' }]
  const factories = [{ id: 'f1', name: 'เอเชีย อินเตอร์เทรด /ปทุมธานี' }]
  // เคสจริงจากผู้ใช้: DB ใช้ "/" แต่ผู้ใช้พิมพ์ "-" เพราะ OS ห้าม "/" ในชื่อไฟล์
  assert.deepEqual(
    matchFuelRateFilename('ASIA INTERTRADE - เอเชีย อินเตอร์เทรด -ปทุมธานี.xlsx', customers, factories),
    { customerId: 'c1', factoryLocationId: 'f1' }
  )
  // เว้นวรรครอบตัวคั่นไม่เหมือนกันก็ยังได้
  assert.deepEqual(
    matchFuelRateFilename('ASIA INTERTRADE - เอเชีย อินเตอร์เทรด - ปทุมธานี.xlsx', customers, factories),
    { customerId: 'c1', factoryLocationId: 'f1' }
  )
  // ขีดยาว (en/em dash) ที่ Word/Excel ชอบแปลงให้
  assert.deepEqual(
    matchFuelRateFilename('ASIA INTERTRADE - เอเชีย อินเตอร์เทรด –ปทุมธานี.xlsx', customers, factories),
    { customerId: 'c1', factoryLocationId: 'f1' }
  )
})

test('matchFuelRateFilename: ชื่อโรงงานที่มี / หลายตัว ยังแยกลูกค้าถูก', () => {
  const customers = [{ id: 'c1', name: 'ASIA INTERTRADE' }]
  const factories = [{ id: 'f1', name: 'DC ลำลูกกา /ปทุมธานี /คลอง2' }]
  assert.deepEqual(
    matchFuelRateFilename('ASIA INTERTRADE - DC ลำลูกกา -ปทุมธานี -คลอง2.xlsx', customers, factories),
    { customerId: 'c1', factoryLocationId: 'f1' }
  )
})
