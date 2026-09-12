/**
 * ไล่เดือนในช่วง from..to — คืนเดือนล่าสุดก่อน (ตรงกับลำดับบล็อกใน Excel)
 * จำกัดไม่เกิน 24 เดือน กัน request ที่ใหญ่เกินไป
 */
export function monthsInRange(from: string, to: string, max = 24): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);

  const start = fy * 12 + (fm - 1);
  const end = ty * 12 + (tm - 1);
  if (end < start) return [];

  const months: string[] = [];
  for (let i = end; i >= start && months.length < max; i--) {
    const year = Math.floor(i / 12);
    const mon = (i % 12) + 1;
    months.push(`${year}-${String(mon).padStart(2, "0")}`);
  }
  return months;
}
