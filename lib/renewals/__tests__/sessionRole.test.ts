import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encode } from 'next-auth/jwt'
import { readSessionRole } from '../sessionRole'

const secret = 'test-secret-for-session-role'
const PLAIN = 'authjs.session-token'
const SECURE = '__Secure-authjs.session-token'

const mint = (role: string, name: string) => encode({ token: { role }, secret, salt: name })

async function run(cookies: Record<string, string>) {
  const header = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  const req = new Request('http://localhost/jobs', { headers: header ? { cookie: header } : {} })
  const warns: unknown[][] = []
  const orig = console.warn
  console.warn = (...a: unknown[]) => { warns.push(a) }
  try {
    const role = await readSessionRole(req, Object.keys(cookies), secret)
    return { role, warns }
  } finally {
    console.warn = orig
  }
}

test('INSURANCE ใน authjs.session-token + cookie __Secure- ปลอม → INSURANCE (กันบายพาส)', async () => {
  const { role } = await run({ [PLAIN]: await mint('INSURANCE', PLAIN), [SECURE]: 'x' })
  assert.equal(role, 'INSURANCE')
})

test('token ใน __Secure- อย่างเดียว → role นั้น', async () => {
  const { role, warns } = await run({ [SECURE]: await mint('MANAGER', SECURE) })
  assert.equal(role, 'MANAGER')
  assert.equal(warns.length, 0)
})

test('cookie ปลอมอย่างเดียว → undefined และ warn', async () => {
  const { role, warns } = await run({ [PLAIN]: 'junk' })
  assert.equal(role, undefined)
  assert.equal(warns.length, 1)
})

test('ไม่มี session cookie → undefined ไม่ warn', async () => {
  const { role, warns } = await run({ other: 'a' })
  assert.equal(role, undefined)
  assert.equal(warns.length, 0)
})

test('ADMIN ใน cookie หนึ่ง + INSURANCE อีกอัน → INSURANCE', async () => {
  const { role } = await run({ [PLAIN]: await mint('ADMIN', PLAIN), [SECURE]: await mint('INSURANCE', SECURE) })
  assert.equal(role, 'INSURANCE')
})
