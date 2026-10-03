/**
 * ตัวช่วยของ scripts/fix-job-numbers.ts — เสนอเลข JOB ที่ถูกต้องให้งานเก่าที่กรอกผิด
 * แยกออกมาเป็น pure function เพื่อ unit test ได้ (ไม่แตะ DB)
 *
 * กฎบันทึก (lib/utils/jobNumber.ts) แค่ห้ามไทย/จุด แต่สคริปต์นี้ยังจับเลขที่ไม่ใช่รูปแบบมาตรฐาน
 * 123456/123456(-1) เพื่อเสนอแก้ typo ด้วย — ยกเว้นเลขรูปแบบ A (A5, A47/B155040) ที่ถือว่าถูก
 *
 * ทั้ง booking (ส่วนหน้า) และเลขใบงาน (ส่วนหลัง) เป็นเลขวิ่งที่เพิ่มขึ้นตามวัน
 * จึงใช้งานที่ถูกรูปแบบในช่วงวันใกล้กัน (±WINDOW_DAYS) เป็นหลักฐานได้
 */

import { JOB_NUMBER_FORBIDDEN_REGEX } from "./jobNumber";

export const WINDOW_DAYS = 3;

/** รูปแบบมาตรฐาน booking/เลขใบงาน 6/6 หลัก + suffix ตู้ที่ 2+ */
export const STANDARD_JOB_NUMBER_REGEX = /^\d{6}\/\d{6}(-\d{1,2})?$/;
/** รูปแบบ A ที่ผู้ใช้ยืนยันว่าถูก เช่น A5, A33, A47/B155040 */
export const A_PREFIX_JOB_NUMBER_REGEX = /^A\d+(\/B\d+)?$/;
/** มาตรฐานที่ถูกต่อท้าย -X / -X2 ... (งานซ้ำที่สคริปต์นี้ mark ไว้) */
const DUPLICATE_MARKED_REGEX = /^\d{6}\/\d{6}(-\d{1,2})?-X\d*$/;

/** งานนี้ต้องให้สคริปต์เสนอแก้ไหม (ไม่รวม advance/noJob — ผู้เรียกกรองเอง) */
export function needsJobNumberFix(jobNumber: string): boolean {
  return !(
    STANDARD_JOB_NUMBER_REGEX.test(jobNumber) ||
    A_PREFIX_JOB_NUMBER_REGEX.test(jobNumber) ||
    DUPLICATE_MARKED_REGEX.test(jobNumber)
  );
}

export interface FixTargetJob {
  id: string;
  jobNumber: string;
  jobDate: Date;
  customerId: string | null;
}

/** งานที่เลขถูกรูปแบบมาตรฐานแล้ว ใช้เป็นหลักฐาน */
export type ReferenceJob = FixTargetJob;

export type Confidence = "high" | "low" | "";

export interface FixSuggestion {
  suggested: string;
  confidence: Confidence;
  evidence: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const withinDays = (a: Date, b: Date, days: number) =>
  Math.abs(a.getTime() - b.getTime()) <= days * DAY_MS;

// ---------------------------------------------------------------- cleanup (เฉพาะการเสนอค่า)

const INVISIBLE_CHARS = /[​-‍⁠﻿­]/g;
const THAI_COMBINING_MARKS = /[ัิ-ฺ็-๎]/g;
const THAI_DIGITS = /[๐-๙]/g;
const DASH_VARIANTS = /[‐-―−﹣]/g;
const DOT_BETWEEN_DIGITS = /(?<=\d)\.(?=\d)/g;
/** คำไทยที่ผู้ใช้กำหนดคำแปลไว้ */
const THAI_WORD_MAP: [string, string][] = [["ตู้อุบัติเหตุ", "ACCIDENT"]];

export interface CleanupResult {
  value: string;
  droppedDot: boolean;
  translated: string[];
}

/**
 * ล้างค่าเพื่อ "เสนอ" ให้คนตรวจ — ไม่ใช้ตอนบันทึก (ตอนบันทึกแค่ trim + ตรวจกฎ)
 * แปลคำไทยที่รู้จัก, ตัดสระ/วรรณยุกต์ไทยที่หลงมา, เลขไทย/ตัวเต็มความกว้าง → ASCII,
 * ตัดช่องว่าง/ตัวล่องหน, ตัดจุดที่แทรกกลางตัวเลข (บอกผ่าน droppedDot)
 */
export function cleanupJobNumber(raw: string): CleanupResult {
  let value = raw;
  const translated: string[] = [];
  for (const [th, en] of THAI_WORD_MAP) {
    if (value.includes(th)) {
      value = value.split(th).join(en);
      translated.push(`${th} → ${en}`);
    }
  }
  value = value
    .normalize("NFKC")
    .replace(THAI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(DASH_VARIANTS, "-")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, "")
    .replace(THAI_COMBINING_MARKS, "");
  const withoutDot = value.replace(DOT_BETWEEN_DIGITS, "");
  return { value: withoutDot, droppedDot: withoutDot !== value, translated };
}

// ---------------------------------------------------------------- helpers

/** a กับ b ต่างกันแค่ตัวอักษรเดียวที่ถูกแทรก/ตกหล่น (ความยาวต่างกัน 1) */
export function differsByOneInsertion(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) !== 1) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return true;
  }
  return false;
}

