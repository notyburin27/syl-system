import { JOB_TYPES, SIZE_OPTIONS, getJobTypeLabel } from '../../types/job'

// header ของไฟล์ Excel (long format) — แถวละ 1 ช่วงราคา
export const FUEL_RATE_HEADERS = ['ลักษณะงาน', 'SIZE', 'ช่วงราคาน้ำมัน', 'ค่าขนส่ง'] as const

export interface FuelRateRange {
  fuelPriceMin: number // ตามไฟล์ (รวมปลายทั้งสองข้าง)
  fuelPriceMax: number // ตามไฟล์ (รวมปลายทั้งสองข้าง)
  income: number // ค่าขนส่งเต็มจำนวน
  surcharge: number // income - baseIncome (ค่าที่เก็บลง DB)
}

export interface ParsedFuelRate {
  jobType: string // value เช่น "inbound"
  size: string
  baseIncome: number // ค่าขนส่งของช่วงน้ำมันต่ำสุด
  ranges: FuelRateRange[] // เรียงตาม fuelPriceMin
}

export interface FuelRateError {
  row: number // เลขแถวในไฟล์ (1-based, header = แถว 1)
  message: string
}

export type ParseFuelRateResult =
  | { ok: true; rates: ParsedFuelRate[] }
  | { ok: false; errors: FuelRateError[] }

const round2 = (n: number) => Math.round(n * 100) / 100

