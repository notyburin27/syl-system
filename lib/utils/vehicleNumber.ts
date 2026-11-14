// เบอร์รถใช้แค่ตัวอังกฤษ/ตัวเลข (เช่น Y02, 127, SYL 50) — อักษรไทยที่หลุดเข้ามามักเกิดจาก
// ลืมสลับแป้นพิมพ์ เช่น นิคหิต "ํ" ที่มองแทบไม่เห็นใน "ํY02" ทำให้ค้นหา/เรียงเบอร์รถเพี้ยน
const THAI_CHAR = /[฀-๿]/

export const VEHICLE_NUMBER_THAI_ERROR =
  'เบอร์รถต้องไม่มีอักษรไทยปน (อาจลืมสลับแป้นพิมพ์)'

/** คืนข้อความ error ถ้าเบอร์รถไม่ถูกต้อง, null ถ้าผ่าน (ค่าว่างผ่านเพราะไม่บังคับกรอก) */
export function vehicleNumberError(value: string | null | undefined): string | null {
  if (!value) return null
  return THAI_CHAR.test(value) ? VEHICLE_NUMBER_THAI_ERROR : null
}
