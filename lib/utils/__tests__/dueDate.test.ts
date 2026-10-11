import { test } from 'node:test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import { nextMonthDueDate, isValidDueDay } from '../dueDate'

const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')

test('nextMonthDueDate: วันที่ของเดือนถัดไป', () => {
  assert.equal(fmt(nextMonthDueDate(5, dayjs('2026-10-11'))), '2026-11-05')
  assert.equal(fmt(nextMonthDueDate(5, dayjs('2026-10-01'))), '2026-11-05')
  assert.equal(fmt(nextMonthDueDate(25, dayjs('2026-10-31'))), '2026-11-25')
})

test('nextMonthDueDate: ข้ามปี', () => {
  assert.equal(fmt(nextMonthDueDate(10, dayjs('2026-12-20'))), '2027-01-10')
})

test('nextMonthDueDate: เดือนถัดไปไม่มีวันนั้น → วันสุดท้ายของเดือน', () => {
  assert.equal(fmt(nextMonthDueDate(31, dayjs('2027-01-15'))), '2027-02-28')
  assert.equal(fmt(nextMonthDueDate(30, dayjs('2028-01-31'))), '2028-02-29')
  assert.equal(fmt(nextMonthDueDate(31, dayjs('2026-10-11'))), '2026-11-30')
})

test('isValidDueDay: รับ null/undefined และ 1–31 เท่านั้น', () => {
  for (const ok of [null, undefined, 1, 15, 31]) assert.equal(isValidDueDay(ok), true, String(ok))
  for (const bad of [0, 32, 5.5, '5', -1]) assert.equal(isValidDueDay(bad), false, String(bad))
})
