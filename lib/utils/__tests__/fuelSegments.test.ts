import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeFuelSegments,
  isLaemChabangName,
  totalFuelLiters,
  type FuelJob,
  type FuelStandardEntry,
} from '../fuelSegments'

const MONTH = '2026-09'

let seq = 0
function job(over: Partial<FuelJob> = {}): FuelJob {
  seq++
  return {
    id: `j${seq}`,
    jobNumber: `JOB-${seq}`,
    jobDate: '2026-09-10',
    jobType: 'inbound',
    isCancelled: false,
    isTowingAbsorbed: false,
    size: '40DC',
    pickupLocationId: 'P1',
    factoryLocationId: 'F1',
    touchesLaemChabang: false,
    fuelLiters: 0,
    pairRole: null,
    pairPartnerId: null,
    ...over,
  }
}

const STD: FuelStandardEntry[] = [
  { kind: 'run', size: '40DC', locationId: 'F1', isLaemChabang: false, liters: 40 },
  { kind: 'run', size: '40DC', locationId: 'F1', isLaemChabang: true, liters: 70 },
  { kind: 'run', size: '2x20DC', locationId: 'F1', isLaemChabang: false, liters: 50 },
  { kind: 'towing', size: '20DC', locationId: 'P1', isLaemChabang: false, liters: 15 },
]

function run(jobs: FuelJob[], opts: Partial<{ month: string; hasPreviousFill: boolean }> = {}) {
  return computeFuelSegments(jobs, STD, { month: MONTH, hasPreviousFill: true, ...opts })
}

test('ตัวอย่างหลัก: B ไม่เติม, H เติม 97 มาตรฐานรวม 80 → เกิน +17', () => {
  const r = run([
    job({ jobDate: '2026-09-02' }),
    job({ jobDate: '2026-09-03', fuelLiters: 97 }),
  ])
  assert.equal(r.segments.length, 1)
  const s = r.segments[0]
  assert.equal(s.status, 'ok')
  assert.equal(s.startDate, '2026-09-02')
  assert.equal(s.endDate, '2026-09-03')
  assert.equal(s.jobCount, 2)
  assert.equal(s.actualLiters, 97)
  assert.equal(s.standardLiters, 80)
  assert.equal(s.diffLiters, 17)
  assert.equal(r.excessLiters, 17)
  assert.equal(r.netDiffLiters, 17)
  assert.equal(r.pendingJobCount, 0)
})

test('totalFuelLiters: รวม OFF + สด + เครดิต, null นับเป็น 0', () => {
  assert.equal(totalFuelLiters({ fuelOfficeLiters: 50, fuelCashLiters: 20.5, fuelCreditLiters: null }), 70.5)
  assert.equal(totalFuelLiters({ fuelOfficeLiters: null, fuelCashLiters: null, fuelCreditLiters: null }), 0)
})

test('ช่วงที่มี job ไม่มีค่ามาตรฐาน → missing_standard, ไม่รวมยอด, group เส้นทางพร้อมเลข JOB', () => {
  const a = job({ factoryLocationId: 'F2' })
  const b = job({ factoryLocationId: 'F2' })
  const r = run([a, b, job({ fuelLiters: 120 })])
  const s = r.segments[0]
  assert.equal(s.status, 'missing_standard')
  assert.equal(s.standardLiters, null)
  assert.equal(s.diffLiters, null)
  assert.deepEqual(s.missingRoutes, [
    { kind: 'run', size: '40DC', locationId: 'F2', isLaemChabang: false, jobNumbers: [a.jobNumber, b.jobNumber] },
  ])
  assert.equal(r.excessLiters, 0)
  assert.equal(r.netDiffLiters, 0)
})

test('ไม่มีจุดเติมก่อนหน้า → ช่วงแรก no_previous_fill, ช่วงถัดไปคำนวณปกติ', () => {
  const r = run(
    [job({ fuelLiters: 100 }), job(), job({ fuelLiters: 90 })],
    { hasPreviousFill: false },
  )
  assert.equal(r.segments.length, 2)
  assert.equal(r.segments[0].status, 'no_previous_fill')
  assert.equal(r.segments[0].diffLiters, null)
  assert.equal(r.segments[1].status, 'ok')
  assert.equal(r.segments[1].diffLiters, 10)
  assert.equal(r.excessLiters, 10)
})

test('job หลังจุดเติมสุดท้าย → pendingJobCount และไม่สร้างช่วง', () => {
  const r = run([job({ fuelLiters: 40 }), job(), job()])
  assert.equal(r.segments.length, 1)
  assert.equal(r.pendingJobCount, 2)
})

