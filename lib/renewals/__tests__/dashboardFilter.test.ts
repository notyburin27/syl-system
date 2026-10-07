import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DashboardItemDto } from '../../../types/renewals'
import { filterDashboardItems, summarizeDashboard } from '../dashboardFilter'

function item(overrides: Partial<DashboardItemDto> & { id: string }): DashboardItemDto {
  return {
    vehicleId: 'v1',
    type: 'PRB',
    insurerId: null,
    insurerName: null,
    agentName: null,
    coverageClass: null,
    policyNumber: null,
    startDate: null,
    endDate: '2026-10-31',
    amount: null,
    serviceFee: null,
    pairedVehicleId: null,
    pairedPlate: null,
    renewalStatus: 'PENDING',
    notRenewedReason: null,
    renewalNote: null,
    renewedToId: null,
    attachmentCount: 0,
    vehicle: { id: 'v1', plate: '64-5598 กท', fleetNumber: '62', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', status: 'ACTIVE' },
    bucket: 'THIS_MONTH',
    ...overrides,
  }
}

const items = [
  item({ id: 'a', type: 'PRB', bucket: 'OVERDUE', amount: 0.1 }),
  item({ id: 'b', type: 'TAX', bucket: 'NEXT_MONTH', amount: 0.2, serviceFee: 1300, renewalStatus: 'IN_PROGRESS' }),
  item({
    id: 'c',
    type: 'TAX',
    bucket: 'THIS_MONTH',
    vehicle: { id: 'v2', plate: '76-1119 กท', fleetNumber: '18', ownerName: 'ทรงยุทธ โลจิสติคส์', vehicleType: 'ลากจูง', status: 'ACTIVE' },
  }),
]

test('กรองตามประเภท บริษัท สถานะ', () => {
  assert.deepEqual(filterDashboardItems(items, { type: 'TAX' }).map((i) => i.id), ['b', 'c'])
  assert.deepEqual(filterDashboardItems(items, { type: 'ALL', owner: 'ทรงยุทธ โลจิสติคส์' }).map((i) => i.id), ['c'])
  assert.deepEqual(filterDashboardItems(items, { type: 'ALL', status: 'IN_PROGRESS' }).map((i) => i.id), ['b'])
  assert.deepEqual(filterDashboardItems(items, { type: 'TAX' }, { ignoreType: true }).map((i) => i.id), ['a', 'b', 'c'])
})

test('ค้นหาทะเบียนแบบมีจุดท้าย/ช่องว่างซ้อน และค้นด้วยเบอร์รถ', () => {
  assert.deepEqual(filterDashboardItems(items, { type: 'ALL', q: '76-1119  กท.' }).map((i) => i.id), ['c'])
  assert.deepEqual(filterDashboardItems(items, { type: 'ALL', q: '18' }).map((i) => i.id), ['c'])
})

test('สรุปจำนวนตามช่วง/ประเภท และยอดเงินปัดทศนิยม 2 ตำแหน่ง', () => {
  const s = summarizeDashboard(items)
  assert.deepEqual(s.buckets, { OVERDUE: 1, THIS_MONTH: 1, NEXT_MONTH: 1, LATER: 0 })
  assert.equal(s.inProgress, 1)
  assert.deepEqual(s.byType, { ALL: 3, PRB: 1, TAX: 2, MOTOR_INSURANCE: 0, CARGO_INSURANCE: 0 })
  assert.deepEqual(s.totals, { amount: 0.3, serviceFee: 1300 })
})
