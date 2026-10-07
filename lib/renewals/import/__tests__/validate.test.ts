import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CoverageColumnKey, RawRow, VehicleColumnKey } from '../columns'
import { validateRenewalImport, type ExistingSnapshot } from '../validate'

const v = (row: number, values: Partial<Record<VehicleColumnKey, unknown>>): RawRow<VehicleColumnKey> => ({ row, values })
const c = (row: number, values: Partial<Record<CoverageColumnKey, unknown>>): RawRow<CoverageColumnKey> => ({ row, values })

const BASE: ExistingSnapshot = {
  vehicles: [{ id: 'veh-1', plate: '61-8550 กท', status: 'ACTIVE' }],
  insurers: [
    { id: 'ins-1', name: 'วิริยะประกันภัย', isActive: true },
    { id: 'ins-2', name: 'ปิดแล้วประกันภัย', isActive: false },
  ],
  coverages: [],
}

const messages = (r: ReturnType<typeof validateRenewalImport>) =>
  r.errors.map((e) => `${e.sheet}:${e.row}:${e.field}:${e.message}`)

test('รถใหม่ + งวดใหม่ (ทะเบียนต่างรูปแบบระหว่างชีต, เงินมีคอมมา) → ผ่าน และนับถูก', () => {
  const r = validateRenewalImport(
    {
      vehicles: [v(2, { plate: '64-5598 กท.', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', weightKg: '7,900' })],
      coverages: [
        c(2, {
          plate: '64-5598  กท',
          type: 'ประกันรถยนต์',
          insurer: 'วิริยะประกันภัย',
          coverageClass: 'ป.3',
          endDate: '09/01/2570',
          amount: '19,900',
          pairedPlate: '61-8550 กท',
        }),
      ],
    },
    BASE,
  )
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.plan.vehicles[0], {
    plate: '64-5598 กท',
    existingId: null,
    data: { ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', weightKg: 7900 },
  })
  assert.deepEqual(r.plan.coverages[0], {
    plate: '64-5598 กท',
    type: 'MOTOR_INSURANCE',
    endDate: '2027-01-09',
    existingId: null,
    existingStatus: null,
    data: { insurerId: 'ins-1', coverageClass: 'ป.3', pairedPlate: '61-8550 กท', amount: 19900 },
  })
  assert.deepEqual(r.summary, {
    vehiclesCreated: 1,
    vehiclesUpdated: 0,
    coveragesCreated: 1,
    coveragesUpdated: 0,
    coveragesAutoClosed: 0,
  })
})

test('รถใหม่ต้องมีบริษัท/ลักษณะ; รถเดิมเว้นว่างได้ (คงค่าเดิม)', () => {
  const r = validateRenewalImport({ vehicles: [v(2, { plate: '70-0001 กท' }), v(3, { plate: '61-8550 กท', brand: 'ISUZU' })], coverages: [] }, BASE)
  assert.deepEqual(messages(r), ['รถ:2:บริษัท:รถใหม่ต้องกรอกบริษัท', 'รถ:2:ลักษณะ:รถใหม่ต้องกรอกลักษณะ'])
  assert.deepEqual(r.plan.vehicles[1], { plate: '61-8550 กท', existingId: 'veh-1', data: { brand: 'ISUZU' } })
})

test('ทะเบียนซ้ำในไฟล์ (ต่างแค่จุดท้าย) → error ทุกแถวที่ซ้ำ', () => {
  const r = validateRenewalImport({ vehicles: [v(2, { plate: '61-8550 กท' }), v(5, { plate: '61-8550 กท.' })], coverages: [] }, BASE)
  assert.deepEqual(messages(r), [
    'รถ:2:ทะเบียน:ทะเบียน 61-8550 กท ซ้ำในไฟล์ (แถว 2, 5)',
    'รถ:5:ทะเบียน:ทะเบียน 61-8550 กท ซ้ำในไฟล์ (แถว 2, 5)',
  ])
})

test('งวด: ไม่พบรถ / ประเภทผิด / ปี 2 หลัก → ไม่เข้าแผน', () => {
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { plate: '99-9999 กท', type: 'พรบ.', endDate: '31/03/2570' }),
        c(3, { plate: '61-8550 กท', type: 'ประกันภัย', endDate: '31/03/2570' }),
        c(4, { plate: '61-8550 กท', type: 'พรบ', endDate: '31/03/70' }),
      ],
    },
    BASE,
  )
  assert.deepEqual(messages(r), [
    'งวด:2:ทะเบียน:ไม่พบรถทะเบียน 99-9999 กท — เพิ่มในชีต "รถ" ก่อน',
    'งวด:3:ประเภท:ต้องเป็น พรบ. / ภาษี / ประกันรถยนต์ / ประกันสินค้า',
    'งวด:4:วันสิ้นสุด:วันที่ "31/03/70" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570',
  ])
  assert.deepEqual(r.plan.coverages, [])
})