test('งานจับคู่: primary ใช้ค่า 2x20DC, secondary = 0', () => {
  const r = run([
    job({ id: 'S', size: '20DC', pairRole: 'secondary', pairPartnerId: 'P' }),
    job({ id: 'P', size: '20DC', pairRole: 'primary', pairPartnerId: 'S', fuelLiters: 60 }),
  ])
  assert.equal(r.segments[0].standardLiters, 50)
  assert.equal(r.segments[0].diffLiters, 10)
})

test('งานจับคู่: secondary เป็นจุดเติมได้', () => {
  const r = run([
    job({ id: 'P', size: '20DC', pairRole: 'primary', pairPartnerId: 'S' }),
    job({ id: 'S', size: '20DC', pairRole: 'secondary', pairPartnerId: 'P', fuelLiters: 45 }),
  ])
  assert.equal(r.segments.length, 1)
  assert.equal(r.segments[0].diffLiters, -5)
})

test('งานจับคู่: secondary เรียงก่อน primary และเติมที่ secondary → ช่วงเดียว มาตรฐาน 2x20DC', () => {
  const r = run([
    job({ id: 'S', size: '20DC', pairRole: 'secondary', pairPartnerId: 'P', fuelLiters: 100 }),
    job({ id: 'P', size: '20DC', pairRole: 'primary', pairPartnerId: 'S' }),
  ])
  assert.equal(r.segments.length, 1)
  assert.equal(r.segments[0].jobCount, 2)
  assert.equal(r.segments[0].standardLiters, 50)
  assert.equal(r.segments[0].diffLiters, 50)
  assert.equal(r.pendingJobCount, 0)
})

test('งานจับคู่: secondary เรียงก่อน primary และเติมที่ primary → ช่วงปิดที่ primary, secondary (0) ตกช่วงถัดไป', () => {
  const r = run([
    job({ id: 'S', size: '20DC', pairRole: 'secondary', pairPartnerId: 'P' }),
    job({ id: 'P', size: '20DC', pairRole: 'primary', pairPartnerId: 'S', fuelLiters: 60 }),
    job({ id: 'X', fuelLiters: 40 }),
  ])
  assert.equal(r.segments.length, 2)
  assert.equal(r.segments[0].jobCount, 1)
  assert.equal(r.segments[0].standardLiters, 50)
  assert.equal(r.segments[1].jobCount, 2)
  assert.equal(r.segments[1].standardLiters, 40)
})

test('งานจับคู่ที่ไม่มีค่า 2x20DC → missingRoutes ใช้ size 2x20DC (ไว้ quick-add)', () => {
  const r = run([job({ size: '20DC', pairRole: 'primary', factoryLocationId: 'F2', fuelLiters: 60 })])
  assert.equal(r.segments[0].missingRoutes[0].size, '2x20DC')
})

test('job ยกเลิก / noJob / advance ถูกข้ามทั้งมาตรฐานและลิตร', () => {
  const r = run([
    job(),
    job({ isCancelled: true, fuelLiters: 500, factoryLocationId: 'F2' }),
    job({ jobType: 'noJob', size: null, pickupLocationId: null, factoryLocationId: null }),
    job({ jobType: 'advance', fuelLiters: 300 }),
    job({ fuelLiters: 85 }),
  ])
  assert.equal(r.segments.length, 1)
  assert.equal(r.segments[0].jobCount, 2)
  assert.equal(r.segments[0].diffLiters, 5)
})

test('งานวิ่ง match ด้วยโรงงาน — สถานที่รับตู้ต่างกันใช้ค่าเดียวกัน (โซนกรุงเทพ)', () => {
  const r = run([job({ pickupLocationId: 'P9' }), job({ pickupLocationId: 'P7', fuelLiters: 80 })])
  assert.equal(r.segments[0].status, 'ok')
  assert.equal(r.segments[0].standardLiters, 80)
})

test('งานวิ่งรับหรือคืนตู้ที่แหลมฉบัง → ใช้ค่าแหลมฉบัง', () => {
  const r = run([job({ touchesLaemChabang: true, fuelLiters: 70 })])
  assert.equal(r.segments[0].standardLiters, 70)
})

test('งานวิ่งแหลมฉบังที่ยังไม่มีค่าแหลม → missing (ไม่ใช้ค่ากรุงเทพแทน)', () => {
  const r = run([job({ factoryLocationId: 'F2', touchesLaemChabang: true, fuelLiters: 70 })])
  assert.equal(r.segments[0].status, 'missing_standard')
  assert.deepEqual(r.segments[0].missingRoutes[0], {
    kind: 'run', size: '40DC', locationId: 'F2', isLaemChabang: true, jobNumbers: [r.segments[0].closingJobNumber],
  })
})