/**
 * ช่วงเลขวิ่งแบบตัด outlier (Tukey fences: Q1-1.5·IQR .. Q3+1.5·IQR)
 * งานที่เลขสลับหน้า-หลังแต่บังเอิญผ่านรูปแบบ จะไม่ทำให้ช่วงกว้างผิดปกติ
 */
export function robustRange(values: number[]): { min: number; max: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const fence = 1.5 * (q3 - q1);
  const kept = sorted.filter((v) => v >= q1 - fence && v <= q3 + fence);
  return { min: kept[0], max: kept[kept.length - 1] };
}

function parseParts(jobNumber: string) {
  const m = jobNumber.match(/^(\d+)\/(\d+)(-\d{1,2})?$/);
  return m ? { booking: m[1], second: m[2], suffix: m[3] ?? "" } : null;
}

const manual = (evidence: string): FixSuggestion => ({ suggested: "", confidence: "", evidence });

/**
 * เดาค่ามาตรฐาน 6/6 จากค่าที่ล้างแล้ว
 * - booking ขาด/เกิน 1 หลัก หาได้จากงานลูกค้าเดียวกันในช่วง ±3 วัน → high (ถ้าเจอตัวเดียว)
 * - เลขใบงานขาด/เกิน 1 หลัก หรือเลข 12 หลักไม่มี "/" → low (อาศัยช่วงเลขวิ่ง)
 * - เดาไม่ได้ → ว่าง
 */
