import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeFuelSegments, totalFuelLiters, type FuelJob, type FuelStandardEntry } from '../fuelSegments'

const MONTH = '2026-09'
const R1 = { pickupLocationId: 'P1', factoryLocationId: 'F1', returnLocationId: 'R1' }
const R2 = { pickupLocationId: 'P2', factoryLocationId: 'F2', returnLocationId: 'R2' }
const TOW = { pickupLocationId: 'P1', factoryLocationId: null, returnLocationId: 'SYL' }

let seq = 0
function job(over: Partial<FuelJob> = {}): FuelJob {
  seq++
  return {
    id: `j${seq}`,
    jobNumber: `JOB-${seq}`,
    jobDate: '2026-09-10',
    jobType: 'inbound',
    isCancelled: false,
    size: '40DC',
    ...R1,
    fuelLiters: 0,
    pairRole: null,
    pairPartnerId: null,
    ...over,
  }
}

const STD: FuelStandardEntry[] = [
  { size: '40DC', ...R1, liters: 40 },
  { size: '2x20DC', ...R1, liters: 50 },
  { size: '20DC', ...TOW, liters: 15 },
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
  const a = job({ ...R2 })
  const b = job({ ...R2 })
  const r = run([a, b, job({ fuelLiters: 120 })])
  const s = r.segments[0]
  assert.equal(s.status, 'missing_standard')
  assert.equal(s.standardLiters, null)
  assert.equal(s.diffLiters, null)
  assert.deepEqual(s.missingRoutes, [
    { size: '40DC', ...R2, jobNumbers: [a.jobNumber, b.jobNumber] },
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
  const r = run([job({ size: '20DC', pairRole: 'primary', ...R2, fuelLiters: 60 })])
  assert.equal(r.segments[0].missingRoutes[0].size, '2x20DC')
})

test('job ยกเลิก / noJob / advance ถูกข้ามทั้งมาตรฐานและลิตร', () => {
  const r = run([
    job(),
    job({ isCancelled: true, fuelLiters: 500, ...R2 }),
    job({ jobType: 'noJob', size: null, pickupLocationId: null, factoryLocationId: null, returnLocationId: null }),
    job({ jobType: 'advance', fuelLiters: 300 }),
    job({ fuelLiters: 85 }),
  ])
  assert.equal(r.segments.length, 1)
  assert.equal(r.segments[0].jobCount, 2)
  assert.equal(r.segments[0].diffLiters, 5)
})

test('โรงงานว่าง match เฉพาะมาตรฐานที่โรงงานว่าง', () => {
  const ok = run([job({ jobType: 'towing', size: '20DC', ...TOW, fuelLiters: 20 })])
  assert.equal(ok.segments[0].standardLiters, 15)

  const miss = run([job({ jobType: 'towing', size: '20DC', ...TOW, factoryLocationId: 'F1', fuelLiters: 20 })])
  assert.equal(miss.segments[0].status, 'missing_standard')
})

test('job ที่กรอก size/สถานที่ไม่ครบ → missing_standard', () => {
  const r = run([job({ size: null, fuelLiters: 30 })])
  assert.equal(r.segments[0].status, 'missing_standard')
  assert.equal(r.segments[0].missingRoutes[0].size, null)
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
    [{ size: '40DC', ...R1, liters: 40.15 }],
    { month: MONTH, hasPreviousFill: true },
  )
  assert.equal(r.segments[0].standardLiters, 80.3)
  assert.equal(r.segments[0].diffLiters, 17)
})
