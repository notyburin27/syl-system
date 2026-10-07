import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { COVERAGE_COLUMNS, VEHICLE_COLUMNS } from '../columns'
import { buildRenewalTemplate, readRenewalWorkbook } from '../workbook'

const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/** หัวคอลัมน์ของ template ก่อนเพิ่มข้อมูลเล่มทะเบียน / ตัวแทน */
const OLD_VEHICLE_HEADERS = ['ทะเบียน', 'เบอร์รถ', 'บริษัท', 'ลักษณะ', 'ยี่ห้อ', 'เลขตัวถัง', 'เชื้อเพลิง', 'น้ำหนัก(กก.)', 'สถานะ', 'วันที่สถานะ', 'หมายเหตุ']
const OLD_COVERAGE_HEADERS = ['ทะเบียน', 'ประเภท', 'บริษัทประกัน', 'ชั้น', 'เลขกรมธรรม์', 'วันเริ่ม', 'วันสิ้นสุด', 'เบี้ย/ภาษี', 'ค่าบริการ', 'ทะเบียนหางคู่', 'สถานะการต่อ', 'เหตุผลไม่ต่อ', 'หมายเหตุ']

async function loadTemplate() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(toArrayBuffer(await buildRenewalTemplate()))
  return wb
}

async function toBuffer(wb: ExcelJS.Workbook) {
  return toArrayBuffer(Buffer.from(await wb.xlsx.writeBuffer()))
}

test('template เปล่า → อ่านได้ 0 แถว (แถวที่มีแค่ dropdown ถูกข้าม) และมีชีตวิธีกรอก', async () => {
  const wb = await loadTemplate()
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['รถ', 'งวด', 'วิธีกรอก', 'จังหวัด'])
  assert.deepEqual(await readRenewalWorkbook(await toBuffer(wb)), { vehicles: [], coverages: [] })
})

test('ข้ามแถวที่มีแค่สี และเก็บเลขแถวจริง; date cell ได้ Date', async () => {
  const wb = await loadTemplate()
  const ws = wb.getWorksheet('งวด')!
  ws.getCell('A2').value = '64-5598 กท'
  ws.getCell('B2').value = 'พรบ.'
  ws.getCell('G2').numFmt = 'dd/mm/yyyy' // ผู้ใช้เปลี่ยนเป็นช่องวันที่เอง (template ตั้งเป็นข้อความ)
  ws.getCell('G2').value = new Date(Date.UTC(2027, 2, 31))
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
  ws.getCell('A4').value = '61-8550 กท'
  ws.getCell('B4').value = 'ภาษี'
  ws.getCell('G4').value = '30/06/2570'

  const result = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok(!('error' in result))
  assert.deepEqual(result.coverages.map((r) => r.row), [2, 4])
  assert.ok(result.coverages[0].values.endDate instanceof Date)
  assert.equal(result.coverages[1].values.endDate, '30/06/2570')
})

test('จับคู่ด้วยชื่อหัวคอลัมน์ — สลับลำดับได้', async () => {
  const wb = new ExcelJS.Workbook()
  const vehicles = wb.addWorksheet('รถ')
  vehicles.addRow(['หมายเหตุ', 'วันที่สถานะ', 'สถานะ', 'น้ำหนัก(กก.)', 'เชื้อเพลิง', 'เลขตัวถัง', 'ยี่ห้อ', 'ลักษณะ', 'บริษัท', 'เบอร์รถ', 'ทะเบียน'])
  vehicles.addRow(['', '', '', '', '', '', '', 'หาง', 'แวลู ทรานสปอร์ต', '17', '73-4940 กท'])
  wb.addWorksheet('งวด').addRow(Object.values(COVERAGE_COLUMNS))

  const result = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok(!('error' in result))
  assert.equal(result.vehicles[0].values.plate, '73-4940 กท')
  assert.equal(result.vehicles[0].values.vehicleType, 'หาง')
})

test('ไฟล์ template เดิม: หัวคอลัมน์ชื่อเดิมยังอ่านได้ และไม่มีคอลัมน์ใหม่ก็ไม่ error', async () => {
  const wb = new ExcelJS.Workbook()
  const vehicles = wb.addWorksheet('รถ')
  vehicles.addRow(OLD_VEHICLE_HEADERS)
  vehicles.addRow(['73-4940 กท', '17', 'แวลู ทรานสปอร์ต', 'หาง', 'TIGER', 'TT123', 'ดีเซล', '7,900', 'ขาย', '06/07/2569', 'x'])
  const coverages = wb.addWorksheet('งวด')
  coverages.addRow(OLD_COVERAGE_HEADERS)
  coverages.addRow(['73-4940 กท', 'พรบ.', '', '', '', '', '31/03/2570'])

  const result = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok(!('error' in result))
  assert.deepEqual(result.vehicles[0].values, {
    plate: '73-4940 กท',
    fleetNumber: '17',
    ownerName: 'แวลู ทรานสปอร์ต',
    vehicleType: 'หาง',
    brand: 'TIGER',
    chassisNumber: 'TT123',
    fuelType: 'ดีเซล',
    weightKg: '7,900',
    status: 'ขาย',
    statusDate: '06/07/2569',
    note: 'x',
  })
  assert.equal(result.coverages[0].values.agentName, undefined)
})

