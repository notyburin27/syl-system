import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPairedSize, isPairableSize, isPairableJobType } from '../../../types/job'

test('getPairedSize: 20DC และ 20RF แปลงเป็นอัตราคู่ได้', () => {
  assert.equal(getPairedSize('20DC'), '2x20DC')
  assert.equal(getPairedSize('20RF'), '2x20RF')
})

test('getPairedSize: size อื่นจับคู่ไม่ได้', () => {
  assert.equal(getPairedSize('40DC'), null)
  assert.equal(getPairedSize('45HC'), null)
  assert.equal(getPairedSize('truck'), null)
  assert.equal(getPairedSize(null), null)
})

test('getPairedSize: size ที่เป็นคู่อยู่แล้วจับคู่ซ้ำไม่ได้', () => {
  assert.equal(getPairedSize('2x20DC'), null)
  assert.equal(getPairedSize('2x20RF'), null)
})

test('isPairableSize: สะท้อนผลของ getPairedSize', () => {
  assert.equal(isPairableSize('20DC'), true)
  assert.equal(isPairableSize('40DC'), false)
  assert.equal(isPairableSize(null), false)
})

test('isPairableJobType: ขาเข้า ขาออก ทอยตู้ ทอยตู้หนัก จับคู่ได้', () => {
  assert.equal(isPairableJobType('inbound'), true)
  assert.equal(isPairableJobType('outbound'), true)
  assert.equal(isPairableJobType('towing'), true)
  assert.equal(isPairableJobType('towingHeavy'), true)
})

test('isPairableJobType: พื้นเรียบ โรงสี เบิกล่วงหน้า ไม่มีงาน จับคู่ไม่ได้', () => {
  assert.equal(isPairableJobType('flatbed'), false)
  assert.equal(isPairableJobType('mill'), false)
  assert.equal(isPairableJobType('advance'), false)
  assert.equal(isPairableJobType('noJob'), false)
})

import { checkPairable, type PairableJob } from '../jobPairing'

const baseJob = (over: Partial<PairableJob> = {}): PairableJob => ({
  id: 'j1',
  jobDate: new Date('2026-09-01'),
  jobType: 'inbound',
  size: '20DC',
  driverId: 'd1',
  factoryLocationId: 'f1',
  isCancelled: false,
  clearStatus: false,
  hasPairLink: false,
  ...over,
})

test('checkPairable: งานที่เข้าเงื่อนไขครบจับคู่ได้', () => {
  assert.equal(checkPairable(baseJob(), baseJob({ id: 'j2' })), null)
})

test('checkPairable: ทอยตู้ไม่เช็คโรงงาน', () => {
  const a = baseJob({ jobType: 'towing', factoryLocationId: null })
  const b = baseJob({ id: 'j2', jobType: 'towing', factoryLocationId: null })
  assert.equal(checkPairable(a, b), null)
})

test('checkPairable: คนละวันจับคู่ไม่ได้', () => {
  const b = baseJob({ id: 'j2', jobDate: new Date('2026-09-02') })
  assert.equal(checkPairable(baseJob(), b), 'วันที่งานไม่ตรงกัน')
})

test('checkPairable: คนละคนขับจับคู่ไม่ได้', () => {
  const b = baseJob({ id: 'j2', driverId: 'd2' })
  assert.equal(checkPairable(baseJob(), b), 'คนขับไม่ตรงกัน')
})

test('checkPairable: ไม่มีคนขับจับคู่ไม่ได้', () => {
  const a = baseJob({ driverId: null })
  assert.equal(checkPairable(a, baseJob({ id: 'j2' })), 'คนขับไม่ตรงกัน')
})

test('checkPairable: คนละลักษณะงานจับคู่ไม่ได้ (รวมทอยตู้กับทอยตู้หนัก)', () => {
  const b = baseJob({ id: 'j2', jobType: 'outbound' })
  assert.equal(checkPairable(baseJob(), b), 'ลักษณะงานไม่ตรงกัน')

  const towing = baseJob({ jobType: 'towing', factoryLocationId: null })
  const heavy = baseJob({ id: 'j2', jobType: 'towingHeavy', factoryLocationId: null })
  assert.equal(checkPairable(towing, heavy), 'ลักษณะงานไม่ตรงกัน')
})

test('checkPairable: ลักษณะงานที่จับคู่ไม่ได้', () => {
  const a = baseJob({ jobType: 'flatbed' })
  const b = baseJob({ id: 'j2', jobType: 'flatbed' })
  assert.equal(checkPairable(a, b), 'ลักษณะงานนี้จับคู่ไม่ได้')
})

test('checkPairable: size ต้องตรงกันและจับคู่ได้', () => {
  const b = baseJob({ id: 'j2', size: '20RF' })
  assert.equal(checkPairable(baseJob(), b), 'SIZE ไม่ตรงกัน')

  const a40 = baseJob({ size: '40DC' })
  const b40 = baseJob({ id: 'j2', size: '40DC' })
  assert.equal(checkPairable(a40, b40), 'SIZE นี้จับคู่ไม่ได้')
})

test('checkPairable: คนละโรงงานจับคู่ไม่ได้ (ขาเข้า/ขาออก)', () => {
  const b = baseJob({ id: 'j2', factoryLocationId: 'f2' })
  assert.equal(checkPairable(baseJob(), b), 'โรงงานไม่ตรงกัน')
})

test('checkPairable: งานยกเลิกจับคู่ไม่ได้', () => {
  const b = baseJob({ id: 'j2', isCancelled: true })
  assert.equal(checkPairable(baseJob(), b), 'งานที่ยกเลิกแล้วจับคู่ไม่ได้')
})

test('checkPairable: งานที่เคลียร์แล้วจับคู่ไม่ได้', () => {
  const b = baseJob({ id: 'j2', clearStatus: true })
  assert.equal(checkPairable(baseJob(), b), 'งานที่เคลียร์แล้วจับคู่ไม่ได้')
})

test('checkPairable: งานที่จับคู่ไปแล้วจับคู่ซ้ำไม่ได้', () => {
  const b = baseJob({ id: 'j2', hasPairLink: true })
  assert.equal(checkPairable(baseJob(), b), 'งานนี้ถูกจับคู่ไปแล้ว')
})

test('checkPairable: จับคู่กับตัวเองไม่ได้', () => {
  assert.equal(checkPairable(baseJob(), baseJob()), 'จับคู่กับงานเดียวกันไม่ได้')
})
