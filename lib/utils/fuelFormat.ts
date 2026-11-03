/** รูปแบบลิตรสำหรับน้ำมันมาตรฐาน — ใช้ทั้งการ์ดสรุปและหน้าช่วงน้ำมัน */

export const fmtLiters = (v: number | null) =>
  v == null ? '-' : v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtSignedLiters = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : ''}${fmtLiters(v)}`)

/** เกิน = แดง, ประหยัด = เขียว */
export const diffColor = (v: number | null) => (v == null || v === 0 ? undefined : v > 0 ? '#cf1322' : '#389e0d')
