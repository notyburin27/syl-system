import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateFuelStandardRows, type FuelStandardImportRow } from '../fuelStandardImport'

const LOCS = [
  { id: 'p1', name: 'CMA/KM.18', type: 'general' },
  { id: 'f1', name: 'โรงงาน B', type: 'factory' },
  { id: 'r1', name: 'SYL', type: 'general' },
]

const row = (over: Partial<FuelStandardImportRow> = {}): FuelStandardImportRow => ({
  size: '40DC',
  pickupLocationName: 'CMA/KM.18',
  factoryLocationName: 'โรงงาน B',
  returnLocationName: 'SYL',
  liters: '300',
  ...over,
})

test('แถวถูกต้อง → resolve เป็น id และลิตรเป็นตัวเลข', () => {
  const r = validateFuelStandardRows([row()], LOCS)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.resolved, [
    { size: '40DC', pickupLocationId: 'p1', factoryLocationId: 'f1', returnLocationId: 'r1', liters: 300 },
  ])
})

test('โรงงานว่าง → factoryLocationId = null', () => {
  const r = validateFuelStandardRows([row({ factoryLocationName: undefined })], LOCS)
  assert.deepEqual(r.errors, [])
  assert.equal(r.resolved[0].factoryLocationId, null)
})

test('ไม่พบสถานที่ → error ไม่สร้างสถานที่ใหม่', () => {
  const r = validateFuelStandardRows([row({ pickupLocationName: 'CMA/KM18' })], LOCS)
  assert.deepEqual(r.errors, [{ row: 1, field: 'pickupLocationName', message: 'ไม่พบสถานที่ "CMA/KM18"' }])
  assert.equal(r.resolved.length, 0)
})

test('ชื่อในคอลัมน์โรงงานไม่ใช่ type factory → error', () => {
  const r = validateFuelStandardRows([row({ factoryLocationName: 'SYL' })], LOCS)
  assert.equal(r.errors[0].field, 'factoryLocationName')
  assert.equal(r.errors[0].message, '"SYL" ไม่ใช่สถานที่ประเภทโรงงาน')
})

test('SIZE ไม่อยู่ในรายการ / ขาดสถานที่รับ-คืนตู้ → error', () => {
  const r = validateFuelStandardRows(
    [row({ size: '99XX' }), row({ pickupLocationName: undefined, returnLocationName: undefined })],
    LOCS,
  )
  assert.deepEqual(
    r.errors.map((e) => [e.row, e.field]),
    [[1, 'size'], [2, 'pickupLocationName'], [2, 'returnLocationName']],
  )
})

test('ลิตรไม่ใช่ตัวเลข หรือติดลบ → error', () => {
  const r = validateFuelStandardRows([row({ liters: 'abc' }), row({ liters: '-5', size: '20DC' }), row({ liters: undefined, size: '20RF' })], LOCS)
  assert.deepEqual(r.errors.map((e) => e.row), [1, 2, 3])
  assert.ok(r.errors.every((e) => e.field === 'liters'))
})

test('key ซ้ำกันในไฟล์ → error ที่แถวหลัง', () => {
  const r = validateFuelStandardRows([row(), row({ liters: '310' })], LOCS)
  assert.deepEqual(r.errors, [{ row: 2, field: 'size', message: 'ข้อมูลซ้ำในไฟล์ (แถว 1, 2)' }])
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
