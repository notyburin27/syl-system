import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bulkRenewSchema,
  bulkStatusSchema,
  coverageFieldsSchema,
  firstZodError,
  insurerCreateSchema,
  insurerUpdateSchema,
  sanitizeCoverageFields,
  vehicleInputSchema,
} from '../schemas'

function errorOf(result: { success: boolean; error?: Parameters<typeof firstZodError>[0] }): string {
  assert.equal(result.success, false)
  return firstZodError(result.error!)
}

test('vehicleInputSchema: normalize ทะเบียน, ค่าว่างเป็น null, สถานะเริ่มต้นใช้งาน', () => {
  const r = vehicleInputSchema.parse({ plate: ' 64-5598  กท. ', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', brand: '' })
  assert.equal(r.plate, '64-5598 กท')
  assert.equal(r.brand, null)
  assert.equal(r.weightKg, null)
  assert.equal(r.status, 'ACTIVE')
  assert.equal(r.currentLocation, null)
})

test('vehicleInputSchema: รถอยู่ไหน — ต้องเป็นตัวเลือกที่กำหนด, null = ไม่ระบุ', () => {
  const base = { plate: '64-0212', ownerName: 'a', vehicleType: 'b' }
  assert.equal(vehicleInputSchema.parse({ ...base, currentLocation: 'โรงสี' }).currentLocation, 'โรงสี')
  assert.equal(vehicleInputSchema.parse({ ...base, currentLocation: null }).currentLocation, null)
  assert.equal(errorOf(vehicleInputSchema.safeParse({ ...base, currentLocation: 'อู่บางนา' })), 'ข้อมูลไม่ถูกต้อง: currentLocation')
})

test('vehicleInputSchema: ทะเบียนว่าง (มีแต่จุด) → error ไทย', () => {
  assert.equal(errorOf(vehicleInputSchema.safeParse({ plate: ' . ', ownerName: 'a', vehicleType: 'b' })), 'กรุณากรอกทะเบียน')
})

test('vehicleInputSchema: ข้อมูลรถเพิ่มเติม — จังหวัดต้องอยู่ในรายชื่อ, วันที่จดทะเบียน, ขนาดเครื่องยนต์เป็นจำนวนเต็ม', () => {
  const base = { plate: '64-0212', ownerName: 'a', vehicleType: 'b' }
  const r = vehicleInputSchema.parse({
    ...base,
    plateProvince: 'ชลบุรี',
    registrationDate: '2020-05-01',
    modelName: ' R450 ',
    engineCylinders: 6,
    engineHorsepower: 450,
    axleCount: 3,
  })
  assert.equal(r.plateProvince, 'ชลบุรี')
  assert.equal(r.registrationDate, '2020-05-01')
  assert.equal(r.modelName, 'R450')
  assert.equal(r.chassisPosition, null)
  assert.equal(r.engineCylinders, 6)
  assert.equal(vehicleInputSchema.parse(base).plateProvince, null)

  assert.equal(errorOf(vehicleInputSchema.safeParse({ ...base, plateProvince: 'กท' })), 'ข้อมูลไม่ถูกต้อง: plateProvince')
  assert.equal(errorOf(vehicleInputSchema.safeParse({ ...base, registrationDate: '2021-02-29' })), 'วันที่ไม่ถูกต้อง')
  assert.equal(errorOf(vehicleInputSchema.safeParse({ ...base, axleCount: 2.5 })), 'ข้อมูลไม่ถูกต้อง: axleCount')
  assert.equal(errorOf(vehicleInputSchema.safeParse({ ...base, engineHorsepower: -1 })), 'แรงม้าต้องไม่ติดลบ')
})

test('coverageFieldsSchema: วันที่ไม่มีจริง / วันเริ่มหลังวันสิ้นสุด / เงินเกิน Decimal(10,2)', () => {
  assert.equal(errorOf(coverageFieldsSchema.safeParse({ endDate: '2027-02-29' })), 'วันที่ไม่ถูกต้อง')
  assert.equal(
    errorOf(coverageFieldsSchema.safeParse({ startDate: '2027-04-01', endDate: '2027-03-31' })),
    'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม',
  )
  assert.equal(
    errorOf(coverageFieldsSchema.safeParse({ endDate: '2027-03-31', amount: 100_000_000 })),
    'จำนวนเงินต้องไม่เกิน 99,999,999.99',
  )
  const ok = coverageFieldsSchema.parse({ endDate: '2027-03-31', policyNumber: '  ' })
  assert.equal(ok.policyNumber, null)
  assert.equal(ok.startDate, null)
})

test('bulkStatusSchema: ไม่ต่อต้องมีเหตุผล, อื่นๆ ต้องมีหมายเหตุ', () => {
  assert.equal(errorOf(bulkStatusSchema.safeParse({ ids: ['a'], status: 'NOT_RENEWED' })), 'กรุณาเลือกเหตุผลที่ไม่ต่อ')
  assert.equal(
    errorOf(bulkStatusSchema.safeParse({ ids: ['a'], status: 'NOT_RENEWED', reason: 'OTHER', note: ' ' })),
    'เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ',
  )
  assert.equal(bulkStatusSchema.safeParse({ ids: ['a'], status: 'IN_PROGRESS' }).success, true)
})

test('bulkRenewSchema: เกิน 500 รายการ / ไม่เลือกเลย → error', () => {
  const ids = Array.from({ length: 501 }, (_, i) => `id${i}`)
  assert.equal(errorOf(bulkRenewSchema.safeParse({ ids, endDate: '2027-03-31' })), 'เลือกได้ไม่เกิน 500 รายการ')
  assert.equal(errorOf(bulkRenewSchema.safeParse({ ids: [], endDate: '2027-03-31' })), 'กรุณาเลือกรายการ')
})

test('insurerCreateSchema: ชื่อว่าง → error ไทย, รับ names[]', () => {
  assert.equal(errorOf(insurerCreateSchema.safeParse({ name: ' ' })), 'กรุณากรอกชื่อบริษัทประกัน')
  assert.equal(errorOf(insurerCreateSchema.safeParse({})), 'กรุณากรอกชื่อบริษัทประกัน')
  assert.deepEqual(insurerCreateSchema.parse({ names: [' ก ', 'ข'] }).names, ['ก', 'ข'])
})

test('sanitizeCoverageFields: ล้างฟิลด์ที่ไม่ใช้กับประเภทนั้น', () => {
  const f = { insurerId: 'ins', agentName: 'ตัวแทน ก', coverageClass: 'ป.3', pairedVehicleId: 'v2', endDate: '2027-01-01' }
  assert.deepEqual(sanitizeCoverageFields('TAX', f), {
    ...f,
    insurerId: null,
    agentName: null,
    coverageClass: null,
    pairedVehicleId: null,
  })
  assert.deepEqual(sanitizeCoverageFields('CARGO_INSURANCE', f), { ...f, coverageClass: null, pairedVehicleId: null })
  assert.deepEqual(sanitizeCoverageFields('PRB', f), { ...f, coverageClass: null, pairedVehicleId: null })
  assert.deepEqual(sanitizeCoverageFields('MOTOR_INSURANCE', f), f)
})

test('firstZodError: type/enum error ของ zod เป็นข้อความไทยที่ระบุฟิลด์', () => {
  assert.equal(errorOf(insurerUpdateSchema.safeParse({ isActive: 'x' })), 'ข้อมูลไม่ถูกต้อง: isActive')
  assert.equal(errorOf(insurerCreateSchema.safeParse({ name: 123 })), 'ข้อมูลไม่ถูกต้อง: name')
  assert.equal(errorOf(bulkStatusSchema.safeParse({ ids: ['a'], status: 'WRONG' })), 'ข้อมูลไม่ถูกต้อง: status')
  assert.equal(errorOf(bulkRenewSchema.safeParse({ ids: ['a'] })), 'กรุณากรอก endDate')
})
