import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { COVERAGE_COLUMNS } from '../columns'
import { buildRenewalTemplate, readRenewalWorkbook } from '../workbook'

const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

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
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['รถ', 'งวด', 'วิธีกรอก'])
  assert.deepEqual(await readRenewalWorkbook(await toBuffer(wb)), { vehicles: [], coverages: [] })
})

test('ข้ามแถวที่มีแค่สี และเก็บเลขแถวจริง; date cell ได้ Date', async () => {
  const wb = await loadTemplate()
  const ws = wb.getWorksheet('งวด')!
  ws.getCell('A2').value = '64-5598 กท'
  ws.getCell('B2').value = 'พรบ.'
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

test('ขาดคอลัมน์ / ขาดชีต / ไม่ใช่ xlsx → error ภาษาไทย', async () => {
  const wb = await loadTemplate()
  wb.removeWorksheet(wb.getWorksheet('งวด')!.id)
  wb.addWorksheet('งวด').addRow(['ทะเบียน', 'ประเภท'])
  const missingColumns = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok('error' in missingColumns)
  assert.match(missingColumns.error, /^ชีต "งวด" ไม่มีคอลัมน์: บริษัทประกัน, ชั้น, เลขกรมธรรม์/)

  const onlyVehicles = new ExcelJS.Workbook()
  onlyVehicles.addWorksheet('รถ')
  assert.deepEqual(await readRenewalWorkbook(await toBuffer(onlyVehicles)), {
    error: 'ไฟล์ต้องมีชีต "รถ" และ "งวด" — ดาวน์โหลด template',
  })

  assert.deepEqual(await readRenewalWorkbook(toArrayBuffer(Buffer.from('not excel'))), {
    error: 'อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .xlsx',
  })
})
