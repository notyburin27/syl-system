// วันที่แบบไม่มีเวลา ('YYYY-MM-DD') — คำนวณบน UTC ทั้งหมดเพื่อไม่ให้ timezone ของเครื่องทำวันเลื่อน
// (ตรงกับ Prisma @db.Date ที่คืน Date เวลา 00:00 UTC)

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function fromUtc(year: number, monthIndex: number, day: number): string {
  return dateToYmd(new Date(Date.UTC(year, monthIndex, day)))
}

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

export function isValidYmd(value: string): boolean {
  const match = YMD_RE.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

export function dateToYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(ymd: string, days: number): string {
  const { y, m, d } = parts(ymd)
  return fromUtc(y, m - 1, d + days)
}

export function endOfMonth(ymd: string): string {
  const { y, m } = parts(ymd)
  return fromUtc(y, m, 0)
}

/** +n ปี — ถ้าวันเดิมไม่มีในปีปลายทาง (29 ก.พ.) ใช้วันสุดท้ายของเดือน */
export function addYears(ymd: string, years: number): string {
  const { y, m, d } = parts(ymd)
  const lastDay = Number(endOfMonth(fromUtc(y + years, m - 1, 1)).slice(8))
  return fromUtc(y + years, m - 1, Math.min(d, lastDay))
}

export function todayInBangkok(now: Date = new Date()): string {
  // en-CA ให้รูปแบบ YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
