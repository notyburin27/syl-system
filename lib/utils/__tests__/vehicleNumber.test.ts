import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vehicleNumberError } from '../vehicleNumber'

test('vehicleNumberError: เบอร์รถปกติผ่าน', () => {
  for (const v of ['Y02', '127', 'SYL 50', '70-1234', '', '  Y01  ']) {
    assert.equal(vehicleNumberError(v), null, v)
  }
})

test('vehicleNumberError: ว่าง/ไม่ส่งมาผ่าน (ฟิลด์ไม่บังคับ)', () => {
  assert.equal(vehicleNumberError(undefined), null)
  assert.equal(vehicleNumberError(null), null)
})

test('vehicleNumberError: มีอักษรไทยปน → error', () => {
  // นิคหิต (U+0E4D) ติดมาตอนลืมสลับแป้น — เคสจริงใน prod
  assert.ok(vehicleNumberError('ํY02'))
  assert.ok(vehicleNumberError('ฮ123'))
  assert.ok(vehicleNumberError('SYL 51 พ่วง'))
  assert.ok(vehicleNumberError('12๓'))
})