function inferStandard(target: FixTargetJob, cleaned: string, references: ReferenceJob[]): FixSuggestion {
  const nearby = references.filter((r) => withinDays(r.jobDate, target.jobDate, WINDOW_DAYS));
  const nearbyParts = nearby.flatMap((r) => {
    const p = parseParts(r.jobNumber);
    return p ? [{ ref: r, parts: p }] : [];
  });
  const siblingParts = nearbyParts.filter(
    (x) => target.customerId && x.ref.customerId === target.customerId,
  );

  // แยกส่วน — รองรับเลข 12 หลักที่ลืมใส่ "/"
  let parts = parseParts(cleaned);
  let splitNote = "";
  if (!parts) {
    const m = cleaned.match(/^(\d{12})(-\d{1,2})?$/);
    if (m) {
      parts = { booking: m[1].slice(0, 6), second: m[1].slice(6), suffix: m[2] ?? "" };
      splitNote = "เติม / ระหว่างหลักที่ 6-7";
    }
  }
  if (!parts) {
    if (/^\d{6}$/.test(cleaned)) {
      const same = siblingParts.filter((x) => x.parts.booking === cleaned).map((x) => x.ref.jobNumber);
      return manual(
        same.length
          ? `มีแต่ booking — งานลูกค้าเดียวกันที่ใช้ booking นี้: ${same.slice(0, 5).join(", ")}`
          : "มีแต่ booking ไม่มีเลขใบงาน",
      );
    }
    return manual("รูปแบบเดาไม่ได้");
  }
  const p = parts;

  // ---- booking
  let bookingCandidates: string[] = [];
  let bookingNote = "";
  let bookingStrong = false;
  if (p.booking.length === 6) {
    bookingCandidates = [p.booking];
    const confirm = siblingParts.find((x) => x.parts.booking === p.booking);
    bookingStrong = !!confirm;
    if (confirm) bookingNote = `booking ตรงกับ ${confirm.ref.jobNumber} (${fmtDate(confirm.ref.jobDate)})`;
  } else if (p.booking.length === 5 || p.booking.length === 7) {
    const collect = (pool: typeof nearbyParts) => {
      const found = new Map<string, ReferenceJob>();
      for (const x of pool) {
        if (differsByOneInsertion(p.booking, x.parts.booking) && !found.has(x.parts.booking)) {
          found.set(x.parts.booking, x.ref);
        }
      }
      return found;
    };
    const fromSiblings = collect(siblingParts);
    const pool = fromSiblings.size > 0 ? fromSiblings : collect(nearbyParts);
    const who = fromSiblings.size > 0 ? "งานลูกค้าเดียวกัน" : "งานลูกค้าอื่น";
    bookingCandidates = [...pool.keys()];
    bookingStrong = fromSiblings.size === 1;
    bookingNote = [...pool.entries()]
      .map(([b, r]) => `booking ${p.booking}→${b} จาก${who} ${r.jobNumber} (${fmtDate(r.jobDate)})`)
      .join("; ");
  }
  if (bookingCandidates.length === 0) {
    return manual(`booking ${p.booking} (${p.booking.length} หลัก) หางานใกล้เคียงที่ต่างกัน 1 หลักไม่เจอ`);
  }
  if (bookingCandidates.length > 1) {
    return manual(`booking มีหลายตัวเลือก: ${bookingNote}`);
  }

  // ---- เลขใบงาน (ส่วนหลัง) — เลขวิ่ง ใช้ช่วงของงานใกล้เคียงกรอง
  let second = "";
  let secondNote = "";
  if (p.second.length === 6) {
    second = p.second + p.suffix;
  } else if (p.second.length === 5 || p.second.length === 7) {
    const range = robustRange(nearbyParts.map((x) => Number(x.parts.second)));
    if (!range) {
      return manual(`เลขใบงาน ${p.second} (${p.second.length} หลัก) ไม่มีงานใกล้เคียงให้เทียบช่วงเลข`);
    }
    const inRange = (s: string) => s.length === 6 && Number(s) >= range.min && Number(s) <= range.max;
    const cands = new Set<string>();
    if (p.second.length === 5) {
      for (let i = 0; i <= 5; i++) {
        for (let d = 0; d <= 9; d++) {
          const s = p.second.slice(0, i) + d + p.second.slice(i);
          if (inRange(s)) cands.add(s + p.suffix);
        }
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const s = p.second.slice(0, i) + p.second.slice(i + 1);
        if (inRange(s)) cands.add(s + p.suffix);
      }
      // ตู้ที่ 2 ที่ลืมขีด: 5451671 → 545167-1
      if (!p.suffix && inRange(p.second.slice(0, 6))) {
        cands.add(`${p.second.slice(0, 6)}-${p.second.slice(6)}`);
      }
    }
    const list = [...cands];
    const rangeNote = `ช่วงเลขใบงาน ±${WINDOW_DAYS} วัน = ${range.min}-${range.max}`;
    if (list.length === 0) return manual(`เลขใบงาน ${p.second} เดาไม่ได้ (${rangeNote})`);
    if (list.length > 1) {
      const more = list.length > 5 ? ` …(+${list.length - 5})` : "";
      return manual(`เลขใบงาน ${p.second} มี ${list.length} ตัวเลือก: ${list.slice(0, 5).join(", ")}${more} (${rangeNote})`);
    }
    second = list[0];
    secondNote = `เลขใบงาน ${p.second}→${second} (ตัวเลือกเดียวใน${rangeNote})`;
  } else {
    return manual(`เลขใบงาน ${p.second} (${p.second.length} หลัก) เดาไม่ได้`);
  }

  const suggested = `${bookingCandidates[0]}/${second}`;
  if (!STANDARD_JOB_NUMBER_REGEX.test(suggested)) return manual(`ได้ ${suggested} แต่ยังไม่ผ่านรูปแบบ`);

  // high: แก้แค่ booking จากงานลูกค้าเดียวกัน หรือแค่เติม "/" โดย booking ยืนยันกับงานลูกค้าเดียวกัน
  const confidence: Confidence = bookingStrong && p.second.length === 6 ? "high" : "low";
  const evidence =
    [splitNote, bookingNote, secondNote].filter(Boolean).join("; ") || "ไม่มีงานลูกค้าเดียวกันยืนยัน booking";
  return { suggested, confidence, evidence };
}