// "30.00-34.99" → { min: 30, max: 34.99 } | null ถ้ารูปแบบผิดหรือ min >= max
export function parseFuelRange(text: unknown): { min: number; max: number } | null {
  const m = String(text ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const min = round2(Number(m[1]))
  const max = round2(Number(m[2]))
  if (min >= max) return null
  return { min, max }
}

// ขอบบนในไฟล์รวมปลาย (<= 34.99) แต่ logic คำนวณเดิมใช้ < fuelPriceMax
// จึงเก็บ DB เป็น max + 0.01 และแปลงกลับตอนแสดงผล (ราคาน้ำมันมีทศนิยม 2 ตำแหน่ง)
export const toStoredMax = (max: number) => round2(max + 0.01)
export const fromStoredMax = (storedMax: number) => round2(storedMax - 0.01)

function parseIncome(value: unknown): number | null {
  const n = Number(String(value ?? '').replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return null
  return round2(n)
}

function resolveJobType(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const match = JOB_TYPES.find((t) => t.label === text || t.value === text)
  return match?.value ?? null
}

// แปลงแถวดิบจาก Excel (รวม header แถวแรก) → ParsedFuelRate[] หรือ error รายแถว
export function parseFuelRateRows(rows: unknown[][]): ParseFuelRateResult {
  const errors: FuelRateError[] = []

  const header = rows[0]?.map((c) => String(c ?? '').trim())
  const headerOk =
    header && FUEL_RATE_HEADERS.every((expected, i) => header[i] === expected)
  if (!headerOk) {
    return {
      ok: false,
      errors: [{ row: 1, message: `header ต้องเป็น: ${FUEL_RATE_HEADERS.join(' | ')}` }],
    }
  }

  type RawEntry = { row: number; min: number; max: number; income: number }
  const groups = new Map<string, RawEntry[]>() // key = `${jobType}|${size}`

  let hasDataRow = false
  rows.slice(1).forEach((cells, i) => {
    const row = i + 2 // เลขแถวในไฟล์
    const isEmpty = cells.every((c) => String(c ?? '').trim() === '')
    if (isEmpty) return
    hasDataRow = true

    const jobType = resolveJobType(cells[0])
    if (!jobType) {
      errors.push({ row, message: `ลักษณะงาน "${String(cells[0] ?? '').trim()}" ไม่รู้จัก (ใช้: ${JOB_TYPES.map((t) => t.label).join(', ')})` })
      return
    }

    const size = String(cells[1] ?? '').trim()
    if (!(SIZE_OPTIONS as readonly string[]).includes(size)) {
      errors.push({ row, message: `SIZE "${size}" ไม่รู้จัก (ใช้: ${SIZE_OPTIONS.join(', ')})` })
      return
    }

    const range = parseFuelRange(cells[2])
    if (!range) {
      errors.push({ row, message: `ช่วงราคาน้ำมัน "${String(cells[2] ?? '').trim()}" ผิดรูปแบบ (ต้องเป็น เช่น 30.00-34.99 และค่าแรกน้อยกว่าค่าหลัง)` })
      return
    }

    const income = parseIncome(cells[3])
    if (income == null) {
      errors.push({ row, message: `ค่าขนส่ง "${String(cells[3] ?? '').trim()}" ต้องเป็นตัวเลขและไม่ติดลบ` })
      return
    }

    const key = `${jobType}|${size}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ row, min: range.min, max: range.max, income })
  })

  if (!hasDataRow && errors.length === 0) {
    errors.push({ row: 2, message: 'ไฟล์ไม่มีข้อมูล' })
  }

  // ตรวจช่วงทับซ้อน/ซ้ำภายในกลุ่มเดียวกัน (ช่วงรวมปลาย: ทับเมื่อ a.min <= b.max && b.min <= a.max)
  for (const entries of groups.values()) {
    const sorted = [...entries].sort((a, b) => a.min - b.min)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].min <= sorted[i - 1].max) {
        errors.push({
          row: sorted[i].row,
          message: `ช่วงราคาน้ำมันทับซ้อนกับแถว ${sorted[i - 1].row}`,
        })
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors.sort((a, b) => a.row - b.row) }
  }

  const rates: ParsedFuelRate[] = []
  for (const [key, entries] of groups.entries()) {
    const [jobType, size] = key.split('|')
    const sorted = [...entries].sort((a, b) => a.min - b.min)
    const baseIncome = sorted[0].income // ช่วงน้ำมันต่ำสุด = ราคาฐาน
    rates.push({
      jobType,
      size,
      baseIncome,
      ranges: sorted.map((e) => ({
        fuelPriceMin: e.min,
        fuelPriceMax: e.max,
        income: e.income,
        surcharge: round2(e.income - baseIncome),
      })),
    })
  }
  return { ok: true, rates }
}

// ---------- export / template / effective ----------

// รูปทรงข้อมูลจาก GET /api/rates/income (Prisma Decimal serialize เป็น string ได้)
export interface RateWithSurcharges {
  jobType: string
  size: string
  income: number | string
  fuelSurcharges: {
    fuelPriceMin: number | string
    fuelPriceMax: number | string // ค่าแบบ stored (+0.01)
    surcharge: number | string
  }[]
}

const rangeLabel = (min: number | string, storedMax: number | string) =>
  `${Number(min).toFixed(2)}-${fromStoredMax(Number(storedMax)).toFixed(2)}`

// แถวสำหรับ export เป็น .xlsx (รวม header) — เฉพาะ rate ที่มีช่วงราคาน้ำมัน
export function buildFuelRateSheetRows(rates: RateWithSurcharges[]): (string | number)[][] {
  const rows: (string | number)[][] = [[...FUEL_RATE_HEADERS]]
  for (const rate of rates) {
    const sorted = [...rate.fuelSurcharges].sort(
      (a, b) => Number(a.fuelPriceMin) - Number(b.fuelPriceMin)
    )
    for (const s of sorted) {
      rows.push([
        getJobTypeLabel(rate.jobType),
        rate.size,
        rangeLabel(s.fuelPriceMin, s.fuelPriceMax),
        round2(Number(rate.income) + Number(s.surcharge)),
      ])
    }
  }
  return rows
}

export const FUEL_RATE_TEMPLATE_ROWS: (string | number)[][] = [
  [...FUEL_RATE_HEADERS],
  ['ขาเข้า', '20DC', '30.00-34.99', 10000],
  ['ขาเข้า', '20DC', '35.00-39.99', 10500],
  ['ขาเข้า', '40DC', '30.00-34.99', 12000],
]

// ป้ายช่วงราคาสำหรับแสดงผล (ใช้ใน FuelRateViewModal)
export const displayRangeLabel = rangeLabel

// ราคา effective ตามราคาน้ำมัน (logic เดียวกับ /api/jobs/calculate/income: >= min, < storedMax)
export function effectiveIncome(
  rate: Pick<RateWithSurcharges, 'income' | 'fuelSurcharges'>,
  fuelPrice: number | null
): number {
  const base = Number(rate.income)
  if (fuelPrice == null || !rate.fuelSurcharges?.length) return base
  const matched = rate.fuelSurcharges.find(
    (s) => fuelPrice >= Number(s.fuelPriceMin) && fuelPrice < Number(s.fuelPriceMax)
  )
  return matched ? round2(base + Number(matched.surcharge)) : base
}

// ---------- ชื่อไฟล์ ----------

// ชื่อไฟล์พกลูกค้า+โรงงานมาเอง → ผู้ใช้ไม่ต้องเลือก dropdown ก่อนแนบไฟล์
export const FUEL_RATE_FILENAME_SEPARATOR = ' - '

export const buildFuelRateFilename = (customerName: string, factoryName: string) =>
  `${customerName}${FUEL_RATE_FILENAME_SEPARATOR}${factoryName}.xlsx`

interface NamedRecord {
  id: string
  name: string
}

// ยุบช่องว่างซ้ำ + ตัดหัวท้าย + lowercase เพื่อเทียบแบบทนการพิมพ์
const normalizeName = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()

const findByName = (items: NamedRecord[], text: string) => {
  const target = normalizeName(text)
  if (!target) return undefined
  return items.find((item) => normalizeName(item.name) === target)
}

/**
 * แยก "ลูกค้า - โรงงาน.xlsx" → id ของลูกค้าและโรงงาน, คืน null ถ้าจับคู่ไม่ได้
 *
 * ชื่อลูกค้า/โรงงานเองก็มี "-" ได้ (เช่น "K-APEX") จึงลองทุกตำแหน่งของ " - "
 * แล้วเลือกอันแรกที่ทั้งสองฝั่ง match ของจริงใน DB
 */
export function matchFuelRateFilename(
  filename: string,
  customers: NamedRecord[],
  factoryLocations: NamedRecord[]
): { customerId: string; factoryLocationId: string } | null {
  const base = String(filename ?? '')
    .replace(/\.(xlsx|xls)$/i, '')
    .replace(/\s*\(\d+\)$/, '') // suffix ที่ browser เติมตอนโหลดไฟล์ชื่อซ้ำ เช่น "(1)"

  // แยกด้วย separator ที่ยอมให้ช่องว่างรอบ "-" ไม่เท่ากัน
  const parts = base.split(/\s+-\s+/)
  if (parts.length < 2) return null

  for (let i = 1; i < parts.length; i++) {
    const customer = findByName(customers, parts.slice(0, i).join(FUEL_RATE_FILENAME_SEPARATOR))
    const factory = findByName(factoryLocations, parts.slice(i).join(FUEL_RATE_FILENAME_SEPARATOR))
    if (customer && factory) {
      return { customerId: customer.id, factoryLocationId: factory.id }
    }
  }
  return null
}
