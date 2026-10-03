import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAbsorbPickupName, isAbsorbedBy, type AbsorbJob } from '../towingAbsorb'

const main = (over: Partial<AbsorbJob> = {}): AbsorbJob => ({
  id: 'main1',
  jobDate: new Date('2026-08-25'),
  jobType: 'outbound',
  size: '20DC',
  driverId: 'd1',
  customerId: 'c1',
  createdAt: new Date('2026-08-24T09:37:00Z'),
  isCancelled: false,
  clearStatus: false,
  ...over,
})

const towing = (over: Partial<AbsorbJob> = {}): AbsorbJob => ({
  id: 'tow1',
  jobDate: new Date('2026-08-25'),
  jobType: 'towing',
  size: '20DC',
  driverId: 'd1',
  customerId: 'c1',
  createdAt: new Date('2026-08-24T09:36:00Z'),
  isCancelled: false,
  clearStatus: false,
  ...over,
})

test('isAbsorbPickupName: คาหาง และ รับเช้าเดินทาง เป็นตัวชี้', () => {
  assert.equal(isAbsorbPickupName('คาหาง'), true)
  assert.equal(isAbsorbPickupName('รับเช้าเดินทาง'), true)
})

test('isAbsorbPickupName: สถานที่อื่นไม่ใช่ตัวชี้', () => {
  assert.equal(isAbsorbPickupName('BBT'), false)
  assert.equal(isAbsorbPickupName('ท่าเรือคลองเตย'), false)
  assert.equal(isAbsorbPickupName(''), false)
  assert.equal(isAbsorbPickupName(null), false)
  assert.equal(isAbsorbPickupName(undefined), false)
})

test('isAbsorbedBy: เข้าเกณฑ์ครบ', () => {
  assert.equal(isAbsorbedBy(towing(), main()), true)
})

test('isAbsorbedBy: ทอยตู้หนักก็ถูกดูดซับได้', () => {
  assert.equal(isAbsorbedBy(towing({ jobType: 'towingHeavy' }), main()), true)
})

test('isAbsorbedBy: ต้องเป็นทอยตู้เท่านั้น', () => {
  assert.equal(isAbsorbedBy(towing({ jobType: 'inbound' }), main()), false)
  assert.equal(isAbsorbedBy(towing({ jobType: 'outbound' }), main()), false)
  assert.equal(isAbsorbedBy(towing({ jobType: 'flatbed' }), main()), false)
})

test('isAbsorbedBy: คนละวันไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ jobDate: new Date('2026-08-26') }), main()), false)
})

test('isAbsorbedBy: คนละลูกค้าไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ customerId: 'c2' }), main()), false)
})

test('isAbsorbedBy: ลูกค้า null ทั้งคู่ก็ไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ customerId: null }), main({ customerId: null })), false)
})

test('isAbsorbedBy: คนละคนขับไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ driverId: 'd2' }), main()), false)
})

test('isAbsorbedBy: คนขับ null ไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ driverId: null }), main({ driverId: null })), false)
})

test('isAbsorbedBy: คนละ size ไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ size: '2x20DC' }), main({ size: '20DC' })), false)
})

test('isAbsorbedBy: size null ทั้งคู่ไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ size: null }), main({ size: null })), false)
})

test('isAbsorbedBy: ทอยตู้ที่สร้างหลังงานหลักไม่ถูกดูดซับ', () => {
  const t = towing({ createdAt: new Date('2026-08-24T09:38:00Z') })
  assert.equal(isAbsorbedBy(t, main()), false)
})

test('isAbsorbedBy: createdAt เท่ากันเป๊ะไม่ถูกดูดซับ', () => {
  const same = new Date('2026-08-24T09:37:00Z')
  assert.equal(isAbsorbedBy(towing({ createdAt: same }), main({ createdAt: same })), false)
})

test('isAbsorbedBy: งานที่ยกเลิกไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ isCancelled: true }), main()), false)
  assert.equal(isAbsorbedBy(towing(), main({ isCancelled: true })), false)
})

test('isAbsorbedBy: งานที่เคลียร์แล้วไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ clearStatus: true }), main()), false)
  assert.equal(isAbsorbedBy(towing(), main({ clearStatus: true })), false)
})

test('isAbsorbedBy: ดูดซับตัวเองไม่ได้', () => {
  const j = towing({ id: 'same' })
  assert.equal(isAbsorbedBy(j, main({ id: 'same' })), false)
})

test('isAbsorbedBy: ทอยตู้ที่ถูกจับคู่งานแล้วไม่ถูกดูดซับ แม้เข้าเกณฑ์อื่นครบ', () => {
  assert.equal(isAbsorbedBy(towing({ hasPairLink: true }), main()), false)
})

test('isAbsorbedBy: ทอยตู้ที่ไม่ได้จับคู่ยังถูกดูดซับได้ตามปกติ', () => {
  assert.equal(isAbsorbedBy(towing({ hasPairLink: false }), main()), true)
})

test('isAbsorbedBy: งานหลักที่ถูกจับคู่งานเองไม่ถูกยกเว้น — hasPairLink ของ main ไม่มีผล', () => {
  assert.equal(isAbsorbedBy(towing(), main({ hasPairLink: true })), true)
})
