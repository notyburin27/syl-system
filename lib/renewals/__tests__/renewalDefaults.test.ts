import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextPeriodDefaults, validateNewPeriod } from '../renewalDefaults'

test('nextPeriodDefaults: เริ่มวันถัดจากวันหมดเดิม หมดอีก 1 ปี', () => {
  assert.deepEqual(nextPeriodDefaults('2027-03-31'), { startDate: '2027-04-01', endDate: '2028-03-31' })
  assert.deepEqual(nextPeriodDefaults('2028-02-29'), { startDate: '2028-03-01', endDate: '2029-02-28' })
})

test('validateNewPeriod', () => {
  assert.equal(validateNewPeriod('2027-03-31', '2027-04-01', '2028-03-31'), null)
  assert.equal(validateNewPeriod('2027-03-31', null, '2028-03-31'), null)
  assert.equal(validateNewPeriod('2027-03-31', null, '2027-03-31'), 'วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม')
  assert.equal(validateNewPeriod('2027-03-31', '2028-04-01', '2028-03-31'), 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม')
  assert.equal(validateNewPeriod('2027-03-31', null, '2028-02-30'), 'วันสิ้นสุดไม่ถูกต้อง')
  assert.equal(validateNewPeriod('2027-03-31', '2028-13-01', '2028-03-31'), 'วันเริ่มไม่ถูกต้อง')
})
