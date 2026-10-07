import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTaxWaivedBySuspension } from '../suspension'

const suspended = (statusDate: string | null) => ({ status: 'SUSPENDED' as const, statusDate })
const tax = { type: 'TAX' as const, endDate: '2026-12-31' }

test('isTaxWaivedBySuspension: แจ้ง ม.89 ก่อนหรือตรงวันครบกำหนดภาษี → ไม่ต้องต่อ', () => {
  assert.equal(isTaxWaivedBySuspension(suspended('2026-10-01'), tax), true)
  assert.equal(isTaxWaivedBySuspension(suspended('2026-12-31'), tax), true)
})

test('isTaxWaivedBySuspension: แจ้งหลังวันครบกำหนด / ยังไม่กรอกวันที่แจ้ง → ต้องต่อ', () => {
  assert.equal(isTaxWaivedBySuspension(suspended('2027-01-01'), tax), false)
  assert.equal(isTaxWaivedBySuspension(suspended(null), tax), false)
})

test('isTaxWaivedBySuspension: ใช้เฉพาะภาษีของรถงดใช้', () => {
  assert.equal(isTaxWaivedBySuspension(suspended('2026-10-01'), { type: 'PRB', endDate: '2026-12-31' }), false)
  assert.equal(isTaxWaivedBySuspension({ status: 'ACTIVE', statusDate: '2026-10-01' }, tax), false)
})
