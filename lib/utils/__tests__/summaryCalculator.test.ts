import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateDriverSummary } from '../summaryCalculator'
import { toThaiMonthYear, toPayDate, toThaiShortDate } from '../thaiDate'

test('toThaiMonthYear: แปลงเดือนเป็นชื่อไทย + ปี พ.ศ. 2 หลัก', () => {
  assert.equal(toThaiMonthYear('2026-07'), 'กรกฎาคม 69')
  assert.equal(toThaiMonthYear('2026-01'), 'มกราคม 69')
})

test('toPayDate: วันจ่ายคือวันที่ 15 ของเดือนถัดไป', () => {
  assert.equal(toPayDate('2026-07'), '15/8/69')
  assert.equal(toPayDate('2026-06'), '15/7/69')
})

test('toPayDate: วันจ่ายของเดือน ธ.ค. ข้ามไปปีถัดไป', () => {
  assert.equal(toPayDate('2026-12'), '15/1/70')
})

test('toThaiShortDate: แปลงวันที่สั้นเป็น พ.ศ.', () => {
  assert.equal(toThaiShortDate('2025-08-25'), '25/8/68')
  assert.equal(toThaiShortDate(null), '')
})

test('calculateDriverSummary: นับงานแยกตามประเภท และไม่นับงานที่ยกเลิก', () => {
  const base = {
    month: '2026-07',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
    },
    leaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'inbound', noJobReason: null, isCancelled: false, income: 100, driverWage: 10, fuelOfficeLiters: 1, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'outbound', noJobReason: null, isCancelled: false, income: 200, driverWage: 20, fuelOfficeLiters: 0, fuelCashLiters: 2, fuelCreditLiters: 0 },
      { jobType: 'towing', noJobReason: null, isCancelled: false, income: 50, driverWage: 5, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 3 },
      { jobType: 'noJob', noJobReason: 'repair', isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      // งานที่ยกเลิก ต้องไม่ถูกนับในทุกช่อง
      { jobType: 'inbound', noJobReason: null, isCancelled: true, income: 9999, driverWage: 999, fuelOfficeLiters: 99, fuelCashLiters: 0, fuelCreditLiters: 0 },
    ],
  })

  assert.equal(result.jobTrips, 2)      // inbound + outbound
  assert.equal(result.towingTrips, 1)
  assert.equal(result.repairDays, 1)
  assert.equal(result.income, 350)
  assert.equal(result.driverWage, 35)
  assert.equal(result.fuelLiters, 6)    // 1 + 2 + 3
})

test('calculateDriverSummary: นับ flatbed และ mill รวมเป็น "งาน"', () => {
  const base = {
    month: '2026-07',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
    },
    leaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'flatbed', noJobReason: null, isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'mill', noJobReason: null, isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
    ],
  })
  assert.equal(result.jobTrips, 2)
})

test('calculateDriverSummary: ค้างคืนนับแยกจากซ่อมรถ ไม่ปนกัน', () => {
  const base = {
    month: '2026-07',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
    },
    leaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'noJob', noJobReason: 'repair', isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'noJob', noJobReason: 'overnight', isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'noJob', noJobReason: 'overnight', isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      // ยกเลิกแล้วต้องไม่นับ
      { jobType: 'noJob', noJobReason: 'overnight', isCancelled: true, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
    ],
  })
  assert.equal(result.repairDays, 1)
  assert.equal(result.overnightDays, 2)
  assert.equal(result.jobTrips, 0)
})

test('calculateDriverSummary: noJob ที่ไม่ใช่ซ่อมรถ ไม่นับเป็นซ่อมรถ', () => {
  const base = {
    month: '2026-07',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
    },
    leaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'noJob', noJobReason: 'lowVolume', isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
    ],
  })
  assert.equal(result.repairDays, 0)
  assert.equal(result.jobTrips, 0)
})

test('calculateDriverSummary: คนขับไม่มีงานเลย ได้ผลเป็น 0 ทุกช่อง ไม่ throw', () => {
  const base = {
    month: '2026-07',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
    },
    leaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({ ...base, jobs: [] })
  assert.equal(result.jobTrips, 0)
  assert.equal(result.income, 0)
  assert.equal(result.fuelLiters, 0)
  assert.equal(result.baseSalary, 9000)
})

test('calculateDriverSummary: ส่งต่อข้อมูลคนขับและวันลา', () => {
  const base = {
    month: '2026-07',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
    },
    leaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({ ...base, leaveCount: 3, jobs: [] })
  assert.equal(result.leaveDays, 3)
  assert.equal(result.driverName, 'ประวิทย์ กันภัย')
  assert.equal(result.groupName, 'กลุ่ม 1')
  assert.equal(result.fuelPricePerLiter, 36)
})
