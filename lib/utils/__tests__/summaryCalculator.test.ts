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
      isGasVehicle: false,
    },
    sickLeaveCount: 0,
    personalLeaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'inbound', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 100, driverWage: 10, fuelOfficeLiters: 1, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'outbound', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 200, driverWage: 20, fuelOfficeLiters: 0, fuelCashLiters: 2, fuelCreditLiters: 0 },
      { jobType: 'towing', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 50, driverWage: 5, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 3 },
      { jobType: 'noJob', noJobReason: 'repair', isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      // งานที่ยกเลิก ต้องไม่ถูกนับในทุกช่อง
      { jobType: 'inbound', noJobReason: null, isCancelled: true, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 9999, driverWage: 999, fuelOfficeLiters: 99, fuelCashLiters: 0, fuelCreditLiters: 0 },
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
      isGasVehicle: false,
    },
    sickLeaveCount: 0,
    personalLeaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'flatbed', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'mill', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
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
      isGasVehicle: false,
    },
    sickLeaveCount: 0,
    personalLeaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'noJob', noJobReason: 'repair', isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'noJob', noJobReason: 'overnight', isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'noJob', noJobReason: 'overnight', isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      // ยกเลิกแล้วต้องไม่นับ
      { jobType: 'noJob', noJobReason: 'overnight', isCancelled: true, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
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
      isGasVehicle: false,
    },
    sickLeaveCount: 0,
    personalLeaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'noJob', noJobReason: 'lowVolume', isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
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
      isGasVehicle: false,
    },
    sickLeaveCount: 0,
    personalLeaveCount: 0,
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
      isGasVehicle: false,
    },
    sickLeaveCount: 0,
    personalLeaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({ ...base, sickLeaveCount: 2, personalLeaveCount: 1, jobs: [] })
  assert.equal(result.sickLeaveDays, 2)
  assert.equal(result.personalLeaveDays, 1)
  assert.equal(result.driverName, 'ประวิทย์ กันภัย')
  assert.equal(result.groupName, 'กลุ่ม 1')
  assert.equal(result.fuelPricePerLiter, 36)
})

/** ตัวตั้งร่วมของ test ที่เพิ่มพฤติกรรมใหม่ (แบก / ทอยตู้หนัก / รถก๊าซ / ค่าใช้จ่าย prefill) */
function baseInput(isGasVehicle = false) {
  return {
    month: '2026-07',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
      isGasVehicle,
    },
    sickLeaveCount: 0,
    personalLeaveCount: 0,
    fuelPricePerLiter: 36,
  }
}

/** งานเปล่าที่ override เฉพาะช่องที่ test สนใจ */
function job(overrides: Record<string, unknown> = {}) {
  return {
    jobType: 'inbound',
    noJobReason: null,
    isCancelled: false,
    isCarry: false,
    income: 0,
    driverWage: 0,
    fuelOfficeLiters: 0,
    fuelCashLiters: 0,
    fuelCreditLiters: 0,
    toll: null,
    liftFee: null,
    storageFee: null,
    tire: null,
    other: null,
    ...overrides,
  } as Parameters<typeof calculateDriverSummary>[0]['jobs'][number]
}

test('calculateDriverSummary: ทอยตู้หนักนับรวมกับทอยตู้', () => {
  const result = calculateDriverSummary({
    ...baseInput(),
    jobs: [job({ jobType: 'towing' }), job({ jobType: 'towingHeavy' }), job({ jobType: 'inbound' })],
  })
  assert.equal(result.towingTrips, 2)
  assert.equal(result.jobTrips, 1)
})

test('calculateDriverSummary: แบกนับเพิ่มควบคู่ ไม่แทนที่หมวดเดิม', () => {
  const result = calculateDriverSummary({
    ...baseInput(),
    jobs: [job({ jobType: 'inbound', isCarry: true }), job({ jobType: 'towing', isCarry: true }), job({ jobType: 'inbound' })],
  })
  assert.equal(result.carryTripsPrefill, 2)
  // งานที่ติ๊กแบกยังถูกนับในหมวดเดิมด้วย
  assert.equal(result.jobTrips, 2)
  assert.equal(result.towingTrips, 1)
})

test('calculateDriverSummary: แบกไม่นับงานที่ยกเลิก', () => {
  const result = calculateDriverSummary({
    ...baseInput(),
    jobs: [job({ isCarry: true }), job({ isCarry: true, isCancelled: true })],
  })
  assert.equal(result.carryTripsPrefill, 1)
})

test('calculateDriverSummary: ค่าใช้จ่ายต่างๆ prefill = ทางด่วน+ยกตู้+ฝากตู้+ยาง+อื่นๆ', () => {
  const result = calculateDriverSummary({
    ...baseInput(),
    jobs: [
      job({ toll: 100, liftFee: 200, storageFee: 300, tire: 400, other: 500 }),
      job({ toll: 50 }),
      // ค่ารับตู้/คืนตู้ไม่อยู่ในสูตรนี้ และงานยกเลิกไม่นับ
      job({ toll: 9999, isCancelled: true }),
    ],
  })
  assert.equal(result.otherExpensesPrefill, 1550)
})

test('calculateDriverSummary: รถก๊าซเว้นว่างบล็อกน้ำมัน', () => {
  const result = calculateDriverSummary({
    ...baseInput(true),
    jobs: [job({ fuelOfficeLiters: 10, fuelCashLiters: 5, fuelCreditLiters: 2, income: 1000 })],
  })
  assert.equal(result.isGasVehicle, true)
  assert.equal(result.fuelPricePerLiter, null)
  assert.equal(result.fuelLiters, 0)
  // รายได้ยังคำนวณปกติ
  assert.equal(result.income, 1000)
})

test('calculateDriverSummary: รถน้ำมันยังคิดน้ำมันตามปกติ', () => {
  const result = calculateDriverSummary({
    ...baseInput(false),
    jobs: [job({ fuelOfficeLiters: 10, fuelCashLiters: 5, fuelCreditLiters: 2 })],
  })
  assert.equal(result.fuelPricePerLiter, 36)
  assert.equal(result.fuelLiters, 17)
})

test('calculateDriverSummary: มีงานไม่ไปงานนับแยกจากเหตุผลอื่น', () => {
  const result = calculateDriverSummary({
    ...baseInput(),
    jobs: [
      job({ jobType: 'noJob', noJobReason: 'noShow' }),
      job({ jobType: 'noJob', noJobReason: 'noShow' }),
      job({ jobType: 'noJob', noJobReason: 'repair' }),
      job({ jobType: 'noJob', noJobReason: 'noShow', isCancelled: true }),
    ],
  })
  assert.equal(result.noShowDays, 2)
  assert.equal(result.repairDays, 1)
})
