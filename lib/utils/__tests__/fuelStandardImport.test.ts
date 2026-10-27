import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateFuelStandardRows, type FuelStandardImportRow } from '../fuelStandardImport'

const LOCS = [
  { id: 'w1', name: 'WINWIN', type: 'general' },
  { id: 'f1', name: 'โรงงาน B', type: 'factory' },
  { id: 'r1', name: 'SYL', type: 'general' },
]

const row = (over: Partial<FuelStandardImportRow> = {}): FuelStandardImportRow => ({
  kind: 'วิ่ง',
  size: '40DC',
  locationName: 'โรงงาน B',
  pickupLaemChabang: '',
  returnLaemChabang: '',
  liters: '300',
  ...over,
})

test('แถวงานวิ่งถูกต้อง → resolve เป็น id และลิตรเป็นตัวเลข', () => {
  const r = validateFuelStandardRows([row()], LOCS)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.resolved, [
    { kind: 'run', size: '40DC', locationId: 'f1', pickupLaemChabang: false, returnLaemChabang: false, liters: 300 },
  ])
})

test('ประเภทรับทั้งไทยและอังกฤษ, รับ/คืนแหลมฉบัง Y/ใช่/1 = true แยกกัน', () => {
  const r = validateFuelStandardRows(
    [
      row({ kind: 'run', pickupLaemChabang: 'Y' }),
      row({ returnLaemChabang: 'Y', size: '20DC' }),
      row({ pickupLaemChabang: 'Y', returnLaemChabang: 'ใช่', size: '20RF' }),
      row({ kind: 'ทอย', locationName: 'WINWIN', pickupLaemChabang: undefined, returnLaemChabang: undefined }),
      row({ kind: 'Towing', size: '20DC', locationName: 'WINWIN', pickupLaemChabang: 'N' }),
    ],
    LOCS,
  )
  assert.deepEqual(r.errors, [])
  assert.deepEqual(
    r.resolved.map((x) => [x.kind, x.locationId, x.pickupLaemChabang, x.returnLaemChabang]),
    [
      ['run', 'f1', true, false],
      ['run', 'f1', false, true],
      ['run', 'f1', true, true],
      ['towing', 'w1', false, false],
      ['towing', 'w1', false, false],
    ],
  )
  for (const v of ['ใช่', '1', ' y ']) {
    assert.equal(validateFuelStandardRows([row({ pickupLaemChabang: v })], LOCS).resolved[0].pickupLaemChabang, true)
  }
})

test('ประเภทว่างหรือผิด → error', () => {
  const r = validateFuelStandardRows([row({ kind: undefined }), row({ kind: 'ขาเข้า', size: '20DC' })], LOCS)
  assert.deepEqual(r.errors.map((e) => [e.row, e.field]), [[1, 'kind'], [2, 'kind']])
})

test('ไม่พบสถานที่ → error ไม่สร้างสถานที่ใหม่', () => {
  const r = validateFuelStandardRows([row({ locationName: 'โรงงานB' })], LOCS)
  assert.deepEqual(r.errors, [{ row: 1, field: 'locationName', message: 'ไม่พบสถานที่ "โรงงานB"' }])
  assert.equal(r.resolved.length, 0)
})

test('งานวิ่งต้องเป็นโรงงาน, งานทอยใช้สถานที่ใดก็ได้', () => {
  const run = validateFuelStandardRows([row({ locationName: 'SYL' })], LOCS)
  assert.equal(run.errors[0].field, 'locationName')
  assert.equal(run.errors[0].message, '"SYL" ไม่ใช่สถานที่ประเภทโรงงาน (งานวิ่งต้องเป็นโรงงาน)')

  assert.deepEqual(validateFuelStandardRows([row({ kind: 'ทอย', locationName: 'SYL' })], LOCS).errors, [])
})

test('แหลมฉบังค่าผิด หรืองานทอยติ๊กแหลมฉบัง → error', () => {
  const r = validateFuelStandardRows(
    [row({ returnLaemChabang: 'maybe' }), row({ kind: 'ทอย', locationName: 'WINWIN', pickupLaemChabang: 'Y' })],
    LOCS,
  )
  assert.deepEqual(
    r.errors.map((e) => [e.row, e.field, e.message]),
    [
      [1, 'returnLaemChabang', 'คืนแหลมฉบัง "maybe" ไม่ถูกต้อง (ใช้ Y หรือเว้นว่าง)'],
      [2, 'pickupLaemChabang', 'งานทอยไม่ต้องระบุรับแหลมฉบัง'],
    ],
  )
})

test('SIZE ไม่อยู่ในรายการ / ขาดสถานที่ → error', () => {
  const r = validateFuelStandardRows([row({ size: '99XX' }), row({ locationName: undefined, size: '20DC' })], LOCS)
  assert.deepEqual(r.errors.map((e) => [e.row, e.field]), [[1, 'size'], [2, 'locationName']])
})

test('ลิตรไม่ใช่ตัวเลข หรือติดลบ → error', () => {
  const r = validateFuelStandardRows([row({ liters: 'abc' }), row({ liters: '-5', size: '20DC' }), row({ liters: undefined, size: '20RF' })], LOCS)
  assert.deepEqual(r.errors.map((e) => e.row), [1, 2, 3])
  assert.ok(r.errors.every((e) => e.field === 'liters'))
})

test('key ซ้ำกันในไฟล์ → error ที่แถวหลัง (เทียบหลังแปลงค่า)', () => {
  const r = validateFuelStandardRows([row({ pickupLaemChabang: 'Y' }), row({ kind: 'run', pickupLaemChabang: 'ใช่', liters: '310' })], LOCS)
  assert.deepEqual(r.errors, [{ row: 2, field: 'kind', message: 'ข้อมูลซ้ำในไฟล์ (แถว 1, 2)' }])
  assert.equal(validateFuelStandardRows([row({ returnLaemChabang: '' }), row({ returnLaemChabang: 'N' })], LOCS).errors.length, 1)
})

test('กรุงเทพ / รับแหลม / คืนแหลม ของโรงงานเดียวกันไม่ถือว่าซ้ำ', () => {
  assert.deepEqual(
    validateFuelStandardRows([row(), row({ pickupLaemChabang: 'Y' }), row({ returnLaemChabang: 'Y' })], LOCS).errors,
    [],
  )
})

test('ลิตรว่างเปล่า / ช่องว่าง / infinity / เกิน Decimal(10,2) → error', () => {
  for (const liters of ['  ', '1e999', '100000000']) {
    const r = validateFuelStandardRows([row({ liters })], LOCS)
    assert.equal(r.errors.length, 1, `liters=${JSON.stringify(liters)}`)
    assert.equal(r.errors[0].field, 'liters')
    assert.equal(r.resolved.length, 0)
  }
  assert.equal(
    validateFuelStandardRows([row({ liters: '100000000' })], LOCS).errors[0].message,
    'ลิตรต้องไม่เกิน 99,999,999.99',
  )
  assert.deepEqual(validateFuelStandardRows([row({ liters: ' 99999999.99 ' })], LOCS).errors, [])
})
