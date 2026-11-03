import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareDateNullsLast } from '../tableSort'

const sortDates = (dates: (string | null)[], sortOrder: 'ascend' | 'descend') => {
  // จำลอง antd: ตอน descend จะกลับผล compare
  const sign = sortOrder === 'descend' ? -1 : 1
  return [...dates].sort((a, b) => sign * compareDateNullsLast(a, b, sortOrder))
}

test('compareDateNullsLast: เรียงวันที่ และวันที่ว่างอยู่ท้ายทั้ง ascend/descend', () => {
  const dates = [null, '2026-10-20', '2026-10-05', null, '2026-11-01']
  assert.deepEqual(sortDates(dates, 'ascend'), ['2026-10-05', '2026-10-20', '2026-11-01', null, null])
  assert.deepEqual(sortDates(dates, 'descend'), ['2026-11-01', '2026-10-20', '2026-10-05', null, null])
})