test('template ใหม่: คอลัมน์ข้อมูลเล่มทะเบียนอ่านได้; หัวคอลัมน์ไม่สนช่องว่าง', async () => {
  const wb = new ExcelJS.Workbook()
  const vehicles = wb.addWorksheet('รถ')
  const headers = Object.values(VEHICLE_COLUMNS).map((h) => (h === 'น้ำหนักตัวรถ (กก.)' ? 'น้ำหนักตัวรถ(กก.)' : h))
  vehicles.addRow(headers)
  const keys = Object.keys(VEHICLE_COLUMNS) as (keyof typeof VEHICLE_COLUMNS)[]
  const row = { plate: '73-4940 กท', plateProvince: 'ชลบุรี', registrationDate: '15/08/2565', engineCylinders: 6, axleCount: 3, weightKg: 7900 }
  vehicles.addRow(keys.map((k) => (row as Record<string, unknown>)[k] ?? ''))
  wb.addWorksheet('งวด').addRow(Object.values(COVERAGE_COLUMNS))

  const result = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok(!('error' in result))
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.vehicles[0].values).filter(([, value]) => value !== null && value !== '')),
    row,
  )
})

test('ขาดคอลัมน์ / ขาดชีต / ไม่ใช่ xlsx → error ภาษาไทย', async () => {
  const wb = await loadTemplate()
  wb.removeWorksheet(wb.getWorksheet('งวด')!.id)
  wb.addWorksheet('งวด').addRow(['ทะเบียน', 'ประเภท'])
  const missingColumns = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok('error' in missingColumns)
  assert.match(missingColumns.error, /^ชีต "งวด" ไม่มีคอลัมน์: บริษัทประกัน, ชั้น, เลขกรมธรรม์/)
  assert.doesNotMatch(missingColumns.error, /ตัวแทน/)

  const noBrand = new ExcelJS.Workbook()
  noBrand.addWorksheet('รถ').addRow(['ทะเบียน', 'เบอร์รถ', 'บริษัท', 'ลักษณะ', 'เลขตัวถัง', 'เชื้อเพลิง', 'น้ำหนัก(กก.)', 'สถานะ', 'วันที่สถานะ', 'หมายเหตุ'])
  noBrand.addWorksheet('งวด').addRow(Object.values(COVERAGE_COLUMNS))
  assert.deepEqual(await readRenewalWorkbook(await toBuffer(noBrand)), {
    error: 'ชีต "รถ" ไม่มีคอลัมน์: ยี่ห้อ — ดาวน์โหลด template ใหม่',
  })

  const onlyVehicles = new ExcelJS.Workbook()
  onlyVehicles.addWorksheet('รถ')
  assert.deepEqual(await readRenewalWorkbook(await toBuffer(onlyVehicles)), {
    error: 'ไฟล์ต้องมีชีต "รถ" และ "งวด" — ดาวน์โหลด template',
  })

  assert.deepEqual(await readRenewalWorkbook(toArrayBuffer(Buffer.from('not excel'))), {
    error: 'อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .xlsx',
  })
})

test('template ตั้งคอลัมน์วันที่เป็นข้อความ (numFmt @) และยังมี dropdown', async () => {
  const wb = await loadTemplate()
  const ws = wb.getWorksheet('งวด')!
  assert.equal(ws.getCell('G2').numFmt, '@')
  assert.equal(ws.getCell('F2').numFmt, '@')
  const vehicles = wb.getWorksheet('รถ')!
  assert.equal(vehicles.getCell('J1').value, 'วันที่แจ้งสถานะ')
  assert.equal(vehicles.getCell('J2').numFmt, '@')
  assert.equal(vehicles.getCell('M1').value, 'วันที่จดทะเบียน')
  assert.equal(vehicles.getCell('M2').numFmt, '@')
  assert.equal(ws.getCell('B2').dataValidation?.type, 'list')
})

test('template: คอลัมน์เดิมอยู่ตำแหน่งเดิม คอลัมน์ใหม่ต่อท้าย (วางบล็อกจากไฟล์เดิมแล้วตรงกัน)', async () => {
  const wb = await loadTemplate()
  const headers = (name: string) => (wb.getWorksheet(name)!.getRow(1).values as unknown[]).slice(1)
  const renamed: Record<string, string> = { เลขตัวถัง: 'เลขตัวรถ (คัสซี)', 'น้ำหนัก(กก.)': 'น้ำหนักตัวรถ (กก.)', วันที่สถานะ: 'วันที่แจ้งสถานะ' }
  assert.deepEqual(headers('รถ').slice(0, 11), OLD_VEHICLE_HEADERS.map((h) => renamed[h] ?? h))
  assert.deepEqual(headers('รถ').slice(11), [
    'จังหวัด (ทะเบียนรถ)',
    'วันที่จดทะเบียน',
    'แบบ/รุ่น',
    'สีรถ',
    'ตำแหน่งคัสซี',
    'เลขเครื่องยนต์',
    'จำนวนสูบ',
    'แรงม้า',
    'จำนวนเพลา',
    'รถอยู่ไหน',
  ])
  assert.deepEqual(headers('งวด'), [...OLD_COVERAGE_HEADERS, 'ตัวแทน'])
})

test('template: dropdown จังหวัดอ้างชีตรายชื่อ 77 จังหวัดที่ซ่อนไว้ และเว้นว่างได้', async () => {
  const wb = await loadTemplate()
  const provinces = wb.getWorksheet('จังหวัด')!
  assert.equal(provinces.state, 'veryHidden')
  assert.equal(provinces.rowCount, 77)
  assert.equal(provinces.getCell('A1').value, 'กรุงเทพมหานคร')
  assert.equal(provinces.getCell('A77').value, 'อุบลราชธานี')
  const vehicles = wb.getWorksheet('รถ')!
  assert.equal(vehicles.getCell('L1').value, 'จังหวัด (ทะเบียนรถ)')
  for (const cell of ['L2', 'L1000']) {
    assert.deepEqual(vehicles.getCell(cell).dataValidation, {
      type: 'list',
      allowBlank: true,
      formulae: ["'จังหวัด'!$A$1:$A$77"],
    })
  }
})