test('บริษัทประกัน: ไม่รู้จัก → unknownInsurers; ปิดใช้งาน → error; ภาษีห้ามกรอก; ชั้นเฉพาะประกันรถยนต์', () => {
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { plate: '61-8550 กท', type: 'พรบ.', insurer: 'นวกิจประกันภัย', endDate: '31/03/2570' }),
        c(3, { plate: '61-8550 กท', type: 'ประกันสินค้า', insurer: 'ปิดแล้วประกันภัย', coverageClass: 'ป.3', endDate: '11/01/2570' }),
        c(4, { plate: '61-8550 กท', type: 'ภาษี', insurer: 'วิริยะประกันภัย', endDate: '30/06/2570' }),
      ],
    },
    BASE,
  )
  assert.deepEqual(r.unknownInsurers, ['นวกิจประกันภัย'])
  assert.deepEqual(messages(r), [
    'งวด:2:บริษัทประกัน:ไม่พบบริษัทประกัน "นวกิจประกันภัย" ในระบบ',
    'งวด:3:บริษัทประกัน:บริษัทประกัน "ปิดแล้วประกันภัย" ถูกปิดใช้งาน',
    'งวด:3:ชั้น:กรอกชั้นได้เฉพาะประกันรถยนต์',
    'งวด:4:บริษัทประกัน:ภาษีไม่ต้องกรอกบริษัทประกัน',
  ])
})

test('สถานะการต่อ: ไม่รับ "ต่อแล้ว"; ไม่ต่อต้องมีเหตุผล; อื่นๆ ต้องมีหมายเหตุ; เหตุผลต้องคู่กับไม่ต่อ', () => {
  const base = { plate: '61-8550 กท', type: 'พรบ.' }
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { ...base, endDate: '31/03/2567', renewalStatus: 'ต่อแล้ว' }),
        c(3, { ...base, endDate: '31/03/2568', renewalStatus: 'ไม่ต่อ' }),
        c(4, { ...base, endDate: '31/03/2569', renewalStatus: 'ไม่ต่อ', notRenewedReason: 'อื่นๆ' }),
        c(5, { ...base, endDate: '31/03/2570', notRenewedReason: 'รถซ่อม' }),
      ],
    },
    BASE,
  )
  assert.deepEqual(messages(r), [
    'งวด:2:สถานะการต่อ:ไม่รับสถานะ "ต่อแล้ว" — ระบบปิดงวดเก่าให้เองเมื่อมีงวดใหม่',
    'งวด:3:เหตุผลไม่ต่อ:สถานะ "ไม่ต่อ" ต้องกรอกเหตุผล',
    'งวด:4:หมายเหตุ:เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ',
    'งวด:5:เหตุผลไม่ต่อ:กรอกเหตุผลได้เฉพาะสถานะ "ไม่ต่อ"',
  ])
})

test('งวดที่ตรง key เดิม → อัปเดต; งวดใหม่กว่าทำให้งวดเปิดเดิมปิดอัตโนมัติ', () => {
  const existing: ExistingSnapshot = {
    ...BASE,
    coverages: [{ id: 'cov-1', vehicleId: 'veh-1', type: 'PRB', endDate: '2026-03-31', renewalStatus: 'PENDING', renewedToId: null }],
  }
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { plate: '61-8550 กท', type: 'พรบ.', endDate: '31/03/2569', policyNumber: 'P-1' }),
        c(3, { plate: '61-8550 กท', type: 'พรบ.', endDate: '31/03/2570' }),
      ],
    },
    existing,
  )
  assert.deepEqual(r.errors, [])
  assert.equal(r.plan.coverages[0].existingId, 'cov-1')
  assert.deepEqual(r.summary, {
    vehiclesCreated: 0,
    vehiclesUpdated: 0,
    coveragesCreated: 1,
    coveragesUpdated: 1,
    coveragesAutoClosed: 1,
  })
})

