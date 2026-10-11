import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bahtText } from '../bahtText'

test('bahtText: ศูนย์และจำนวนเต็ม', () => {
  assert.equal(bahtText(0), 'ศูนย์บาทถ้วน')
  assert.equal(bahtText(1), 'หนึ่งบาทถ้วน')
  assert.equal(bahtText(20), 'ยี่สิบบาทถ้วน')
  assert.equal(bahtText(940), 'เก้าร้อยสี่สิบบาทถ้วน')
})

test('bahtText: เอ็ด สิบ ยี่สิบ', () => {
  assert.equal(bahtText(11), 'สิบเอ็ดบาทถ้วน')
  assert.equal(bahtText(10), 'สิบบาทถ้วน')
  assert.equal(bahtText(21), 'ยี่สิบเอ็ดบาทถ้วน')
  assert.equal(bahtText(101), 'หนึ่งร้อยเอ็ดบาทถ้วน')
  assert.equal(bahtText(1130), 'หนึ่งพันหนึ่งร้อยสามสิบบาทถ้วน')
})

test('bahtText: สตางค์', () => {
  assert.equal(bahtText(0.5), 'ห้าสิบสตางค์')
  assert.equal(bahtText(115.25), 'หนึ่งร้อยสิบห้าบาทยี่สิบห้าสตางค์')
  assert.equal(bahtText(0.1 + 0.2), 'สามสิบสตางค์')
})

test('bahtText: หลักล้าน', () => {
  assert.equal(bahtText(1_000_000), 'หนึ่งล้านบาทถ้วน')
  assert.equal(bahtText(2_501_011), 'สองล้านห้าแสนหนึ่งพันสิบเอ็ดบาทถ้วน')
  assert.equal(bahtText(11_000_000), 'สิบเอ็ดล้านบาทถ้วน')
})
