import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COVERAGE_TYPE_LABELS } from '../../constants'
import { lookupLabel, parseImportDate, parseImportInt, parseImportMoney } from '../cells'

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

test('lookupLabel: ไม่สนจุด/ช่องว่าง; ว่าง = null; ไม่ตรงตัวเลือก = undefined', () => {
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, 'พรบ'), 'PRB')
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, ' ประกัน รถยนต์ '), 'MOTOR_INSURANCE')
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, ''), null)
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, 'ประกันภัย'), undefined)
})