test('รถถูกตั้งเป็น "ขาย" พร้อมงวดรอต่อในไฟล์เดียวกัน → นับเป็นปิดอัตโนมัติ', () => {
  const r = validateRenewalImport(
    {
      vehicles: [v(2, { plate: '61-8550 กท', status: 'ขาย', statusDate: '06/07/2569' })],
      coverages: [c(2, { plate: '61-8550 กท', type: 'ประกันรถยนต์', endDate: '09/01/2570', renewalStatus: 'รอต่อ' })],
    },
    BASE,
  )
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.plan.vehicles[0].data, { status: 'SOLD', statusDate: '2026-07-06' })
  assert.equal(r.summary.coveragesAutoClosed, 1)
})

test('สถานะรถ "เพิ่ม" / "รอตรวจสอบ" / "อื่นๆ" → map เป็น key และไม่ปิดงวด', () => {
  const r = validateRenewalImport(
    {
      vehicles: [
        v(2, { plate: '61-8550 กท', status: 'รอตรวจสอบ' }),
        v(3, { plate: '64-5598 กท', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', status: 'เพิ่ม' }),
        v(4, { plate: '76-1119 กท', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', status: 'อื่นๆ' }),
      ],
      coverages: [c(2, { plate: '61-8550 กท', type: 'ประกันรถยนต์', endDate: '09/01/2570', renewalStatus: 'รอต่อ' })],
    },
    BASE,
  )
  assert.deepEqual(r.errors, [])
  assert.deepEqual(
    r.plan.vehicles.map((x) => x.data.status),
    ['PENDING_REVIEW', 'ADDED', 'OTHER'],
  )
  assert.equal(r.summary.coveragesAutoClosed, 0)
})

test('งวดที่ปิดแล้วเปลี่ยนสถานะผ่าน import ไม่ได้ (ยกเว้นค่าเดิม)', () => {
  const existing: ExistingSnapshot = {
    ...BASE,
    coverages: [{ id: 'cov-1', vehicleId: 'veh-1', type: 'PRB', endDate: '2026-03-31', renewalStatus: 'NOT_RENEWED', renewedToId: null }],
  }
  const row = { plate: '61-8550 กท', type: 'พรบ.', endDate: '31/03/2569' }
  const same = validateRenewalImport({ vehicles: [], coverages: [c(2, { ...row, renewalStatus: 'ไม่ต่อ', notRenewedReason: 'งดใช้' })] }, existing)
  assert.deepEqual(same.errors, [])
  const reopen = validateRenewalImport({ vehicles: [], coverages: [c(2, { ...row, renewalStatus: 'รอต่อ' })] }, existing)
  assert.deepEqual(messages(reopen), ['งวด:2:สถานะการต่อ:งวดนี้ปิดแล้ว — เปลี่ยนสถานะผ่านหน้าจอ'])
})

test('ข้อมูลเล่มทะเบียน: จังหวัด / วันที่จดทะเบียน (พ.ศ.) / ข้อความ / สูบ-แรงม้า-เพลา เข้าแผน', () => {
  const r = validateRenewalImport(
    {
      vehicles: [
        v(2, {
          plate: '61-8550 กท',
          plateProvince: 'กทม.',
          registrationDate: '15/08/2565',
          modelName: 'FVZ34',
          color: 'ขาว',
          chassisPosition: 'โครงขวาหน้า',
          engineNumber: '6HK1-123456',
          engineCylinders: '6',
          engineHorsepower: '300',
          axleCount: 3,
        }),
      ],
      coverages: [],
    },
    BASE,
  )
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.plan.vehicles[0].data, {
    modelName: 'FVZ34',
    color: 'ขาว',
    chassisPosition: 'โครงขวาหน้า',
    engineNumber: '6HK1-123456',
    engineCylinders: 6,
    engineHorsepower: 300,
    axleCount: 3,
    plateProvince: 'กรุงเทพมหานคร',
    registrationDate: '2022-08-15',
  })
})

test('รถอยู่ไหน: ตรงตัวเลือก → เข้าแผน; ไม่ตรง → error บอกตัวเลือก; ว่าง = คงค่าเดิม', () => {
  const r = validateRenewalImport(
    {
      vehicles: [
        v(2, { plate: '61-8550 กท', currentLocation: ' โรงสี ' }),
        v(3, { plate: '64-5598 กท', ownerName: 'a', vehicleType: 'b', currentLocation: 'อู่บางนา' }),
        v(4, { plate: '76-1119 กท', ownerName: 'a', vehicleType: 'b', currentLocation: '' }),
      ],
      coverages: [],
    },
    BASE,
  )
  assert.deepEqual(messages(r), ['รถ:3:รถอยู่ไหน:ต้องเป็น โรงสี'])
  assert.deepEqual(r.plan.vehicles[0].data, { currentLocation: 'โรงสี' })
  assert.deepEqual(r.plan.vehicles[2].data, { ownerName: 'a', vehicleType: 'b' })
})

test('ข้อมูลเล่มทะเบียนผิด → error ระบุคอลัมน์; ช่องว่างไม่อยู่ในแผน (คงค่าเดิม)', () => {
  const r = validateRenewalImport(
    {
      vehicles: [
        v(2, {
          plate: '61-8550 กท',
          plateProvince: 'ชบ',
          registrationDate: '15/08/65',
          engineCylinders: '101',
          engineHorsepower: '10,001',
          axleCount: '2.5',
        }),
        v(3, { plate: '70-0001 กท', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'หาง', plateProvince: '', registrationDate: '', axleCount: '' }),
      ],
      coverages: [],
    },
    BASE,
  )
  assert.deepEqual(messages(r), [
    'รถ:2:จำนวนสูบ:ต้องอยู่ระหว่าง 0 ถึง 100',
    'รถ:2:แรงม้า:ต้องอยู่ระหว่าง 0 ถึง 10,000',
    'รถ:2:จำนวนเพลา:ต้องเป็นจำนวนเต็ม',
    'รถ:2:จังหวัด (ทะเบียนรถ):ไม่พบจังหวัด "ชบ" — กรอกชื่อจังหวัดเต็ม เช่น กรุงเทพมหานคร, ชลบุรี',
    'รถ:2:วันที่จดทะเบียน:วันที่ "15/08/65" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570',
  ])
  assert.deepEqual(r.plan.vehicles[1].data, { ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'หาง' })
})

test('ความยาวข้อความ: ใช้ค่าเดียวกับ schema — ยาวเกิน → error ระบุคอลัมน์', () => {
  const r = validateRenewalImport(
    {
      vehicles: [
        v(2, { plate: '61-8550 กท', fleetNumber: 'x'.repeat(51), color: 'ข'.repeat(50), note: 'n'.repeat(501) }),
        v(3, { plate: `70-${'1'.repeat(30)} กท`, ownerName: 'a', vehicleType: 'b' }),
      ],
      coverages: [
        c(2, { plate: '61-8550 กท', type: 'พรบ.', endDate: '31/03/2570', policyNumber: 'P'.repeat(101), renewalNote: 'r'.repeat(501) }),
      ],
    },
    BASE,
  )
  assert.deepEqual(messages(r), [
    'รถ:2:เบอร์รถ:ข้อความยาวเกิน 50 ตัวอักษร',
    'รถ:2:หมายเหตุ:ข้อความยาวเกิน 500 ตัวอักษร',
    'รถ:3:ทะเบียน:ข้อความยาวเกิน 30 ตัวอักษร',
    'งวด:2:เลขกรมธรรม์:ข้อความยาวเกิน 100 ตัวอักษร',
    'งวด:2:หมายเหตุ:ข้อความยาวเกิน 500 ตัวอักษร',
  ])
  assert.equal(r.plan.vehicles[0].data.color, 'ข'.repeat(50))
})

test('ตัวแทน: เข้าแผน; ภาษีห้ามกรอก (เหมือนบริษัทประกัน); ยาวเกิน 100 → error; ว่าง = คงค่าเดิม', () => {
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { plate: '61-8550 กท', type: 'พรบ.', endDate: '31/03/2570', agentName: ' คุณสมชาย ' }),
        c(3, { plate: '61-8550 กท', type: 'ภาษี', endDate: '30/06/2570', agentName: 'คุณสมชาย' }),
        c(4, { plate: '61-8550 กท', type: 'ประกันสินค้า', endDate: '11/01/2570', agentName: 'a'.repeat(101) }),
        c(5, { plate: '61-8550 กท', type: 'ประกันรถยนต์', endDate: '09/01/2570', agentName: '' }),
      ],
    },
    BASE,
  )
  assert.deepEqual(messages(r), ['งวด:3:ตัวแทน:ภาษีไม่ต้องกรอกตัวแทน', 'งวด:4:ตัวแทน:ข้อความยาวเกิน 100 ตัวอักษร'])
  assert.deepEqual(r.plan.coverages[0].data, { agentName: 'คุณสมชาย' })
  assert.deepEqual(r.plan.coverages[3].data, {})
})
