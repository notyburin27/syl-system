import dayjs, { type Dayjs } from 'dayjs'
import buddhistEra from 'dayjs/plugin/buddhistEra'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(buddhistEra)
dayjs.extend(customParseFormat)

const BE_OFFSET = 543
/** ปีที่พิมพ์มาตั้งแต่นี้ขึ้นไปถือเป็น พ.ศ. — ต่ำกว่านี้ถือเป็น ค.ศ. (พิมพ์ ค.ศ. มาก็ยังได้วันที่ถูก) */
const MIN_BE_YEAR = 2400

/** format ของ dayjs ที่แสดงปีเป็น พ.ศ. — YYYY → BBBB (ปีในตัว Dayjs ยังเป็น ค.ศ.) */
export function toBuddhistFormat(format: string): string {
  return format.replace(/YYYY/g, 'BBBB')
}

/**
 * อ่านวันที่ที่ผู้ใช้พิมพ์ (ปี พ.ศ. หรือ ค.ศ.) ตาม format ความกว้างคงที่ที่มี YYYY เช่น DD/MM/YYYY — ไม่ตรง format คืน null
 * แปลงปีในข้อความเป็น ค.ศ. ก่อน parse — ถ้า parse ด้วยปี พ.ศ. ตรงๆ 29/02/2567 จะไม่ผ่าน (2567 ไม่ใช่ปีอธิกสุรทิน แต่ 2024 ใช่)
 */
export function parseBuddhistInput(text: string, format: string): Dayjs | null {
  const at = format.indexOf('YYYY')
  if (at < 0 || text.length !== format.length) return null
  const year = Number(text.slice(at, at + 4))
  if (!Number.isInteger(year)) return null
  const ceYear = year >= MIN_BE_YEAR ? year - BE_OFFSET : year
  const parsed = dayjs(`${text.slice(0, at)}${String(ceYear).padStart(4, '0')}${text.slice(at + 4)}`, format, true)
  return parsed.isValid() ? parsed : null
}
