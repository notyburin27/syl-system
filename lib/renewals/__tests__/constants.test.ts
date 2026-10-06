import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  NOT_RENEWED_REASONS,
  NOT_RENEWED_REASON_LABELS,
  RENEWAL_STATUSES,
  RENEWAL_STATUS_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  isOpenStatus,
  isRenewalRole,
} from '../constants'

test('isRenewalRole: ADMIN / MANAGER / INSURANCE เท่านั้น', () => {
  for (const role of ['ADMIN', 'MANAGER', 'INSURANCE']) assert.equal(isRenewalRole(role), true)
  for (const role of ['STAFF', 'SENIOR_STAFF', 'admin', '', undefined, null]) assert.equal(isRenewalRole(role), false)
})

test('isOpenStatus: รอต่อ / กำลังดำเนินการ เท่านั้น', () => {
  assert.equal(isOpenStatus('PENDING'), true)
  assert.equal(isOpenStatus('IN_PROGRESS'), true)
  assert.equal(isOpenStatus('RENEWED'), false)
  assert.equal(isOpenStatus('NOT_RENEWED'), false)
})

test('label ครบทุก key และไม่ซ้ำกัน (import หา key กลับจาก label)', () => {
  const check = (keys: readonly string[], labels: Record<string, string>) => {
    assert.deepEqual(Object.keys(labels).sort(), [...keys].sort())
    assert.equal(new Set(Object.values(labels)).size, keys.length)
  }
  check(COVERAGE_TYPES, COVERAGE_TYPE_LABELS)
  check(RENEWAL_STATUSES, RENEWAL_STATUS_LABELS)
  check(NOT_RENEWED_REASONS, NOT_RENEWED_REASON_LABELS)
  check(VEHICLE_STATUSES, VEHICLE_STATUS_LABELS)
})
