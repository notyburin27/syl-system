import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, addYears, dateToYmd, endOfMonth, isValidYmd, todayInBangkok, ymdToDate } from '../dateOnly'

test('todayInBangkok ใช้เวลาไทย ไม่ใช่ UTC', () => {
  assert.equal(todayInBangkok(new Date('2026-10-05T17:30:00Z')), '2026-10-06') // 00:30 น. เวลาไทย
  assert.equal(todayInBangkok(new Date('2026-10-05T16:59:59Z')), '2026-10-05') // 23:59 น. เวลาไทย
})

test('isValidYmd ตรวจวันที่มีอยู่จริง', () => {
  assert.equal(isValidYmd('2028-02-29'), true)
  assert.equal(isValidYmd('2027-02-29'), false)
  assert.equal(isValidYmd('2027-13-01'), false)
  assert.equal(isValidYmd('27-01-01'), false)
  assert.equal(isValidYmd('2027-1-01'), false)
})

test('ymdToDate / dateToYmd ไปกลับได้ตรง', () => {
  assert.equal(ymdToDate('2027-03-31').toISOString(), '2027-03-31T00:00:00.000Z')
  assert.equal(dateToYmd(ymdToDate('2027-03-31')), '2027-03-31')
})

test('addDays ข้ามเดือนและปี', () => {
  assert.equal(addDays('2027-03-31', 1), '2027-04-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-10-06', -6), '2026-09-30')
})

test('addYears: 29 ก.พ. ปีถัดไปเป็น 28 ก.พ.', () => {
  assert.equal(addYears('2027-03-31', 1), '2028-03-31')
  assert.equal(addYears('2028-02-29', 1), '2029-02-28')
})

test('endOfMonth รวมเดือน ก.พ. ปีอธิกสุรทิน', () => {
  assert.equal(endOfMonth('2028-02-10'), '2028-02-29')
  assert.equal(endOfMonth('2027-02-01'), '2027-02-28')
  assert.equal(endOfMonth('2026-12-05'), '2026-12-31')
})
