/**
 * กฎบันทึกเลข JOB (Job.jobNumber) — ใช้ร่วมกันทั้งฟอร์ม (client), API (server) และสคริปต์แก้ข้อมูล
 *
 * กฎ: trim แล้วต้องไม่ว่าง, ห้ามมีอักษรไทยใดๆ (U+0E00–U+0E7F รวมสระ วรรณยุกต์ เลขไทย) และห้ามมี "."
 * นอกนั้นยอมรับหมด (เช่น 163339/544310, 163608/545167-1, A5, A47/B155040)
 * ไม่ normalize อย่างอื่นนอกจาก trim — บันทึกตามที่พิมพ์
 *
 * งาน "เบิกล่วงหน้า" (advance) และ "ไม่มีงาน" (noJob) ระบบออกเลขให้เอง (ADV-/NJB-)
 * จึงไม่ต้องผ่านการตรวจนี้
 *
 * ไฟล์นี้ต้อง pure (ไม่ import prisma/next) เพราะถูก import ฝั่ง client ด้วย
 */

/** อักขระต้องห้ามในเลข JOB: อักษรไทยทั้งบล็อก และจุด */
export const JOB_NUMBER_FORBIDDEN_REGEX = /[฀-๿.]/;

export const JOB_NUMBER_FORMAT_ERROR = "เลข JOB ห้ามมีภาษาไทยหรือจุด (.)";

export const JOB_NUMBER_REQUIRED_ERROR = "กรุณากรอก JOB/เลขที่";

/** ลักษณะงานที่ระบบออกเลขให้เอง — ไม่ตรวจกฎ */
export const AUTO_NUMBER_JOB_TYPES = ["advance", "noJob"] as const;

export function isAutoNumberJobType(jobType: string | null | undefined): boolean {
  return (AUTO_NUMBER_JOB_TYPES as readonly string[]).includes(jobType ?? "");
}

export type JobNumberValidation =
  | { ok: true; value: string }
  | { ok: false; value: string; error: string };

/** trim แล้วตรวจกฎบันทึก — value คือค่าหลัง trim (ใช้บันทึกลง DB) */
export function validateJobNumber(raw: unknown): JobNumberValidation {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, value, error: JOB_NUMBER_REQUIRED_ERROR };
  if (JOB_NUMBER_FORBIDDEN_REGEX.test(value)) {
    return { ok: false, value, error: JOB_NUMBER_FORMAT_ERROR };
  }
  return { ok: true, value };
}

export type JobNumberChange =
  | { ok: true; value: string; changed: boolean }
  | { ok: false; error: string };

/**
 * ตัดสินค่าที่จะบันทึกเมื่อแก้เลข JOB ของงานที่มีอยู่แล้ว (PATCH)
 *
 * - ค่าเดิมทุกตัวอักษร (หลัง trim) → ไม่ตรวจกฎ งานเก่าที่เลขผิดกฎยังแก้ช่องอื่นได้
 *   (client ส่ง jobNumber มาพร้อมช่องอื่นได้ใน batch เดียวกัน)
 * - advance/noJob → แค่ trim
 * - นอกนั้น → ต้องผ่าน validateJobNumber
 */
export function resolveJobNumberChange(params: {
  input: unknown;
  current: string;
  jobType: string | null | undefined;
}): JobNumberChange {
  const trimmed = String(params.input ?? "").trim();
  if (!trimmed) return { ok: false, error: JOB_NUMBER_REQUIRED_ERROR };
  if (trimmed === params.current) {
    return { ok: true, value: params.current, changed: false };
  }
  if (isAutoNumberJobType(params.jobType)) {
    return { ok: true, value: trimmed, changed: true };
  }
  const result = validateJobNumber(trimmed);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: result.value, changed: true };
}
