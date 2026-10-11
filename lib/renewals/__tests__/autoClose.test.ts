import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planAutoClose, type AutoCloseRow } from '../autoClose'

const row = (id: string, endDate: string, renewalStatus: AutoCloseRow['renewalStatus'] = 'PENDING', renewedToId: string | null = null): AutoCloseRow => ({
  id,
  endDate,
  renewalStatus,
  renewedToId,
})

test('งวดเดียว → ไม่ปิดอะไร', () => {
  assert.deepEqual(planAutoClose([row('a', '2026-03-31')]), [])
})

test('งวดเปิดที่เก่ากว่า → ปิดและผูกกับงวดถัดไป (ไม่ขึ้นกับลำดับ input)', () => {
  assert.deepEqual(planAutoClose([row('new', '2027-03-31'), row('old', '2026-03-31', 'IN_PROGRESS')]), [
    { id: 'old', linkToId: 'new' },
  ])
})

test('สามงวดเปิด → ผูกเป็นสาย a→b→c', () => {
  assert.deepEqual(planAutoClose([row('a', '2025-03-31'), row('b', '2026-03-31'), row('c', '2027-03-31')]), [
    { id: 'a', linkToId: 'b' },
    { id: 'b', linkToId: 'c' },
  ])
})

test('งวดถัดไปมีงวดก่อนหน้าชี้อยู่แล้ว → ปิดโดยไม่ผูก (renewedToId ต้อง unique)', () => {
  const rows = [row('x', '2025-03-31', 'RENEWED', 'new'), row('old', '2026-03-31'), row('new', '2027-03-31')]
  assert.deepEqual(planAutoClose(rows), [{ id: 'old', linkToId: null }])
})

test('งวดที่ปิดแล้ว (ไม่ต่อ/ต่อแล้ว) ไม่แตะ', () => {
  assert.deepEqual(planAutoClose([row('old', '2026-03-31', 'NOT_RENEWED'), row('new', '2027-03-31')]), [])
})
