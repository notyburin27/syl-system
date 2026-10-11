import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { parseJsonBody, RenewalError } from '../http'

test('parseJsonBody: JSON เสีย → RenewalError 400 ข้อความไทย', async () => {
  const req = new Request('http://x', { method: 'POST', body: '{bad' })
  await assert.rejects(parseJsonBody(req, z.object({})), (e: unknown) => {
    assert.ok(e instanceof RenewalError)
    assert.equal(e.status, 400)
    assert.equal(e.message, 'รูปแบบข้อมูลไม่ถูกต้อง')
    return true
  })
})

test('parseJsonBody: ไม่ผ่าน schema → 400 ข้อความไทยจาก schema', async () => {
  const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ a: 1 }) })
  await assert.rejects(parseJsonBody(req, z.object({ a: z.string() })), (e: unknown) => {
    assert.ok(e instanceof RenewalError)
    assert.equal(e.message, 'ข้อมูลไม่ถูกต้อง: a')
    return true
  })
})
