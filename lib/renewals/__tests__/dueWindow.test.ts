import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueBucket, endOfNextMonth } from '../dueWindow'

test('endOfNextMonth: วันนี้ 6 ต.ค. → 30 พ.ย., ธ.ค. ข้ามปี, ม.ค. → ก.พ. อธิกสุรทิน', () => {
  assert.equal(endOfNextMonth('2026-10-06'), '2026-11-30')
  assert.equal(endOfNextMonth('2026-12-15'), '2027-01-31')
  assert.equal(endOfNextMonth('2028-01-31'), '2028-02-29')
})

test('dueBucket ตามขอบวัน', () => {
  const today = '2026-10-06'
  assert.equal(dueBucket('2026-10-05', today), 'OVERDUE')
  assert.equal(dueBucket('2026-10-06', today), 'THIS_MONTH')
  assert.equal(dueBucket('2026-10-31', today), 'THIS_MONTH')
  assert.equal(dueBucket('2026-11-01', today), 'NEXT_MONTH')
  assert.equal(dueBucket('2026-11-30', today), 'NEXT_MONTH')
  assert.equal(dueBucket('2026-12-01', today), 'LATER')
})
