import ExcelJS from 'exceljs'
import { normalizeCellValue } from '@/lib/utils/excel'
import {
  COVERAGE_CLASSES,
  COVERAGE_TYPE_LABELS,
  NOT_RENEWED_REASON_LABELS,
  VEHICLE_LOCATIONS,
  VEHICLE_STATUS_LABELS,
} from '../constants'
import { THAI_PROVINCES } from '../provinces'
import { cellText, isBlank } from './cells'
import {
  COVERAGE_COLUMNS,
  COVERAGE_SHEET,
  GUIDE_ROWS,
  GUIDE_SHEET,
  IMPORT_STATUS_LABELS,
  OPTIONAL_COVERAGE_COLUMNS,
  OPTIONAL_VEHICLE_COLUMNS,
  PROVINCE_SHEET,
  VEHICLE_COLUMNS,
  VEHICLE_COLUMN_ALIASES,
  VEHICLE_SHEET,
  type CoverageColumnKey,
  type RawRow,
  type VehicleColumnKey,
} from './columns'

/** จำนวนแถวที่ใส่ dropdown ไว้ให้ */
const TEMPLATE_ROWS = 1000

/** dropdown: รายการตัวเลือก หรือช่วงเซลล์ในชีตอื่น (รายการยาวเกิน 255 ตัวอักษรใส่ตรงๆ ไม่ได้) */
type DropdownSource = readonly string[] | { range: string }

function addDataSheet<K extends string>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Record<K, string>,
  lists: Partial<Record<K, DropdownSource>>,
  textKeys: readonly NoInfer<K>[] = [],
) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  const keys = Object.keys(columns) as K[]
  ws.addRow(keys.map((k) => columns[k]))
  ws.getRow(1).font = { bold: true }
  keys.forEach((key, i) => {
    ws.getColumn(i + 1).width = 18
    // คอลัมน์วันที่เป็นข้อความ — กัน Excel แปลง 31/03/2570 เป็นวันที่ปี 2570 / 31/03/70 เป็น 1970
    if (textKeys.includes(key)) {
      for (let row = 2; row <= TEMPLATE_ROWS; row++) ws.getCell(row, i + 1).numFmt = '@'
    }
    const list = lists[key]
    if (!list) return
    const formula = 'range' in list ? list.range : `"${list.join(',')}"`
    for (let row = 2; row <= TEMPLATE_ROWS; row++) {
      ws.getCell(row, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [formula] }
    }
  })
}

export async function buildRenewalTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  addDataSheet(
    wb,
    VEHICLE_SHEET,
    VEHICLE_COLUMNS,
    {
      status: Object.values(VEHICLE_STATUS_LABELS),
      plateProvince: { range: `'${PROVINCE_SHEET}'!$A$1:$A$${THAI_PROVINCES.length}` },
      currentLocation: VEHICLE_LOCATIONS,
    },
    ['statusDate', 'registrationDate'],
  )
  addDataSheet(wb, COVERAGE_SHEET, COVERAGE_COLUMNS, {
    type: Object.values(COVERAGE_TYPE_LABELS),
    coverageClass: COVERAGE_CLASSES,
    renewalStatus: Object.values(IMPORT_STATUS_LABELS),
    notRenewedReason: Object.values(NOT_RENEWED_REASON_LABELS),
  }, ['startDate', 'endDate'])
  const guide = wb.addWorksheet(GUIDE_SHEET)
  guide.columns = [{ width: 32 }, { width: 100 }]
  for (const row of GUIDE_ROWS) guide.addRow(row)
  guide.getRow(1).font = { bold: true }
  // veryHidden = ผู้ใช้ unhide จากเมนูไม่ได้ กันแก้รายชื่อโดยไม่ตั้งใจ
  const provinces = wb.addWorksheet(PROVINCE_SHEET, { state: 'veryHidden' })
  for (const province of THAI_PROVINCES) provinces.addRow([province])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** จับคู่หัวคอลัมน์โดยไม่สนช่องว่าง ("น้ำหนักตัวรถ(กก.)" = "น้ำหนักตัวรถ (กก.)") */
const headerKey = (label: string) => label.replace(/\s/g, '')

function readSheet<K extends string>(
  ws: ExcelJS.Worksheet,
  columns: Record<K, string>,
  { aliases = {}, optional = [] }: { aliases?: Partial<Record<K, readonly string[]>>; optional?: readonly K[] } = {},
): { rows: RawRow<K>[] } | { error: string } {
  const keys = Object.keys(columns) as K[]
  const keyByHeader = new Map<string, K>()
  for (const k of keys) for (const label of [columns[k], ...(aliases[k] ?? [])]) keyByHeader.set(headerKey(label), k)
  const colOf = new Map<K, number>()
  ws.getRow(1).eachCell((cell, col) => {
    const key = keyByHeader.get(headerKey(cellText(normalizeCellValue(cell.value))))
    if (key && !colOf.has(key)) colOf.set(key, col)
  })
  const missing = keys.filter((k) => !colOf.has(k) && !optional.includes(k)).map((k) => columns[k])
  if (missing.length > 0) return { error: `ชีต "${ws.name}" ไม่มีคอลัมน์: ${missing.join(', ')} — ดาวน์โหลด template ใหม่` }

  const rows: RawRow<K>[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const values: Partial<Record<K, unknown>> = {}
    for (const [key, col] of colOf) values[key] = normalizeCellValue(row.getCell(col).value)
    // แถวที่มีแค่ format / dropdown / สี ไม่นับ
    if (Object.values(values).every(isBlank)) return
    rows.push({ row: rowNumber, values })
  })
  return { rows }
}

export async function readRenewalWorkbook(
  buffer: ArrayBuffer,
): Promise<{ vehicles: RawRow<VehicleColumnKey>[]; coverages: RawRow<CoverageColumnKey>[] } | { error: string }> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch {
    return { error: 'อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .xlsx' }
  }
  const vehicleSheet = wb.getWorksheet(VEHICLE_SHEET)
  const coverageSheet = wb.getWorksheet(COVERAGE_SHEET)
  if (!vehicleSheet || !coverageSheet) {
    return { error: `ไฟล์ต้องมีชีต "${VEHICLE_SHEET}" และ "${COVERAGE_SHEET}" — ดาวน์โหลด template` }
  }
  const vehicles = readSheet(vehicleSheet, VEHICLE_COLUMNS, { aliases: VEHICLE_COLUMN_ALIASES, optional: OPTIONAL_VEHICLE_COLUMNS })
  if ('error' in vehicles) return vehicles
  const coverages = readSheet(coverageSheet, COVERAGE_COLUMNS, { optional: OPTIONAL_COVERAGE_COLUMNS })
  if ('error' in coverages) return coverages
  return { vehicles: vehicles.rows, coverages: coverages.rows }
}
