import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JOB_NUMBER_FORMAT_ERROR,
  JOB_NUMBER_REQUIRED_ERROR,
  isAutoNumberJobType,
  validateJobNumber,
  resolveJobNumberChange,
} from '../jobNumber'

test('validateJobNumber: ไม่มีไทย/จุด → ผ่าน (รวมรูปแบบ A และรูปแบบอื่น)', () => {
  for (const v of [
    '163339/544310',
    '163608/545167-1',
    '161616/538122-23',
    'A5',
    'A33',
    'A47/B155040',
    '16262/541833', // ไม่ใช่ 6/6 แต่ไม่ผิดกฎบันทึก
    '162954542990',
    '163735/ACCIDENT',
  ]) {
    assert.deepEqual(validateJobNumber(v), { ok: true, value: v }, v)
  }
})

test('validateJobNumber: trim อย่างเดียว ไม่ normalize อย่างอื่น', () => {
  assert.deepEqual(validateJobNumber('  163339/544310 '), { ok: true, value: '163339/544310' })
  // ช่องว่างกลาง / ตัวเต็มความกว้าง / zero-width ไม่ถูกแตะ
  assert.deepEqual(validateJobNumber('163339 / 544310'), { ok: true, value: '163339 / 544310' })
  assert.deepEqual(validateJobNumber('１６３３３９'), { ok: true, value: '１６３３３９' })
  assert.deepEqual(validateJobNumber('163339/​544310'), { ok: true, value: '163339/​544310' })
})

test('validateJobNumber: มีอักษรไทยใดๆ → ผิด', () => {
  for (const v of [
    'ิ163700/545513', // สระอิ นำหน้า
    '163735/ตู้อุบัติเหตุ',
    '๑๖๓๓๓๙/๕๔๔๓๑๐', // เลขไทย
    '163339/544310่', // วรรณยุกต์
    'ก',
  ]) {
    const r = validateJobNumber(v)
    assert.equal(r.ok, false, v)
    assert.equal(!r.ok && r.error, JOB_NUMBER_FORMAT_ERROR, v)
  }
})

test('validateJobNumber: มีจุด → ผิด', () => {
  for (const v of ['16420.3/547228', '163339/544310.', '.']) {
    const r = validateJobNumber(v)
    assert.equal(!r.ok && r.error, JOB_NUMBER_FORMAT_ERROR, v)
  }
})

test('validateJobNumber: ว่าง → กรุณากรอก', () => {
  for (const v of ['', '   ', null, undefined]) {
    const r = validateJobNumber(v)
    assert.equal(!r.ok && r.error, JOB_NUMBER_REQUIRED_ERROR)
  }
})

test('isAutoNumberJobType: เฉพาะ advance/noJob', () => {
  assert.equal(isAutoNumberJobType('advance'), true)
  assert.equal(isAutoNumberJobType('noJob'), true)
  for (const t of ['inbound', 'outbound', 'towing', 'towingHeavy', 'flatbed', 'mill', '', null, undefined]) {
    assert.equal(isAutoNumberJobType(t), false, String(t))
  }
})

test('resolveJobNumberChange: งานเก่าที่ผิดกฎ ส่งค่าเดิมมา → ผ่าน ไม่เปลี่ยน', () => {
  assert.deepEqual(
    resolveJobNumberChange({ input: '16420.3/547228', current: '16420.3/547228', jobType: 'outbound' }),
    { ok: true, value: '16420.3/547228', changed: false },
  )
  assert.deepEqual(
    resolveJobNumberChange({ input: ' ิ163700/545513 ', current: 'ิ163700/545513', jobType: 'outbound' }),
    { ok: true, value: 'ิ163700/545513', changed: false },
  )
})

test('resolveJobNumberChange: เปลี่ยนเป็นค่าที่ผิดกฎ → ปฏิเสธ', () => {
  assert.deepEqual(
    resolveJobNumberChange({ input: '16420.4/547228', current: '16420.3/547228', jobType: 'outbound' }),
    { ok: false, error: JOB_NUMBER_FORMAT_ERROR },
  )
  assert.deepEqual(
    resolveJobNumberChange({ input: '163735/ตู้', current: '163735/544000', jobType: 'outbound' }),
    { ok: false, error: JOB_NUMBER_FORMAT_ERROR },
  )
})

test('resolveJobNumberChange: เปลี่ยนเป็นค่าที่ผ่านกฎ → บันทึกค่าหลัง trim', () => {
  assert.deepEqual(
    resolveJobNumberChange({ input: ' 164203/547228 ', current: '16420.3/547228', jobType: 'outbound' }),
    { ok: true, value: '164203/547228', changed: true },
  )
  assert.deepEqual(
    resolveJobNumberChange({ input: 'A47/B155040', current: 'A47', jobType: 'outbound' }),
    { ok: true, value: 'A47/B155040', changed: true },
  )
})

test('resolveJobNumberChange: ค่าว่าง → ปฏิเสธ', () => {
  assert.deepEqual(
    resolveJobNumberChange({ input: '  ', current: '163339/544310', jobType: 'inbound' }),
    { ok: false, error: JOB_NUMBER_REQUIRED_ERROR },
  )
})

test('resolveJobNumberChange: advance/noJob ไม่ตรวจกฎ (แค่ trim)', () => {
  assert.deepEqual(
    resolveJobNumberChange({ input: ' ADV-260514-101010 ', current: 'ADV-00001', jobType: 'advance' }),
    { ok: true, value: 'ADV-260514-101010', changed: true },
  )
})
