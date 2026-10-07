import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COVERAGE_TYPE_LABELS } from '../../constants'
import { lookupLabel, parseImportDate, parseImportInt, parseImportMoney, parseImportProvince } from '../cells'

test('parseImportDate: date cell, พ.ศ./ค.ศ. 4 หลัก, คั่นด้วย - ได้, YYYY-MM-DD, ว่าง', () => {
  assert.deepEqual(parseImportDate(new Date(Date.UTC(2027, 2, 31))), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate('31/03/2570'), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate('9-1-2569'), { value: '2026-01-09' })
  assert.deepEqual(parseImportDate('31/03/2027'), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate('2027-03-31'), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate(''), { value: null })
  assert.deepEqual(parseImportDate(null), { value: null })
})

test('parseImportDate: ปี 2 หลักไม่เดาศตวรรษ, วันที่ไม่มีจริง', () => {
  assert.deepEqual(parseImportDate('31/03/70'), {
    error: 'วันที่ "31/03/70" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570',
  })
  assert.deepEqual(parseImportDate('29/02/2570'), { error: 'วันที่ "29/02/2570" ไม่มีอยู่จริง' })
})

test('parseImportMoney: คอมมา, ตัวเลข, ว่าง, ติดลบ, เกิน, ไม่ใช่ตัวเลข', () => {
  assert.deepEqual(parseImportMoney('13,449.50'), { value: 13449.5 })
  assert.deepEqual(parseImportMoney(19900), { value: 19900 })
  assert.deepEqual(parseImportMoney(''), { value: null })
  assert.deepEqual(parseImportMoney('-1'), { error: 'จำนวนเงินต้องไม่ติดลบ' })
  assert.deepEqual(parseImportMoney(100_000_000), { error: 'จำนวนเงินต้องไม่เกิน 99,999,999.99' })
  assert.deepEqual(parseImportMoney('ไม่ต่อ'), { error: '"ไม่ต่อ" ไม่ใช่ตัวเลข' })
})

test('parseImportInt: คอมมาได้ ทศนิยมไม่ได้', () => {
  assert.deepEqual(parseImportInt('7,900'), { value: 7900 })
  assert.deepEqual(parseImportInt('7.5'), { error: 'ต้องเป็นจำนวนเต็ม' })
  assert.deepEqual(parseImportInt(null), { value: null })
})

test('parseImportInt: ค่าสูงสุดกำหนดได้ (default 100,000)', () => {
  assert.deepEqual(parseImportInt('100,001'), { error: 'ต้องอยู่ระหว่าง 0 ถึง 100,000' })
  assert.deepEqual(parseImportInt(20, 20), { value: 20 })
  assert.deepEqual(parseImportInt(21, 20), { error: 'ต้องอยู่ระหว่าง 0 ถึง 20' })
  assert.deepEqual(parseImportInt('10001', 10_000), { error: 'ต้องอยู่ระหว่าง 0 ถึง 10,000' })
  assert.deepEqual(parseImportInt('-1', 100), { error: 'ต้องอยู่ระหว่าง 0 ถึง 100' })
})

test('parseImportProvince: ชื่อเต็ม, ช่องว่าง, จ./จังหวัด นำหน้า, ํา → ำ, กรุงเทพฯ / กทม.; ไม่รู้จัก → error', () => {
  assert.deepEqual(parseImportProvince(' ชลบุรี '), { value: 'ชลบุรี' })
  assert.deepEqual(parseImportProvince('นคร ราชสีมา'), { value: 'นครราชสีมา' })
  assert.deepEqual(parseImportProvince('จ.ระยอง'), { value: 'ระยอง' })
  assert.deepEqual(parseImportProvince('จังหวัด สมุทรปราการ'), { value: 'สมุทรปราการ' })
  assert.deepEqual(parseImportProvince('ล\u0E4D\u0E32ปาง'), { value: 'ลำปาง' })
  for (const bkk of ['กรุงเทพมหานคร', 'กรุงเทพฯ', 'กรุงเทพ', 'กทม', 'กทม.']) {
    assert.deepEqual(parseImportProvince(bkk), { value: 'กรุงเทพมหานคร' })
  }
  assert.deepEqual(parseImportProvince(''), { value: null })
  assert.deepEqual(parseImportProvince(null), { value: null })
  assert.deepEqual(parseImportProvince('ชบ'), { error: 'ไม่พบจังหวัด "ชบ" — กรอกชื่อจังหวัดเต็ม เช่น กรุงเทพมหานคร, ชลบุรี' })
})

test('lookupLabel: ไม่สนจุด/ช่องว่าง; ว่าง = null; ไม่ตรงตัวเลือก = undefined', () => {
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, 'พรบ'), 'PRB')
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, ' ประกัน รถยนต์ '), 'MOTOR_INSURANCE')
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, ''), null)
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, 'ประกันภัย'), undefined)
})

test('parseImportDate: ปี พ.ศ. จาก date cell / ISO text แปลงด้วย; ปีนอก 2000–2200 (เช่น 1970) ไม่รับ', () => {
  assert.deepEqual(parseImportDate(new Date(Date.UTC(2570, 2, 31))), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate('2570-03-31'), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate(new Date(Date.UTC(1970, 2, 31))), {
    error: 'วันที่ "1970-03-31" ปีไม่สมเหตุผล (1970) — ถ้าพิมพ์ปี 2 หลัก Excel อาจแปลงให้ผิด ให้ใช้ วว/ดด/ปปปป เช่น 31/03/2570',
  })
})
