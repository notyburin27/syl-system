const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** '2026-07' → 'กรกฎาคม 69' (ชื่อเดือนไทย + ปี พ.ศ. 2 หลัก) */
export function toThaiMonthYear(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const buddhistYear = (year + 543) % 100;
  return `${THAI_MONTHS[mon - 1]} ${String(buddhistYear).padStart(2, "0")}`;
}

/**
 * วันจ่ายเงินเดือน = วันที่ 15 ของเดือนถัดจากเดือนที่สรุป
 * '2026-07' → '15/8/69' (จ่ายเงินเดือน ก.ค. ในวันที่ 15 ส.ค.)
 */
export function toPayDate(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const payMonth = mon === 12 ? 1 : mon + 1;
  const payYear = mon === 12 ? year + 1 : year;
  const buddhistYear = (payYear + 543) % 100;
  return `15/${payMonth}/${String(buddhistYear).padStart(2, "0")}`;
}

/** Date → '25/8/68' (D/M/YY พ.ศ.) — คืนสตริงว่างถ้าไม่มีค่า */
export function toThaiShortDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const buddhistYear = (d.getUTCFullYear() + 543) % 100;
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${String(buddhistYear).padStart(2, "0")}`;
}
