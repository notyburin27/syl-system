import { COVERAGE_TEXT_MAX, RENEWAL_STATUS_LABELS, VEHICLE_LOCATIONS, VEHICLE_TEXT_MAX } from '../constants'

export const VEHICLE_SHEET = 'รถ'
export const COVERAGE_SHEET = 'งวด'
export const GUIDE_SHEET = 'วิธีกรอก'
/** ชีตรายชื่อจังหวัดสำหรับ dropdown (ซ่อนไว้ ระบบไม่อ่านชีตนี้) */
export const PROVINCE_SHEET = 'จังหวัด'

/**
 * ลำดับ key = ลำดับคอลัมน์ใน template; ตอนอ่านจับคู่ด้วยชื่อหัวคอลัมน์ จึงสลับลำดับได้
 * คอลัมน์ที่เพิ่มทีหลังต่อท้ายเสมอ — วางข้อมูลทั้งบล็อกจากไฟล์ template เดิมลง template ใหม่แล้วคอลัมน์ตรงกัน
 */
export const VEHICLE_COLUMNS = {
  plate: 'ทะเบียน',
  fleetNumber: 'เบอร์รถ',
  ownerName: 'บริษัท',
  vehicleType: 'ลักษณะ',
  brand: 'ยี่ห้อ',
  chassisNumber: 'เลขตัวรถ (คัสซี)',
  fuelType: 'เชื้อเพลิง',
  weightKg: 'น้ำหนักตัวรถ (กก.)',
  status: 'สถานะ',
  statusDate: 'วันที่แจ้งสถานะ',
  note: 'หมายเหตุ',
  plateProvince: 'จังหวัด (ทะเบียนรถ)',
  registrationDate: 'วันที่จดทะเบียน',
  modelName: 'แบบ/รุ่น',
  color: 'สีรถ',
  chassisPosition: 'ตำแหน่งคัสซี',
  engineNumber: 'เลขเครื่องยนต์',
  engineCylinders: 'จำนวนสูบ',
  engineHorsepower: 'แรงม้า',
  axleCount: 'จำนวนเพลา',
  currentLocation: 'รถอยู่ไหน',
} as const

/** หัวคอลัมน์ชื่อเดิม (template ก่อนเปลี่ยนชื่อตามฟอร์ม) — ยังรับตอนอ่าน ไฟล์ที่กรอกไว้แล้วนำเข้าได้เหมือนเดิม */
export const VEHICLE_COLUMN_ALIASES: Partial<Record<VehicleColumnKey, readonly string[]>> = {
  chassisNumber: ['เลขตัวถัง'],
  weightKg: ['น้ำหนัก(กก.)'],
  statusDate: ['วันที่สถานะ'],
}

/** คอลัมน์ที่เพิ่มทีหลัง — ไฟล์ที่ไม่มีคอลัมน์เหล่านี้ยังนำเข้าได้ (เท่ากับเว้นว่าง = คงค่าเดิม) */
export const OPTIONAL_VEHICLE_COLUMNS: readonly VehicleColumnKey[] = [
  'plateProvince',
  'registrationDate',
  'modelName',
  'color',
  'chassisPosition',
  'engineNumber',
  'engineCylinders',
  'engineHorsepower',
  'axleCount',
  'currentLocation',
]

export const COVERAGE_COLUMNS = {
  plate: 'ทะเบียน',
  type: 'ประเภท',
  insurer: 'บริษัทประกัน',
  coverageClass: 'ชั้น',
  policyNumber: 'เลขกรมธรรม์',
  startDate: 'วันเริ่ม',
  endDate: 'วันสิ้นสุด',
  amount: 'เบี้ย/ภาษี',
  serviceFee: 'ค่าบริการ',
  pairedPlate: 'ทะเบียนหางคู่',
  renewalStatus: 'สถานะการต่อ',
  notRenewedReason: 'เหตุผลไม่ต่อ',
  renewalNote: 'หมายเหตุ',
  agentName: 'ตัวแทน',
} as const

/** คอลัมน์งวดที่เพิ่มทีหลัง — ไฟล์ที่ไม่มีคอลัมน์นี้ยังนำเข้าได้ */
export const OPTIONAL_COVERAGE_COLUMNS: readonly CoverageColumnKey[] = ['agentName']

export type VehicleColumnKey = keyof typeof VEHICLE_COLUMNS
export type CoverageColumnKey = keyof typeof COVERAGE_COLUMNS

export type ImportStatusKey = 'PENDING' | 'IN_PROGRESS' | 'NOT_RENEWED'

/** "ต่อแล้ว" ไม่รับใน import — ระบบปิดงวดเก่าให้เองเมื่อมีงวดใหม่ */
export const IMPORT_STATUS_LABELS: Record<ImportStatusKey, string> = {
  PENDING: RENEWAL_STATUS_LABELS.PENDING,
  IN_PROGRESS: RENEWAL_STATUS_LABELS.IN_PROGRESS,
  NOT_RENEWED: RENEWAL_STATUS_LABELS.NOT_RENEWED,
}

export interface RawRow<K extends string> {
  /** เลขแถวใน Excel (สำหรับแจ้ง error) */
  row: number
  values: Partial<Record<K, unknown>>
}

