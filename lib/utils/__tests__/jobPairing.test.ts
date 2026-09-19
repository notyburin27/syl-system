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