test('งานทอย match ด้วยสถานที่รับตู้ ไม่สนโรงงาน; ทอยหนักนับเป็นทอย', () => {
  const r = run([
    job({ jobType: 'towing', size: '20DC', factoryLocationId: null }),
    job({ jobType: 'towingHeavy', size: '20DC', factoryLocationId: 'F9', touchesLaemChabang: true, fuelLiters: 40 }),
  ])
  assert.equal(r.segments[0].status, 'ok')
  assert.equal(r.segments[0].standardLiters, 30)
})

test('งานทอยที่สถานที่รับตู้ไม่มีค่า → missing kind towing', () => {
  const r = run([job({ jobType: 'towing', size: '20DC', pickupLocationId: 'P2', fuelLiters: 20 })])
  assert.equal(r.segments[0].status, 'missing_standard')
  assert.equal(r.segments[0].missingRoutes[0].kind, 'towing')
  assert.equal(r.segments[0].missingRoutes[0].locationId, 'P2')
  assert.equal(r.segments[0].missingRoutes[0].isLaemChabang, false)
})

test('ทอยที่ถูกดูดซับ → มาตรฐาน 0 แม้ไม่มีค่า แต่ยังเป็นจุดเติมได้', () => {
  const r = run([
    job({ fuelLiters: 50 }),
    job({ jobType: 'towing', size: '20DC', pickupLocationId: 'P2', isTowingAbsorbed: true, fuelLiters: 10 }),
  ])
  assert.equal(r.segments.length, 2)
  assert.equal(r.segments[1].status, 'ok')
  assert.equal(r.segments[1].standardLiters, 0)
  assert.equal(r.segments[1].diffLiters, 10)
})

test('job ที่กรอกไม่ครบ (ไม่มี size / งานวิ่งไม่มีโรงงาน / ทอยไม่มีที่รับตู้) → missing_standard', () => {
  for (const over of [
    { size: null },
    { factoryLocationId: null },
    { jobType: 'towing', size: '20DC', pickupLocationId: null },
  ] as Partial<FuelJob>[]) {
    const r = run([job({ ...over, fuelLiters: 30 })])
    assert.equal(r.segments[0].status, 'missing_standard')
  }
})

test('isLaemChabangName: ชื่อมีคำว่า "แหลม"', () => {
  assert.equal(isLaemChabangName('C1 /แหลมฉบัง'), true)
  assert.equal(isLaemChabangName('แหลมฉบัง'), true)
  assert.equal(isLaemChabangName('TICT'), false)
  assert.equal(isLaemChabangName(null), false)
})

test('เกินรวม vs สุทธิ: +17 และ −10 → เกินรวม 17, สุทธิ 7', () => {
  const r = run([
    job(), job({ fuelLiters: 97 }),       // มาตรฐาน 80 → +17
    job(), job({ fuelLiters: 70 }),       // มาตรฐาน 80 → −10
  ])
  assert.equal(r.excessLiters, 17)
  assert.equal(r.netDiffLiters, 7)
})

test('คร่อมเดือน: ช่วงที่ปิดเดือนก่อนไม่ถูกคืน, ช่วงที่เริ่มเดือนก่อนแต่ปิดเดือนนี้ถูกคืน', () => {
  const r = run([
    job({ jobDate: '2026-08-30', fuelLiters: 40 }),   // ปิดช่วงใน ส.ค.
    job({ jobDate: '2026-08-31' }),
    job({ jobDate: '2026-09-02', fuelLiters: 90 }),   // ปิดช่วงใน ก.ย.
    job({ jobDate: '2026-10-01' }),                    // เดือนถัดไป ไม่นับ pending
  ])
  assert.equal(r.segments.length, 1)
  assert.equal(r.segments[0].startDate, '2026-08-31')
  assert.equal(r.segments[0].diffLiters, 10)
  assert.equal(r.pendingJobCount, 0)
})

test('ปัดทศนิยม 2 ตำแหน่ง', () => {
  const r = computeFuelSegments(
    [job({ fuelLiters: 0 }), job({ fuelLiters: 97.3 })],
    [{ kind: 'run', size: '40DC', locationId: 'F1', isLaemChabang: false, liters: 40.15 }],
    { month: MONTH, hasPreviousFill: true },
  )
  assert.equal(r.segments[0].standardLiters, 80.3)
  assert.equal(r.segments[0].diffLiters, 17)
})
