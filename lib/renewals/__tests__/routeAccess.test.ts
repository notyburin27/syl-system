import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renewalRouteDecision } from '../routeAccess'

const allow = { kind: 'allow' }
const forbidden = { kind: 'forbidden' }
const redirect = (to: string) => ({ kind: 'redirect', to })

test('INSURANCE: หน้าและ API ของ renewals ผ่าน', () => {
  for (const p of ['/renewals', '/renewals/vehicles/abc', '/api/renewals/dashboard', '/api/auth/session']) {
    assert.deepEqual(renewalRouteDecision('INSURANCE', p), allow, p)
  }
})

test('INSURANCE: หน้าอื่น (รวม /) ถูกพาไป /renewals', () => {
  for (const p of ['/', '/jobs', '/line-images', '/admin/users', '/renewalsx']) {
    assert.deepEqual(renewalRouteDecision('INSURANCE', p), redirect('/renewals'), p)
  }
})

test('INSURANCE: API อื่น 403', () => {
  for (const p of ['/api/jobs', '/api/drivers', '/api/users']) {
    assert.deepEqual(renewalRouteDecision('INSURANCE', p), forbidden, p)
  }
})

test('STAFF / SENIOR_STAFF เข้า renewals ไม่ได้ แต่ path อื่นไม่ยุ่ง', () => {
  assert.deepEqual(renewalRouteDecision('STAFF', '/renewals'), redirect('/line-images'))
  assert.deepEqual(renewalRouteDecision('SENIOR_STAFF', '/renewals/import'), redirect('/jobs'))
  assert.deepEqual(renewalRouteDecision('STAFF', '/api/renewals/dashboard'), forbidden)
  assert.deepEqual(renewalRouteDecision('STAFF', '/renewalsx'), allow)
  assert.deepEqual(renewalRouteDecision('STAFF', '/jobs'), allow)
})

test('ADMIN / MANAGER ผ่านทุก path', () => {
  for (const role of ['ADMIN', 'MANAGER']) {
    for (const p of ['/renewals', '/api/renewals/x', '/jobs', '/api/jobs']) {
      assert.deepEqual(renewalRouteDecision(role, p), allow, `${role} ${p}`)
    }
  }
})

test('ไม่รู้ role (ถอด token ไม่ได้) → ปล่อยผ่าน ให้ page/route เช็กเอง', () => {
  assert.deepEqual(renewalRouteDecision(undefined, '/renewals'), allow)
  assert.deepEqual(renewalRouteDecision(undefined, '/api/renewals/x'), allow)
})

test('role แปลก / ขอบเขต path', () => {
  assert.deepEqual(renewalRouteDecision('USER', '/renewals'), redirect('/jobs'))
  assert.deepEqual(renewalRouteDecision('SENIOR_STAFF', '/api/renewals/x'), forbidden)
  assert.deepEqual(renewalRouteDecision('INSURANCE', '/api/renewalsx'), forbidden)
})
