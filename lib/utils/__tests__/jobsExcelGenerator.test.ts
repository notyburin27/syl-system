import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { generateJobsExcel } from '../jobsExcelGenerator'

const LIGHT_GRID = 'FFD9D9D9'

const HEADER_ROW = 2
const FIRST_DATA_ROW = 3

const JOBS = [
  {
    jobDate: new Date('2026-10-01T00:00:00+07:00'),
    jobNumber: '164942/549792',
    jobType: 'outbound',
    customer: { name: 'K-APEX' },
    size: '20DC',
    pickupLocation: { name: 'SYL' },
    factoryLocation: { name: 'เชอร่า ลพบุรี' },
    returnLocation: { name: 'BBT' },
    income: 9000,
    driverWage: 800,
    toll: 90,
    returnFee: 1338,
    mileage: 870419,
    fuelOfficeLiters: 102,
    transfers: [{ isCompleted: true, amount: 1428 }],
    clearStatus: true,
  },
  {
    jobDate: new Date('2026-10-02T00:00:00+07:00'),
    jobNumber: 'ADV-1',
    jobType: 'advance',
    advance: 1000,
    transfers: [],
  },
]

// แถวข้อมูล: 2 งาน + banner วันอาทิตย์ (วันที่ 4) → แถว 3-5, แถวสรุปเริ่มแถว 6
const LAST_DATA_ROW = FIRST_DATA_ROW + 2
const FIRST_SUMMARY_ROW = LAST_DATA_ROW + 1
const TOTAL_ROW = FIRST_SUMMARY_ROW + 1

async function build(isAdmin = true) {
  const buf = await generateJobsExcel(JOBS as never, 'คนขับ', '2026-10', '136', isAdmin, [{ day: 4, label: 'วันอาทิตย์' }])
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  const headers: string[] = []
  ws.getRow(HEADER_ROW).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value)
  })
  const col = (header: string) => {
    const idx = headers.indexOf(header)
    assert.ok(idx > 0, `ไม่พบคอลัมน์ ${header}`)
    return idx
  }
  const border = (row: number, column: number) => ws.getRow(row).getCell(column).border ?? {}
  return { ws, col, border, lastCol: headers.length - 1 }
}

const isLight = (side?: Partial<ExcelJS.Border>) => side?.style === 'thin' && side.color?.argb === LIGHT_GRID
const isBlackThin = (side?: Partial<ExcelJS.Border>) => side?.style === 'thin' && side.color?.argb !== LIGHT_GRID

test('แถวข้อมูลช่วง วันที่ → น้ำมันเครดิต (฿): เส้นบางเป็นสีเทาอ่อน', async () => {
  const { col, border } = await build()
  // แถวข้อมูลสุดท้ายมีเส้นล่างสีดำคั่นกับแถวสรุป (ทดสอบแยกด้านล่าง)
  for (let row = FIRST_DATA_ROW; row < LAST_DATA_ROW; row++) {
    for (let c = 1; c < col('ยกยอด'); c++) {
      assert.ok(isLight(border(row, c).bottom), `เส้นล่างแถว ${row} คอลัมน์ ${c} ต้องเป็นสีเทา`)
    }
  }
  // ขอบซ้ายสุดของแถวข้อมูลก็เป็นเส้นเทา
  assert.ok(isLight(border(FIRST_DATA_ROW, 1).left))
})

test('เส้นคั่น สถานที่รับตู้ | โรงงาน | สถานที่คืนตู้ ในแถวข้อมูลเป็นเส้นเทา', async () => {
  const { col, border } = await build()
  for (const header of ['โรงงาน', 'สถานที่คืนตู้']) {
    const c = col(header)
    assert.ok(isLight(border(FIRST_DATA_ROW, c).left), `${header} ซ้าย`)
    assert.ok(isLight(border(FIRST_DATA_ROW, c - 1).right), `ก่อน ${header} ขวา`)
  }
})

test('แถวข้อมูลช่วง ยกยอด → ยกเลิก: เส้นบางยังเป็นสีดำ', async () => {
  const { col, border, lastCol } = await build()
  for (let c = col('ยกยอด'); c <= lastCol; c++) {
    assert.ok(isBlackThin(border(FIRST_DATA_ROW, c).bottom), `เส้นล่างคอลัมน์ ${c} ต้องเป็นสีดำ`)
  }
  assert.ok(isBlackThin(border(FIRST_DATA_ROW, lastCol).right))
})

