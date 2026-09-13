/**
 * จำนวนเดือนในช่วง from..to แบบไม่ตัด (นับรวมทั้งสองปลาย)
 * ใช้เช็คช่วงเกินก่อนเรียก monthsInRange เพื่อไม่ให้ตัดเดือนทิ้งแบบเงียบๆ
 * คืนค่าติดลบถ้า to มาก่อน from
 */
export function monthSpan(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);

  const start = fy * 12 + (fm - 1);
  const end = ty * 12 + (tm - 1);
  return end - start + 1;
}

/**
 * ไล่เดือนในช่วง from..to — คืนเดือนล่าสุดก่อน (ตรงกับลำดับบล็อกใน Excel)
 * จำกัดไม่เกิน 24 เดือน กัน request ที่ใหญ่เกินไป (defensive backstop — route ควรเช็คด้วย monthSpan ก่อนเรียก)
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
