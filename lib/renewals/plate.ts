/**
 * ทำทะเบียนให้อยู่รูปเดียวกัน — ใช้ทุกจุดที่รับทะเบียน (ฟอร์ม, ค้นหา, import)
 * "64-5598 กท." / " 64-5598  กท " → "64-5598 กท"
 */
export function normalizePlate(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/\.+$/, '').trim()
}
