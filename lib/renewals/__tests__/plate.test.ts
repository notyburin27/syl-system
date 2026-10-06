import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlate } from '../plate'

test('normalizePlate: ตัดจุดท้าย ยุบช่องว่าง trim', () => {
  assert.equal(normalizePlate('64-5598 กท.'), '64-5598 กท')
  assert.equal(normalizePlate('  64-0329  กท '), '64-0329 กท')
  assert.equal(normalizePlate('63-9883 กท. '), '63-9883 กท')
  assert.equal(normalizePlate('76-4349'), '76-4349')
  assert.equal(normalizePlate('ฆณ 8228 กท'), 'ฆณ 8228 กท')
  assert.equal(normalizePlate('   '), '')
  assert.equal(normalizePlate(' . '), '')
})
