import { MAX_MONEY } from '../constants'
import { dateToYmd, isValidYmd } from '../dateOnly'
import { THAI_PROVINCES } from '../provinces'

export type CellResult<T> = { value: T } | { error: string }

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : dateToYmd(value)
  return String(value).trim()
}

export function isBlank(value: unknown): boolean {
  return cellText(value) === ''
}

/** ข้อความ trim แล้ว ความยาวไม่เกิน max (เหมือน optionalText ของ schema) — ว่าง = null */
export function parseImportText(value: unknown, max: number): CellResult<string | null> {
  const text = cellText(value)
  if (text.length > max) return { error: `ข้อความยาวเกิน ${max} ตัวอักษร` }
  return { value: text || null }
}

/** ปี > 2400 = พ.ศ. (−543) ใช้กับทุกรูปแบบ; ปีนอก 2000–2200 ไม่รับ (เช่น Excel แปลงปี 2 หลักเป็น 1970) */
function normalizeYmdYear(ymd: string, shown: string): CellResult<string> {
  const [y, m, d] = ymd.split('-')
  const year = Number(y) > 2400 ? Number(y) - 543 : Number(y)
  const result = `${String(year).padStart(4, '0')}-${m}-${d}`
  if (!isValidYmd(result)) return { error: `วันที่ "${shown}" ไม่มีอยู่จริง` }
  if (year < 2000 || year > 2200) {
    return {
      error: `วันที่ "${shown}" ปีไม่สมเหตุผล (${year}) — ถ้าพิมพ์ปี 2 หลัก Excel อาจแปลงให้ผิด ให้ใช้ วว/ดด/ปปปป เช่น 31/03/2570`,
    }
  }
  return { value: result }
}

/** date cell ของ Excel หรือข้อความ วว/ดด/ปปปป (คั่น / หรือ -) หรือ YYYY-MM-DD; ปี > 2400 = พ.ศ.; ปี 2 หลักไม่รับเพราะเดาศตวรรษผิดได้ */
export function parseImportDate(value: unknown): CellResult<string | null> {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { error: 'วันที่ไม่ถูกต้อง' }
    const ymd = dateToYmd(value)
    return normalizeYmdYear(ymd, ymd)
  }
  const text = cellText(value)
  if (!text) return { value: null }
  if (isValidYmd(text)) return normalizeYmdYear(text, text)
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text)
  if (!match) return { error: `วันที่ "${text}" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570` }
  return normalizeYmdYear(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`, text)
}

function parseNumber(value: unknown): CellResult<number | null> {
  const text = cellText(value)
  if (!text) return { value: null }
  const n = typeof value === 'number' ? value : Number(text.replace(/,/g, ''))
  if (!Number.isFinite(n)) return { error: `"${text}" ไม่ใช่ตัวเลข` }
  return { value: n }
}

export function parseImportMoney(value: unknown): CellResult<number | null> {
  const parsed = parseNumber(value)
  if ('error' in parsed || parsed.value === null) return parsed
  if (parsed.value < 0) return { error: 'จำนวนเงินต้องไม่ติดลบ' }
  if (parsed.value > MAX_MONEY) return { error: 'จำนวนเงินต้องไม่เกิน 99,999,999.99' }
  return { value: Math.round(parsed.value * 100) / 100 }
}

export function parseImportInt(value: unknown, max = 100_000): CellResult<number | null> {
  const parsed = parseNumber(value)
  if ('error' in parsed || parsed.value === null) return parsed
  if (!Number.isInteger(parsed.value)) return { error: 'ต้องเป็นจำนวนเต็ม' }
  if (parsed.value < 0 || parsed.value > max) return { error: `ต้องอยู่ระหว่าง 0 ถึง ${max.toLocaleString('en-US')}` }
  return parsed
}

type ThaiProvince = (typeof THAI_PROVINCES)[number]
const BANGKOK_ALIASES = new Set(['กรุงเทพ', 'กรุงเทพฯ', 'กทม', 'กทม.'])

/** ชื่อจังหวัดเต็มตาม THAI_PROVINCES — ไม่สนช่องว่าง, ตัด "จ." / "จังหวัด" นำหน้า, "ํา" (นิคหิต+สระอา) = "ำ", กรุงเทพฯ / กทม. = กรุงเทพมหานคร */
export function parseImportProvince(value: unknown): CellResult<ThaiProvince | null> {
  const text = cellText(value)
  if (!text) return { value: null }
  const name = text.replace(/\s/g, '').replace(/\u0E4D\u0E32/g, '\u0E33').replace(/^(จังหวัด|จ\.)/, '')
  if (BANGKOK_ALIASES.has(name)) return { value: 'กรุงเทพมหานคร' }
  const province = THAI_PROVINCES.find((p) => p === name)
  if (!province) return { error: `ไม่พบจังหวัด "${text}" — กรอกชื่อจังหวัดเต็ม เช่น กรุงเทพมหานคร, ชลบุรี` }
  return { value: province }
}

const squash = (s: string) => s.replace(/[.\s]/g, '')

/** หา key จาก label ภาษาไทย ไม่สนจุด/ช่องว่าง ("พรบ" = "พรบ.") — null = ช่องว่าง, undefined = ไม่ตรงตัวเลือกไหน */
export function lookupLabel<K extends string>(labels: Record<K, string>, value: unknown): K | null | undefined {
  const text = squash(cellText(value))
  if (!text) return null
  return (Object.keys(labels) as K[]).find((k) => squash(labels[k]) === text)
}