/** "ทะเบียน ไม่เกิน 30 / เบอร์รถ, ... ไม่เกิน 50 / ..." สร้างจากค่าเดียวกับที่ใช้ตรวจ */
function textLengthGuide(): string {
  const labelsByMax = new Map<number, Set<string>>()
  const add = (label: string, max: number) => labelsByMax.set(max, (labelsByMax.get(max) ?? new Set()).add(label))
  for (const [k, max] of Object.entries(VEHICLE_TEXT_MAX)) add(VEHICLE_COLUMNS[k as VehicleColumnKey], max)
  for (const [k, max] of Object.entries(COVERAGE_TEXT_MAX)) add(COVERAGE_COLUMNS[k as CoverageColumnKey], max)
  return [...labelsByMax]
    .sort(([a], [b]) => a - b)
    .map(([max, labels]) => `${[...labels].join(', ')} ไม่เกิน ${max}`)
    .join(' / ')
    .concat(' ตัวอักษร')
}

export const GUIDE_ROWS: [string, string][] = [
  ['ชีต / คอลัมน์', 'วิธีกรอก'],
  ['ชีต "รถ"', '1 แถว = รถ 1 คัน — ทะเบียนใช้จับคู่กับรถที่มีอยู่แล้ว'],
  ['ทะเบียน *', 'เช่น 64-5598 กท (จุดท้าย / ช่องว่างซ้อน ระบบจัดให้เอง)'],
  ['บริษัท, ลักษณะ', 'บังคับเฉพาะรถใหม่ — รถที่มีอยู่แล้วเว้นว่าง = คงค่าเดิม'],
  ['สถานะ', 'เพิ่ม / รอตรวจสอบ / ใช้งาน / งดใช้ / ขาย / อื่นๆ — "ขาย" จะปิดงวดที่ยังเปิดอยู่ของรถคันนั้นเป็น "ไม่ต่อ (ขายรถ)"'],
  ['รถอยู่ไหน', `เลือกจาก dropdown: ${VEHICLE_LOCATIONS.join(' / ')} — เว้นว่าง = คงค่าเดิม`],
  ['จังหวัด (ทะเบียนรถ)', 'เลือกจาก dropdown หรือพิมพ์ชื่อจังหวัดเต็ม เช่น กรุงเทพมหานคร, ชลบุรี (กรุงเทพฯ / กทม. ระบบแปลงให้)'],
  ['วันที่จดทะเบียน, วันที่แจ้งสถานะ', 'วว/ดด/ปปปป เช่น 15/08/2565 (พ.ศ. หรือ ค.ศ. ก็ได้ แต่ปีต้อง 4 หลัก) หรือช่องวันที่ของ Excel'],
  ['จำนวนสูบ, แรงม้า, จำนวนเพลา', 'จำนวนเต็ม — สูบไม่เกิน 100, แรงม้าไม่เกิน 10,000, เพลาไม่เกิน 20'],
  ['น้ำหนักตัวรถ (กก.)', 'จำนวนเต็ม มีคอมมาได้ เช่น 7,900'],
  ['ไฟล์ template เดิม', 'หัวคอลัมน์ชื่อเดิม (เลขตัวถัง, น้ำหนัก(กก.), วันที่สถานะ) ยังใช้ได้ — ไม่มีคอลัมน์ที่เพิ่มใหม่ = เว้นว่าง (คงค่าเดิม)'],
  ['ชีต "งวด"', '1 แถว = 1 งวด — ทะเบียน + ประเภท + วันสิ้นสุด ใช้จับคู่กับงวดที่มีอยู่แล้ว'],
  ['ประเภท *', 'พรบ. / ภาษี / ประกันรถยนต์ / ประกันสินค้า'],
  ['บริษัทประกัน', 'ต้องตรงกับชื่อในเมนู "บริษัทประกัน" — ภาษีไม่ต้องกรอก'],
  ['ตัวแทน', 'ชื่อตัวแทน — ภาษีไม่ต้องกรอก; ไม่มีคอลัมน์นี้ในไฟล์ = เว้นว่าง'],
  ['ชั้น, ทะเบียนหางคู่', 'เฉพาะประกันรถยนต์ — ชั้น: ป.1 / ป.2+ / ป.3 / ป.3+'],
  ['วันเริ่ม, วันสิ้นสุด *', 'วว/ดด/ปปปป เช่น 31/03/2570 (พ.ศ. หรือ ค.ศ. ก็ได้ แต่ปีต้อง 4 หลัก) หรือช่องวันที่ของ Excel'],
  ['เบี้ย/ภาษี, ค่าบริการ', 'ตัวเลข มีคอมมาได้ เช่น 13,449.50'],
  ['สถานะการต่อ', 'รอต่อ / กำลังดำเนินการ / ไม่ต่อ (งวดใหม่เว้นว่าง = รอต่อ) — ไม่ต้องกรอก "ต่อแล้ว"'],
  ['เหตุผลไม่ต่อ', 'ขายรถ / งดใช้ / รถเกิดอุบัติเหตุ / รถซ่อม / อื่นๆ ("อื่นๆ" ต้องกรอกหมายเหตุ)'],
  ['ความยาวข้อความ', textLengthGuide()],
  ['ช่องว่าง', 'ข้อมูลที่มีอยู่แล้วในระบบ ถ้าเว้นว่างจะคงค่าเดิม'],
]
