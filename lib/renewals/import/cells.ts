import { MAX_MONEY } from '../constants'
import { dateToYmd, isValidYmd } from '../dateOnly'

export type CellResult<T> = { value: T } | { error: string }

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : dateToYmd(value)
  return String(value).trim()
}

export function isBlank(value: unknown): boolean {
  return cellText(value) === ''
}

/** date cell ของ Excel หรือข้อความ วว/ดด/ปปปป (คั่น / หรือ -), ปี > 2400 = พ.ศ.; ปี 2 หลักไม่รับเพราะเดาศตวรรษผิดได้ */
export function parseImportDate(value: unknown): CellResult<string | null> {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { error: 'วันที่ไม่ถูกต้อง' } : { value: dateToYmd(value) }
  }
  const text = cellText(value)
  if (!text) return { value: null }
  if (isValidYmd(text)) return { value: text }
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text)
  if (!match) return { error: `วันที่ "${text}" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570` }
  const year = Number(match[3]) > 2400 ? Number(match[3]) - 543 : Number(match[3])
  const ymd = `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return isValidYmd(ymd) ? { value: ymd } : { error: `วันที่ "${text}" ไม่มีอยู่จริง` }
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

export function parseImportInt(value: unknown): CellResult<number | null> {
  const parsed = parseNumber(value)
  if ('error' in parsed || parsed.value === null) return parsed
  if (!Number.isInteger(parsed.value)) return { error: 'ต้องเป็นจำนวนเต็ม' }
  if (parsed.value < 0 || parsed.value > 100_000) return { error: 'ต้องอยู่ระหว่าง 0 ถึง 100,000' }
  return parsed
}

const squash = (s: string) => s.replace(/[.\s]/g, '')

/** หา key จาก label ภาษาไทย ไม่สนจุด/ช่องว่าง ("พรบ" = "พรบ.") — null = ช่องว่าง, undefined = ไม่ตรงตัวเลือกไหน */
export function lookupLabel<K extends string>(labels: Record<K, string>, value: unknown): K | null | undefined {
  const text = squash(cellText(value))
  if (!text) return null
  return (Object.keys(labels) as K[]).find((k) => squash(labels[k]) === text)
}