// ---------------------------------------------------------------- main

/**
 * เสนอค่าที่ถูกต้องให้งานหนึ่งใบ
 * 1) ผิดกฎบันทึก (มีไทย/จุด) → แจ้งใน evidence; ล้างค่า (ตัดสระไทย, แปลคำที่รู้จัก, ตัดจุด → low)
 * 2) ล้างแล้วเป็นมาตรฐานเลย → high (ยกเว้นตัดจุด = low), ไม่ใช่ → เดาจากงานใกล้เคียง
 * 3) ผิดกฎบันทึกแต่เดามาตรฐานไม่ได้ → เสนอค่าที่ล้างแล้วถ้าผ่านกฎ (low)
 * 4) ค่าที่เสนอชนกับเลขที่มีอยู่ (งานน่าจะซ้ำ) → ต่อท้าย -X, -X2, ... และบอกว่าชนกับงานไหน
 *
 * existingNumbers = jobNumber ทุกตัวใน DB (+ ค่าที่เสนอให้แถวก่อนหน้า) — ค่าที่เสนอห้ามชน
 */
export function suggestJobNumberFix(
  target: FixTargetJob,
  references: ReferenceJob[],
  existingNumbers: ReadonlySet<string>,
): FixSuggestion {
  const breaksSaveRule = JOB_NUMBER_FORBIDDEN_REGEX.test(target.jobNumber);
  const notes: string[] = [];
  if (breaksSaveRule) notes.push("ผิดกฎบันทึก (มีภาษาไทย/จุด)");

  const cleaned = cleanupJobNumber(target.jobNumber);
  if (cleaned.translated.length) notes.push(`แปล ${cleaned.translated.join(", ")}`);
  if (cleaned.droppedDot) notes.push("ตัดจุดกลางตัวเลข — ตรวจว่าตัวเลขถูก");

  let result: FixSuggestion;
  if (STANDARD_JOB_NUMBER_REGEX.test(cleaned.value)) {
    result = { suggested: cleaned.value, confidence: "high", evidence: "ตัดอักขระเกิน" };
  } else {
    result = inferStandard(target, cleaned.value, references);
  }

  // เดามาตรฐานไม่ได้ แต่ค่าเดิมผิดกฎบันทึก → เสนอค่าที่ล้างแล้วถ้าผ่านกฎ (อย่างน้อยบันทึกได้)
  if (
    !result.suggested &&
    breaksSaveRule &&
    cleaned.value &&
    !JOB_NUMBER_FORBIDDEN_REGEX.test(cleaned.value)
  ) {
    const confidence: Confidence = cleaned.translated.length && !cleaned.droppedDot ? "high" : "low";
    result = {
      suggested: cleaned.value,
      confidence,
      evidence: `ไม่ใช่รูปแบบ 6/6 (${result.evidence}) — เสนอค่าที่ล้างแล้วให้ผ่านกฎบันทึก`,
    };
  }

  if (result.suggested && cleaned.droppedDot) result.confidence = "low";

  // ชนกับเลขที่มีอยู่ → -X, -X2, ...
  if (result.suggested && result.suggested !== target.jobNumber && existingNumbers.has(result.suggested)) {
    const base = result.suggested;
    const other = references.find((r) => r.jobNumber === base);
    const who = other ? `งาน ${base} (${fmtDate(other.jobDate)}, id ${other.id})` : `${base} (เลขที่มีอยู่แล้ว/เสนอให้แถวอื่น)`;
    let n = 1;
    let candidate = `${base}-X`;
    while (existingNumbers.has(candidate)) candidate = `${base}-X${++n}`;
    result = {
      ...result,
      suggested: candidate,
      evidence: `${result.evidence}; ชนกับ${who} — น่าจะเป็นงานซ้ำ ใส่ ${candidate.slice(base.length)}`,
    };
  }

  return { ...result, evidence: [...notes, result.evidence].filter(Boolean).join("; ") };
}

// ---------------------------------------------------------------- CSV

/** ค่าเดียวใน CSV — ครอบ "" เมื่อมี , " หรือขึ้นบรรทัดใหม่ */
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** RFC 4180 แบบพอใช้: รองรับ "..." , "" ข้างใน, CRLF/LF และ BOM จาก Excel */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