test('เส้นหนาแบ่งกลุ่ม: ไมล์รถ→น้ำมันเครดิต (฿) เป็นกล่อง และ ยกยอด หนาทั้งสองข้าง', async () => {
  const { col, border } = await build()
  for (const row of [HEADER_ROW, FIRST_DATA_ROW, FIRST_SUMMARY_ROW, TOTAL_ROW]) {
    assert.equal(border(row, col('ไมล์รถ')).left?.style, 'medium', `ไมล์รถ ซ้าย แถว ${row}`)
    assert.equal(border(row, col('หมายเหตุ')).right?.style, 'medium', `หมายเหตุ ขวา แถว ${row}`)
    assert.equal(border(row, col('น้ำมันเครดิต (฿)')).right?.style, 'medium', `น้ำมันเครดิต (฿) ขวา แถว ${row}`)
    assert.equal(border(row, col('ยกยอด')).left?.style, 'medium', `ยกยอด ซ้าย แถว ${row}`)
    assert.equal(border(row, col('ยกยอด')).right?.style, 'medium', `ยกยอด ขวา แถว ${row}`)
    assert.equal(border(row, col('โอนครั้งที่ 1')).left?.style, 'medium', `โอนครั้งที่ 1 ซ้าย แถว ${row}`)
    // เส้นหนาเดิมยังอยู่ และเซลล์ข้างเคียงใช้เส้นเดียวกัน
    assert.equal(border(row, col('ค่าขนส่ง')).left?.style, 'medium', `ค่าขนส่ง ซ้าย แถว ${row}`)
    assert.equal(border(row, col('สถานที่คืนตู้')).right?.style, 'medium', `สถานที่คืนตู้ ขวา แถว ${row}`)
    assert.equal(border(row, col('รวมคนรถปิดงาน')).right?.style, 'medium', `รวมคนรถปิดงาน ขวา แถว ${row}`)
  }
})

test('หัวตาราง: กรอบหนารอบทั้งแถว เส้นคั่นข้างในเป็นเส้นดำ', async () => {
  const { col, border, lastCol } = await build()
  assert.equal(border(HEADER_ROW, 1).left?.style, 'medium')
  assert.equal(border(HEADER_ROW, lastCol).right?.style, 'medium')
  assert.ok(isBlackThin(border(HEADER_ROW, col('โรงงาน')).left))
})

test('แถวสรุปแรก: ช่วงเส้นเทาคั่นด้วยเส้นดำบาง ช่วงยกยอด→ยกเลิก ยังเป็นเส้นหนา', async () => {
  const { col, border, lastCol } = await build()
  for (let c = 1; c < col('ยกยอด'); c++) {
    assert.ok(isBlackThin(border(FIRST_SUMMARY_ROW, c).top), `แถวสรุปแรก คอลัมน์ ${c} บน`)
    // เซลล์ที่ชนกันต้องเป็นเส้นเดียวกัน ไม่งั้น Excel อาจเลือกแสดงเส้นเทา
    assert.ok(isBlackThin(border(LAST_DATA_ROW, c).bottom), `แถวข้อมูลสุดท้าย คอลัมน์ ${c} ล่าง`)
  }
  assert.equal(border(FIRST_SUMMARY_ROW, col('ยกยอด')).top?.style, 'medium')
  assert.equal(border(FIRST_SUMMARY_ROW, lastCol).top?.style, 'medium')
  // แถวรวมยอดยังมีกรอบหนาบน-ล่างทุกคอลัมน์
  for (const header of ['วันที่', 'ค่าขนส่ง', 'ยกยอด']) {
    assert.equal(border(TOTAL_ROW, col(header)).top?.style, 'medium', `${header} บน`)
    assert.equal(border(TOTAL_ROW, col(header)).bottom?.style, 'medium', `${header} ล่าง`)
  }
})

test('ไม่ใช่ ADMIN (ไม่มีคอลัมน์ค่าขนส่ง): เส้นเทาและเส้นหนาตามกลุ่มยังถูกต้อง', async () => {
  const { col, border } = await build(false)
  assert.ok(isLight(border(FIRST_DATA_ROW, col('เบิกล่วงหน้า')).bottom))
  assert.ok(isLight(border(FIRST_DATA_ROW, col('เบิกล่วงหน้า')).left))
  assert.equal(border(FIRST_DATA_ROW, col('รวมคนรถปิดงาน')).left?.style, 'medium')
  assert.equal(border(FIRST_DATA_ROW, col('ไมล์รถ')).left?.style, 'medium')
  assert.equal(border(FIRST_DATA_ROW, col('ยกยอด')).right?.style, 'medium')
})
