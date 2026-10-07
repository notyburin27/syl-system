import { test } from 'node:test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import { parseBuddhistInput, toBuddhistFormat } from '../buddhistDate'

const ymd = (text: string) => parseBuddhistInput(text, 'DD/MM/YYYY')?.format('YYYY-MM-DD') ?? null

test('toBuddhistFormat: แสดงปีเป็น พ.ศ.', () => {
  assert.equal(toBuddhistFormat('DD/MM/YYYY'), 'DD/MM/BBBB')
  assert.equal(dayjs('2026-05-01').format(toBuddhistFormat('DD/MM/YYYY')), '01/05/2569')
})

test('parseBuddhistInput: ปี พ.ศ. → ค.ศ., พิมพ์ ค.ศ. ก็ยังได้, 29 ก.พ. ปีอธิกสุรทิน', () => {
  assert.equal(ymd('01/05/2569'), '2026-05-01')
  assert.equal(ymd('01/05/2026'), '2026-05-01')
  assert.equal(ymd('29/02/2567'), '2024-02-29')
  assert.equal(ymd('29/02/2568'), null)
  assert.equal(ymd('31/04/2569'), null)
  assert.equal(ymd('1/5/2569'), null) // พิมพ์ยังไม่ครบ
  assert.equal(ymd('ab/cd/efgh'), null)
})
