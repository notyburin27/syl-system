# Fuel Rate Excel Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ระบบจัดการ income ตามราคาน้ำมันแบบ Upload Excel แทน modal กรอกทีละช่วง — ตาม spec `docs/superpowers/specs/2026-06-11-fuel-rate-excel-upload-design.md`

**Architecture:** ไม่แตะ Prisma schema — `RateIncomeFuelSurcharge` ยังเก็บส่วนต่างจากราคาฐาน ผู้ใช้เห็นราคาเต็มเสมอ (แปลงไป-กลับใน pure functions ที่ `lib/utils/fuelRateExcel.ts`) ราคาฐาน = ค่าขนส่งของช่วงน้ำมันต่ำสุดในไฟล์ API คำนวณ income ตอนสร้างงาน (`/api/jobs/calculate/income`) ไม่แก้เลย

**Tech Stack:** Next.js 15 App Router, antd v5, Prisma, lib `xlsx` (มีอยู่แล้ว), unit test ด้วย `node:test` รันผ่าน `tsx` (มีอยู่แล้ว — โปรเจกต์ไม่มี jest/vitest), **ไม่มี E2E** (ผู้ใช้ manual test)

**ข้อควรรู้สำหรับผู้ทำ:**
- โปรเจกต์นี้บังคับ (CLAUDE.md): รัน `mcp__gitnexus__impact` ก่อนแก้ symbol เดิม และ `mcp__gitnexus__detect_changes` ก่อน commit ทุกครั้ง (repo: `syl-system`)
- Blast radius ตรวจล่วงหน้าแล้ว: `GET /api/rates/income` มีผู้เรียกรายเดียวคือ `RateIncomeManager.tsx`, endpoint surcharge เดิมมีผู้เรียกรายเดียวคือ `RateIncomeFuelSurchargeManager.tsx` (จะถูกลบ)
- ตอบ user / error message เป็นภาษาไทย
- ห้าม commit ไฟล์ `scripts/check-line-images.ts` (มี modification ค้างอยู่ก่อนเริ่มงานนี้ ไม่เกี่ยวกับงานนี้)

---

## File Structure

| ไฟล์ | บทบาท |
|------|--------|
| Create: `lib/utils/fuelRateExcel.ts` | pure functions: parse แถวจาก Excel, validate, คำนวณราคาฐาน/surcharge, แปลง max+0.01 ไป-กลับ, สร้างแถวสำหรับ export/template, คำนวณราคา effective |
| Create: `lib/utils/__tests__/fuelRateExcel.test.ts` | unit tests (node:test) |
| Create: `app/api/rates/income/fuel-table/import/route.ts` | POST import ไฟล์ .xlsx ต่อ ลูกค้า+โรงงาน (transaction, all-or-nothing) |
| Modify: `app/api/rates/income/route.ts` | GET เพิ่ม `fuelSurcharges` + ราคาน้ำมันปัจจุบัน (เปลี่ยน response shape เป็น `{ rates, fuelPrice }`) |
| Create: `components/jobs/FuelRateViewModal.tsx` | modal ดูช่วงราคา read-only + highlight ช่วงปัจจุบัน |
| Create: `components/jobs/FuelRateUploadModal.tsx` | modal upload: เลือกลูกค้า+โรงงาน → download ข้อมูลเดิม/template → แนบไฟล์ → preview → บันทึก |
| Modify: `components/jobs/RateIncomeManager.tsx` | แบนเนอร์ราคาน้ำมัน, คอลัมน์ค่าขนส่งแบบ effective, ปุ่ม Upload/Export Excel, ตัด Import/Export CSV + ปุ่มฟันเฟือง |
| Delete: `components/jobs/RateIncomeFuelSurchargeManager.tsx` | modal จัดการช่วงราคาเดิม |
| Delete: `app/api/rates/income/surcharge/route.ts`, `app/api/rates/income/surcharge/[id]/route.ts` | endpoint CRUD ช่วงราคาเดิม |
| Delete: `app/api/rates/income/import/route.ts` | endpoint Import CSV เดิม |

หมายเหตุ: `components/jobs/ImportCSVModal.tsx` **ห้ามลบ** — CustomerManager, DriverManager, LocationManager, RateDriverWageManager, RateTransferManager ยังใช้อยู่ แค่เอา usage ออกจาก RateIncomeManager

---

### Task 1: Parser — `parseFuelRange` + `parseFuelRateRows` (TDD)

**Files:**
- Create: `lib/utils/fuelRateExcel.ts`
- Create: `lib/utils/__tests__/fuelRateExcel.test.ts`

- [ ] **Step 1: เขียน failing tests**

สร้าง `lib/utils/__tests__/fuelRateExcel.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseFuelRange,
  parseFuelRateRows,
  toStoredMax,
  fromStoredMax,
  FUEL_RATE_HEADERS,
} from '../fuelRateExcel'

const HEADER = [...FUEL_RATE_HEADERS]

test('parseFuelRange: รูปแบบถูกต้อง', () => {
  assert.deepEqual(parseFuelRange('30.00-34.99'), { min: 30, max: 34.99 })
  assert.deepEqual(parseFuelRange(' 35.00 - 39.99 '), { min: 35, max: 39.99 })
  assert.deepEqual(parseFuelRange('40-44.99'), { min: 40, max: 44.99 })
})

test('parseFuelRange: รูปแบบผิด → null', () => {
  assert.equal(parseFuelRange('abc'), null)
  assert.equal(parseFuelRange('30.00'), null)
  assert.equal(parseFuelRange('39.99-35.00'), null) // min >= max
  assert.equal(parseFuelRange('30.00-30.00'), null)
  assert.equal(parseFuelRange(''), null)
})

test('toStoredMax/fromStoredMax: แปลงไป-กลับได้ค่าเดิม ไม่มีปัญหา floating point', () => {
  assert.equal(toStoredMax(34.99), 35)
  assert.equal(fromStoredMax(35), 34.99)
  assert.equal(fromStoredMax(toStoredMax(39.99)), 39.99)
  assert.equal(fromStoredMax(toStoredMax(44.5)), 44.5)
})

test('parseFuelRateRows: happy path — ราคาฐาน = ช่วงต่ำสุด, surcharge ถูกต้อง, เรียงช่วง', () => {
  const result = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '35.00-39.99', 10500],
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาเข้า', '40DC', '30.00-34.99', '12,000'], // ตัวเลขแบบ string มี comma ต้องรับได้
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rates.length, 2)

  const r20 = result.rates.find((r) => r.size === '20DC')!
  assert.equal(r20.jobType, 'inbound') // label ไทย → value
  assert.equal(r20.baseIncome, 10000)
  assert.deepEqual(
    r20.ranges.map((x) => [x.fuelPriceMin, x.fuelPriceMax, x.income, x.surcharge]),
    [
      [30, 34.99, 10000, 0],
      [35, 39.99, 10500, 500],
    ]
  )

  const r40 = result.rates.find((r) => r.size === '40DC')!
  assert.equal(r40.baseIncome, 12000)
})

test('parseFuelRateRows: รับ jobType เป็น value ภาษาอังกฤษได้ และข้ามแถวว่าง', () => {
  const result = parseFuelRateRows([
    HEADER,
    ['inbound', '20DC', '30.00-34.99', 10000],
    ['', '', '', ''],
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rates.length, 1)
  assert.equal(result.rates[0].jobType, 'inbound')
})

test('parseFuelRateRows: header ผิด → error', () => {
  const result = parseFuelRateRows([['ผิด', 'SIZE', 'ช่วงราคาน้ำมัน', 'ค่าขนส่ง']])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.errors[0].row, 1)
})

test('parseFuelRateRows: ไฟล์ว่าง → error', () => {
  const result = parseFuelRateRows([])
  assert.equal(result.ok, false)
})

test('parseFuelRateRows: error รายแถว — jobType/SIZE ไม่รู้จัก, ช่วงผิด, ค่าขนส่งผิด', () => {
  const result = parseFuelRateRows([
    HEADER,
    ['ไม่มีจริง', '20DC', '30.00-34.99', 10000], // row 2: jobType ไม่รู้จัก
    ['ขาเข้า', '99XX', '30.00-34.99', 10000], // row 3: SIZE ไม่รู้จัก
    ['ขาเข้า', '20DC', 'abc', 10000], // row 4: ช่วงผิด
    ['ขาเข้า', '40DC', '30.00-34.99', -5], // row 5: ค่าขนส่งติดลบ
    ['ขาเข้า', '40RF', '30.00-34.99', 'xyz'], // row 6: ค่าขนส่งไม่ใช่ตัวเลข
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.deepEqual(result.errors.map((e) => e.row), [2, 3, 4, 5, 6])
})

test('parseFuelRateRows: ช่วงทับซ้อน/ซ้ำใน ลักษณะงาน/SIZE เดียวกัน → error (คนละกลุ่มไม่ error)', () => {
  const overlap = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '30.00-35.00', 10000],
    ['ขาเข้า', '20DC', '35.00-39.99', 10500], // ทับที่ 35.00 (รวมปลาย)
  ])
  assert.equal(overlap.ok, false)

  const duplicate = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาเข้า', '20DC', '30.00-34.99', 10500],
  ])
  assert.equal(duplicate.ok, false)

  const differentGroup = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาออก', '20DC', '30.00-34.99', 11000],
  ])
  assert.equal(differentGroup.ok, true)
})

test('parseFuelRateRows: ช่วงมี gap ได้ ไม่ error', () => {
  const result = parseFuelRateRows([
    HEADER,
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาเข้า', '20DC', '40.00-44.99', 11000], // เว้น 35-39.99
  ])
  assert.equal(result.ok, true)
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/utils/__tests__/fuelRateExcel.test.ts`
Expected: FAIL — `Cannot find module '../fuelRateExcel'`

- [ ] **Step 3: เขียน implementation**

สร้าง `lib/utils/fuelRateExcel.ts` (ใช้ relative import เพื่อให้ tsx รัน test ได้โดยไม่พึ่ง path alias):

```ts
import { JOB_TYPES, SIZE_OPTIONS, getJobTypeLabel } from '../../types/job'

// header ของไฟล์ Excel (long format) — แถวละ 1 ช่วงราคา
export const FUEL_RATE_HEADERS = ['ลักษณะงาน', 'SIZE', 'ช่วงราคาน้ำมัน', 'ค่าขนส่ง'] as const

export interface FuelRateRange {
  fuelPriceMin: number // ตามไฟล์ (รวมปลายทั้งสองข้าง)
  fuelPriceMax: number // ตามไฟล์ (รวมปลายทั้งสองข้าง)
  income: number // ค่าขนส่งเต็มจำนวน
  surcharge: number // income - baseIncome (ค่าที่เก็บลง DB)
}

export interface ParsedFuelRate {
  jobType: string // value เช่น "inbound"
  size: string
  baseIncome: number // ค่าขนส่งของช่วงน้ำมันต่ำสุด
  ranges: FuelRateRange[] // เรียงตาม fuelPriceMin
}

export interface FuelRateError {
  row: number // เลขแถวในไฟล์ (1-based, header = แถว 1)
  message: string
}

export type ParseFuelRateResult =
  | { ok: true; rates: ParsedFuelRate[] }
  | { ok: false; errors: FuelRateError[] }

const round2 = (n: number) => Math.round(n * 100) / 100

// "30.00-34.99" → { min: 30, max: 34.99 } | null ถ้ารูปแบบผิดหรือ min >= max
export function parseFuelRange(text: unknown): { min: number; max: number } | null {
  const m = String(text ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const min = round2(Number(m[1]))
  const max = round2(Number(m[2]))
  if (min >= max) return null
  return { min, max }
}

// ขอบบนในไฟล์รวมปลาย (<= 34.99) แต่ logic คำนวณเดิมใช้ < fuelPriceMax
// จึงเก็บ DB เป็น max + 0.01 และแปลงกลับตอนแสดงผล (ราคาน้ำมันมีทศนิยม 2 ตำแหน่ง)
export const toStoredMax = (max: number) => round2(max + 0.01)
export const fromStoredMax = (storedMax: number) => round2(storedMax - 0.01)

function parseIncome(value: unknown): number | null {
  const n = Number(String(value ?? '').replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return null
  return round2(n)
}

function resolveJobType(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const match = JOB_TYPES.find((t) => t.label === text || t.value === text)
  return match?.value ?? null
}

// แปลงแถวดิบจาก Excel (รวม header แถวแรก) → ParsedFuelRate[] หรือ error รายแถว
export function parseFuelRateRows(rows: unknown[][]): ParseFuelRateResult {
  const errors: FuelRateError[] = []

  const header = rows[0]?.map((c) => String(c ?? '').trim())
  const headerOk =
    header && FUEL_RATE_HEADERS.every((expected, i) => header[i] === expected)
  if (!headerOk) {
    return {
      ok: false,
      errors: [{ row: 1, message: `header ต้องเป็น: ${FUEL_RATE_HEADERS.join(' | ')}` }],
    }
  }

  type RawEntry = { row: number; min: number; max: number; income: number }
  const groups = new Map<string, RawEntry[]>() // key = `${jobType}|${size}`

  let hasDataRow = false
  rows.slice(1).forEach((cells, i) => {
    const row = i + 2 // เลขแถวในไฟล์
    const isEmpty = cells.every((c) => String(c ?? '').trim() === '')
    if (isEmpty) return
    hasDataRow = true

    const jobType = resolveJobType(cells[0])
    if (!jobType) {
      errors.push({ row, message: `ลักษณะงาน "${String(cells[0] ?? '').trim()}" ไม่รู้จัก (ใช้: ${JOB_TYPES.map((t) => t.label).join(', ')})` })
      return
    }

    const size = String(cells[1] ?? '').trim()
    if (!(SIZE_OPTIONS as readonly string[]).includes(size)) {
      errors.push({ row, message: `SIZE "${size}" ไม่รู้จัก (ใช้: ${SIZE_OPTIONS.join(', ')})` })
      return
    }

    const range = parseFuelRange(cells[2])
    if (!range) {
      errors.push({ row, message: `ช่วงราคาน้ำมัน "${String(cells[2] ?? '').trim()}" ผิดรูปแบบ (ต้องเป็น เช่น 30.00-34.99 และค่าแรกน้อยกว่าค่าหลัง)` })
      return
    }

    const income = parseIncome(cells[3])
    if (income == null) {
      errors.push({ row, message: `ค่าขนส่ง "${String(cells[3] ?? '').trim()}" ต้องเป็นตัวเลขและไม่ติดลบ` })
      return
    }

    const key = `${jobType}|${size}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ row, min: range.min, max: range.max, income })
  })

  if (!hasDataRow && errors.length === 0) {
    errors.push({ row: 2, message: 'ไฟล์ไม่มีข้อมูล' })
  }

  // ตรวจช่วงทับซ้อน/ซ้ำภายในกลุ่มเดียวกัน (ช่วงรวมปลาย: ทับเมื่อ a.min <= b.max && b.min <= a.max)
  for (const entries of groups.values()) {
    const sorted = [...entries].sort((a, b) => a.min - b.min)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].min <= sorted[i - 1].max) {
        errors.push({
          row: sorted[i].row,
          message: `ช่วงราคาน้ำมันทับซ้อนกับแถว ${sorted[i - 1].row}`,
        })
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors.sort((a, b) => a.row - b.row) }
  }

  const rates: ParsedFuelRate[] = []
  for (const [key, entries] of groups.entries()) {
    const [jobType, size] = key.split('|')
    const sorted = [...entries].sort((a, b) => a.min - b.min)
    const baseIncome = sorted[0].income // ช่วงน้ำมันต่ำสุด = ราคาฐาน
    rates.push({
      jobType,
      size,
      baseIncome,
      ranges: sorted.map((e) => ({
        fuelPriceMin: e.min,
        fuelPriceMax: e.max,
        income: e.income,
        surcharge: round2(e.income - baseIncome),
      })),
    })
  }
  return { ok: true, rates }
}
```

(ฟังก์ชัน `getJobTypeLabel` import ไว้ใช้ใน Task 2 — ถ้า lint เตือน unused ใน task นี้ ให้คงไว้ได้เลยเพราะ Task 2 ใช้ทันที)

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx tsx --test lib/utils/__tests__/fuelRateExcel.test.ts`
Expected: PASS ทั้งหมด (ถ้า `tsx --test` ใช้ไม่ได้ ให้ใช้ `node --import tsx --test lib/utils/__tests__/fuelRateExcel.test.ts` แทน และจดรูปแบบที่ใช้ได้ไว้ใช้ใน task ถัดไป)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/fuelRateExcel.ts lib/utils/__tests__/fuelRateExcel.test.ts
git commit -m "feat: fuel rate excel parser with validation"
```

---

### Task 2: Builder — export/template/effective income (TDD)

**Files:**
- Modify: `lib/utils/fuelRateExcel.ts` (ต่อท้ายไฟล์)
- Modify: `lib/utils/__tests__/fuelRateExcel.test.ts` (ต่อท้ายไฟล์)

- [ ] **Step 1: เขียน failing tests (ต่อท้ายไฟล์ test เดิม)**

```ts
import {
  buildFuelRateSheetRows,
  FUEL_RATE_TEMPLATE_ROWS,
  effectiveIncome,
} from '../fuelRateExcel'

test('buildFuelRateSheetRows: สร้างแถว long format จากข้อมูล DB (แปลง storedMax กลับ)', () => {
  const rows = buildFuelRateSheetRows([
    {
      jobType: 'inbound',
      size: '20DC',
      income: 10000,
      fuelSurcharges: [
        { fuelPriceMin: 35, fuelPriceMax: 40, surcharge: 500 }, // stored: 40 = 39.99 รวมปลาย
        { fuelPriceMin: 30, fuelPriceMax: 35, surcharge: 0 },
      ],
    },
  ])
  assert.deepEqual(rows, [
    ['ลักษณะงาน', 'SIZE', 'ช่วงราคาน้ำมัน', 'ค่าขนส่ง'],
    ['ขาเข้า', '20DC', '30.00-34.99', 10000],
    ['ขาเข้า', '20DC', '35.00-39.99', 10500],
  ])
})

test('round-trip: export → parse ได้ข้อมูลเดิม', () => {
  const rows = buildFuelRateSheetRows([
    {
      jobType: 'outbound',
      size: '40DC',
      income: 12000,
      fuelSurcharges: [
        { fuelPriceMin: 30, fuelPriceMax: 35, surcharge: 0 },
        { fuelPriceMin: 35, fuelPriceMax: 40, surcharge: 600 },
      ],
    },
  ])
  const parsed = parseFuelRateRows(rows)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.rates[0].baseIncome, 12000)
  assert.deepEqual(
    parsed.rates[0].ranges.map((r) => r.surcharge),
    [0, 600]
  )
})

test('FUEL_RATE_TEMPLATE_ROWS: parse ผ่าน', () => {
  assert.equal(parseFuelRateRows(FUEL_RATE_TEMPLATE_ROWS.map((r) => [...r])).ok, true)
})

test('effectiveIncome: เลือกช่วงตรงราคา, นอกช่วง/ไม่มีราคา/ไม่มีช่วง → ราคาฐาน', () => {
  const rate = {
    income: '10000', // Prisma Decimal มาเป็น string ได้
    fuelSurcharges: [
      { fuelPriceMin: '30', fuelPriceMax: '35', surcharge: '0' },
      { fuelPriceMin: '35', fuelPriceMax: '40', surcharge: '500' },
    ],
  }
  assert.equal(effectiveIncome(rate, 36.5), 10500)
  assert.equal(effectiveIncome(rate, 39.99), 10500) // ขอบบนรวมปลาย (< 40)
  assert.equal(effectiveIncome(rate, 50), 10000) // นอกช่วง → ฐาน
  assert.equal(effectiveIncome(rate, null), 10000) // ไม่มีบันทึกราคาน้ำมัน
  assert.equal(effectiveIncome({ income: 8000, fuelSurcharges: [] }, 36.5), 8000)
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/utils/__tests__/fuelRateExcel.test.ts`
Expected: FAIL — `buildFuelRateSheetRows` is not exported

- [ ] **Step 3: เขียน implementation (ต่อท้าย `lib/utils/fuelRateExcel.ts`)**

```ts
// ---------- export / template / effective ----------

// รูปทรงข้อมูลจาก GET /api/rates/income (Prisma Decimal serialize เป็น string ได้)
export interface RateWithSurcharges {
  jobType: string
  size: string
  income: number | string
  fuelSurcharges: {
    fuelPriceMin: number | string
    fuelPriceMax: number | string // ค่าแบบ stored (+0.01)
    surcharge: number | string
  }[]
}

const rangeLabel = (min: number | string, storedMax: number | string) =>
  `${Number(min).toFixed(2)}-${fromStoredMax(Number(storedMax)).toFixed(2)}`

// แถวสำหรับ export เป็น .xlsx (รวม header) — เฉพาะ rate ที่มีช่วงราคาน้ำมัน
export function buildFuelRateSheetRows(rates: RateWithSurcharges[]): (string | number)[][] {
  const rows: (string | number)[][] = [[...FUEL_RATE_HEADERS]]
  for (const rate of rates) {
    const sorted = [...rate.fuelSurcharges].sort(
      (a, b) => Number(a.fuelPriceMin) - Number(b.fuelPriceMin)
    )
    for (const s of sorted) {
      rows.push([
        getJobTypeLabel(rate.jobType),
        rate.size,
        rangeLabel(s.fuelPriceMin, s.fuelPriceMax),
        round2(Number(rate.income) + Number(s.surcharge)),
      ])
    }
  }
  return rows
}

export const FUEL_RATE_TEMPLATE_ROWS: (string | number)[][] = [
  [...FUEL_RATE_HEADERS],
  ['ขาเข้า', '20DC', '30.00-34.99', 10000],
  ['ขาเข้า', '20DC', '35.00-39.99', 10500],
  ['ขาเข้า', '40DC', '30.00-34.99', 12000],
]

// ป้ายช่วงราคาสำหรับแสดงผล (ใช้ใน FuelRateViewModal)
export const displayRangeLabel = rangeLabel

// ราคา effective ตามราคาน้ำมัน (logic เดียวกับ /api/jobs/calculate/income: >= min, < storedMax)
export function effectiveIncome(
  rate: Pick<RateWithSurcharges, 'income' | 'fuelSurcharges'>,
  fuelPrice: number | null
): number {
  const base = Number(rate.income)
  if (fuelPrice == null || !rate.fuelSurcharges?.length) return base
  const matched = rate.fuelSurcharges.find(
    (s) => fuelPrice >= Number(s.fuelPriceMin) && fuelPrice < Number(s.fuelPriceMax)
  )
  return matched ? round2(base + Number(matched.surcharge)) : base
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx tsx --test lib/utils/__tests__/fuelRateExcel.test.ts`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add lib/utils/fuelRateExcel.ts lib/utils/__tests__/fuelRateExcel.test.ts
git commit -m "feat: fuel rate excel export builder and effective income helper"
```

---

### Task 3: ปรับ `GET /api/rates/income` + fix consumer ใน RateIncomeManager

> เปลี่ยน response shape จาก `RateIncome[]` เป็น `{ rates, fuelPrice }` — ต้องแก้ API กับ `fetchRates` ใน RateIncomeManager **ใน commit เดียวกัน** ไม่งั้นหน้าพัง (consumer มีรายเดียว ตรวจแล้ว)

**Files:**
- Modify: `app/api/rates/income/route.ts:5-17` (ฟังก์ชัน GET)
- Modify: `components/jobs/RateIncomeManager.tsx` (interface, fetchRates, state)

- [ ] **Step 1: รัน impact analysis ตามกติกาโปรเจกต์**

รัน `mcp__gitnexus__impact` target `GET /api/rates/income` (หรือ symbol ของ route) direction upstream, repo `syl-system` — คาดว่า caller มีแค่ `RateIncomeManager.fetchRates` ถ้าพบมากกว่านั้นให้หยุดและรายงาน user

- [ ] **Step 2: แก้ GET ใน `app/api/rates/income/route.ts`**

แทนที่ฟังก์ชัน `GET` เดิมทั้งฟังก์ชัน:

```ts
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [rates, fuelLog] = await Promise.all([
    prisma.rateIncome.findMany({
      include: {
        factoryLocation: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        fuelSurcharges: { orderBy: { fuelPriceMin: "asc" } },
      },
      orderBy: [{ customer: { name: "asc" } }, { factoryLocation: { name: "asc" } }, { jobType: "asc" }, { size: "asc" }],
    }),
    prisma.fuelPriceLog.findFirst({
      where: { effectiveDate: { lte: new Date() } },
      orderBy: { effectiveDate: "desc" },
    }),
  ]);

  return NextResponse.json({
    rates,
    fuelPrice: fuelLog
      ? { pricePerLiter: Number(fuelLog.pricePerLiter), effectiveDate: fuelLog.effectiveDate }
      : null,
  });
}
```

- [ ] **Step 3: แก้ consumer ใน `components/jobs/RateIncomeManager.tsx`**

3.1 เพิ่ม field ใน interface `RateIncome` (บรรทัด ~13-23):

```ts
interface FuelSurcharge {
  id: string
  fuelPriceMin: number | string
  fuelPriceMax: number | string
  surcharge: number | string
}

interface RateIncome {
  id: string
  jobType: string
  size: string
  factoryLocationId: string
  customerId: string
  income: number
  createdAt: string
  factoryLocation: { id: string; name: string }
  customer: { id: string; name: string }
  fuelSurcharges: FuelSurcharge[]
}
```

3.2 เพิ่ม state (ใกล้ๆ `const [rates, setRates] = ...`):

```ts
const [fuelPrice, setFuelPrice] = useState<{ pricePerLiter: number; effectiveDate: string } | null>(null)
```

3.3 แก้ `fetchRates` ให้รองรับ shape ใหม่:

```ts
const fetchRates = useCallback(async () => {
  setLoading(true)
  try {
    const res = await fetch('/api/rates/income')
    if (res.ok) {
      const data = await res.json()
      setRates(data.rates)
      setFuelPrice(data.fuelPrice)
    }
  } catch { message.error('เกิดข้อผิดพลาดในการดึงข้อมูล') }
  finally { setLoading(false) }
}, [message])
```

- [ ] **Step 4: ตรวจว่า build ผ่าน**

Run: `npx tsc --noEmit 2>&1 | grep -v generated | head -20`
Expected: ไม่มี error ใหม่ในไฟล์ที่แก้ (โปรเจกต์อาจมี error เดิมในไฟล์อื่น — เทียบกับก่อนแก้)

- [ ] **Step 5: Commit (รัน detect_changes ก่อนตามกติกา)**

รัน `mcp__gitnexus__detect_changes` repo `syl-system` — ต้องเห็นแค่ symbol ของ GET route + RateIncomeManager แล้ว:

```bash
git add app/api/rates/income/route.ts components/jobs/RateIncomeManager.tsx
git commit -m "feat: include fuel surcharges and current fuel price in rate income API"
```

---

### Task 4: API `POST /api/rates/income/fuel-table/import`

**Files:**
- Create: `app/api/rates/income/fuel-table/import/route.ts`

- [ ] **Step 1: สร้าง route**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { parseFuelRateRows, toStoredMax } from "@/lib/utils/fuelRateExcel";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const customerId = formData.get("customerId");
    const factoryLocationId = formData.get("factoryLocationId");

    if (!(file instanceof File) || typeof customerId !== "string" || typeof factoryLocationId !== "string" || !customerId || !factoryLocationId) {
      return NextResponse.json({ error: "กรุณาเลือกลูกค้า โรงงาน และแนบไฟล์" }, { status: 400 });
    }

    const [customer, factory] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.location.findUnique({ where: { id: factoryLocationId } }),
    ]);
    if (!customer || !factory) {
      return NextResponse.json({ error: "ไม่พบลูกค้าหรือโรงงานที่เลือก" }, { status: 400 });
    }

    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: "ไฟล์ไม่มีข้อมูล" }, { status: 400 });

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    const parsed = parseFuelRateRows(rows);
    if (!parsed.ok) {
      return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let rangeCount = 0;

    await prisma.$transaction(async (tx) => {
      // ไฟล์ = ความจริงทั้งชุดของช่วงราคาน้ำมันของลูกค้า+โรงงานนี้ → ล้างของเดิมทั้งหมดก่อน
      await tx.rateIncomeFuelSurcharge.deleteMany({
        where: { rateIncome: { customerId, factoryLocationId } },
      });

      for (const rate of parsed.rates) {
        const where = {
          jobType_size_factoryLocationId_customerId: {
            jobType: rate.jobType,
            size: rate.size,
            factoryLocationId,
            customerId,
          },
        };
        const existing = await tx.rateIncome.findUnique({ where });
        const rateIncome = existing
          ? await tx.rateIncome.update({ where: { id: existing.id }, data: { income: rate.baseIncome } })
          : await tx.rateIncome.create({
              data: { jobType: rate.jobType, size: rate.size, factoryLocationId, customerId, income: rate.baseIncome },
            });
        if (existing) updated++;
        else created++;

        await tx.rateIncomeFuelSurcharge.createMany({
          data: rate.ranges.map((r) => ({
            rateIncomeId: rateIncome.id,
            fuelPriceMin: r.fuelPriceMin,
            fuelPriceMax: toStoredMax(r.fuelPriceMax),
            surcharge: r.surcharge,
          })),
        });
        rangeCount += rate.ranges.length;
      }
    });

    return NextResponse.json({ created, updated, rangeCount });
  } catch (error) {
    console.error("Error importing fuel rate table:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการนำเข้าข้อมูล" }, { status: 500 });
  }
}
```

- [ ] **Step 2: ตรวจ type**

Run: `npx tsc --noEmit 2>&1 | grep "fuel-table" | head -10`
Expected: ไม่มี error

- [ ] **Step 3: Commit (รัน detect_changes ก่อน)**

```bash
git add app/api/rates/income/fuel-table/import/route.ts
git commit -m "feat: fuel rate table excel import API"
```

---

### Task 5: `FuelRateViewModal` (modal ดูช่วงราคา read-only)

**Files:**
- Create: `components/jobs/FuelRateViewModal.tsx`
- Modify: `components/jobs/RateIncomeManager.tsx` (แทนปุ่มฟันเฟืองด้วยปุ่มดูช่วง)

- [ ] **Step 1: สร้าง component**

```tsx
'use client'

import { Modal, Table, Typography } from 'antd'
import { displayRangeLabel, effectiveIncome } from '@/lib/utils/fuelRateExcel'

interface FuelSurcharge {
  id: string
  fuelPriceMin: number | string
  fuelPriceMax: number | string
  surcharge: number | string
}

interface FuelRateViewModalProps {
  open: boolean
  onClose: () => void
  rateLabel: string // เช่น "ขาเข้า / 20DC / โรงงาน ABC / บริษัท XYZ"
  baseIncome: number | string
  surcharges: FuelSurcharge[]
  fuelPrice: number | null // ราคาน้ำมันปัจจุบัน
}

export default function FuelRateViewModal({
  open,
  onClose,
  rateLabel,
  baseIncome,
  surcharges,
  fuelPrice,
}: FuelRateViewModalProps) {
  const sorted = [...surcharges].sort((a, b) => Number(a.fuelPriceMin) - Number(b.fuelPriceMin))

  const isCurrent = (s: FuelSurcharge) =>
    fuelPrice != null && fuelPrice >= Number(s.fuelPriceMin) && fuelPrice < Number(s.fuelPriceMax)

  const columns = [
    {
      title: 'ช่วงราคาน้ำมัน (บาท/ลิตร)',
      key: 'range',
      render: (_: unknown, s: FuelSurcharge) => displayRangeLabel(s.fuelPriceMin, s.fuelPriceMax),
    },
    {
      title: 'ค่าขนส่ง (บาท)',
      key: 'income',
      align: 'right' as const,
      render: (_: unknown, s: FuelSurcharge) =>
        (Number(baseIncome) + Number(s.surcharge)).toLocaleString(),
    },
  ]

  return (
    <Modal title="ช่วงราคาน้ำมัน" open={open} onCancel={onClose} footer={null} width={480}>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {rateLabel}
      </Typography.Text>
      <Table
        columns={columns}
        dataSource={sorted}
        rowKey="id"
        size="small"
        pagination={false}
        rowClassName={(s) => (isCurrent(s) ? 'ant-table-row-selected' : '')}
      />
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        {fuelPrice != null
          ? `⛽ ราคาน้ำมันปัจจุบัน ${fuelPrice.toFixed(2)} บาท/ลิตร → ค่าขนส่ง ${effectiveIncome({ income: baseIncome, fuelSurcharges: surcharges }, fuelPrice).toLocaleString()} บาท (แถวที่ไฮไลต์)`
          : 'ยังไม่มีบันทึกราคาน้ำมัน — ใช้ราคาฐาน'}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
        * แก้ไขข้อมูลโดยการ Upload Excel ทับเท่านั้น
      </Typography.Text>
    </Modal>
  )
}
```

- [ ] **Step 2: เสียบเข้า `RateIncomeManager.tsx`**

2.1 เปลี่ยน import: ลบ `import RateIncomeFuelSurchargeManager from './RateIncomeFuelSurchargeManager'` → เพิ่ม `import FuelRateViewModal from './FuelRateViewModal'` และเพิ่ม `EyeOutlined` ใน import จาก `@ant-design/icons` (ลบ `SettingOutlined` ที่ import แยกบรรทัดอยู่)

2.2 state เดิม `surchargeTarget` ใช้ต่อได้ (เก็บ rate ที่จะดู) — แก้ปุ่มใน columns `จัดการ`:

```tsx
// เดิม: <Button ... icon={<SettingOutlined />} title="ช่วงราคาน้ำมัน" onClick={() => setSurchargeTarget(r)} ... />
// ใหม่ (แสดงเฉพาะ rate ที่มีช่วงราคา):
{r.fuelSurcharges.length > 0 && (
  <Button
    type="link"
    size="small"
    icon={<EyeOutlined />}
    title="ดูช่วงราคาน้ำมัน"
    onClick={() => setSurchargeTarget(r)}
    data-testid={`rate-income-fuel-view-btn-${r.id}`}
  />
)}
```

2.3 แทน JSX `<RateIncomeFuelSurchargeManager ... />` ท้ายไฟล์ด้วย:

```tsx
<FuelRateViewModal
  open={!!surchargeTarget}
  onClose={() => setSurchargeTarget(null)}
  rateLabel={surchargeTarget ? `${getJobTypeLabel(surchargeTarget.jobType)} / ${surchargeTarget.size} / ${surchargeTarget.factoryLocation.name} / ${surchargeTarget.customer.name}` : ''}
  baseIncome={surchargeTarget?.income ?? 0}
  surcharges={surchargeTarget?.fuelSurcharges ?? []}
  fuelPrice={fuelPrice?.pricePerLiter ?? null}
/>
```

- [ ] **Step 3: ตรวจ type + commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "FuelRateViewModal|RateIncomeManager" | head -10` → ไม่มี error
รัน `mcp__gitnexus__detect_changes` แล้ว:

```bash
git add components/jobs/FuelRateViewModal.tsx components/jobs/RateIncomeManager.tsx
git commit -m "feat: read-only fuel rate view modal replacing surcharge manager"
```

(ตัวไฟล์ `RateIncomeFuelSurchargeManager.tsx` ยังไม่ลบ — ลบใน Task 7)

---

### Task 6: `FuelRateUploadModal` (เลือก → download → แนบ+preview → บันทึก)

**Files:**
- Create: `components/jobs/FuelRateUploadModal.tsx`
- Modify: `components/jobs/RateIncomeManager.tsx` (เพิ่มปุ่ม Upload Excel)

- [ ] **Step 1: สร้าง component**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Modal, Select, Button, Upload, Table, Alert, App, Space, Typography, Divider } from 'antd'
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import {
  parseFuelRateRows,
  buildFuelRateSheetRows,
  FUEL_RATE_TEMPLATE_ROWS,
  type ParseFuelRateResult,
} from '@/lib/utils/fuelRateExcel'
import { getJobTypeLabel } from '@/types/job'
import type { Customer, Location } from '@/types/job'

interface RateForUpload {
  id: string
  jobType: string
  size: string
  factoryLocationId: string
  customerId: string
  income: number | string
  fuelSurcharges: { id: string; fuelPriceMin: number | string; fuelPriceMax: number | string; surcharge: number | string }[]
}

interface FuelRateUploadModalProps {
  open: boolean
  onClose: () => void
  customers: Customer[]
  factoryLocations: Location[]
  rates: RateForUpload[] // ข้อมูลทั้งหมดจากหน้าหลัก ใช้หา "ข้อมูลเดิม" ของลูกค้า+โรงงานที่เลือก
  onSuccess: () => void
}

export default function FuelRateUploadModal({
  open,
  onClose,
  customers,
  factoryLocations,
  rates,
  onSuccess,
}: FuelRateUploadModalProps) {
  const { message } = App.useApp()
  const [customerId, setCustomerId] = useState<string>()
  const [factoryLocationId, setFactoryLocationId] = useState<string>()
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParseFuelRateResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectionReady = !!customerId && !!factoryLocationId

  // ข้อมูลเดิมของลูกค้า+โรงงานที่เลือก (เฉพาะ rate ที่มีช่วงราคาน้ำมัน)
  const existingRates = useMemo(
    () =>
      rates.filter(
        (r) => r.customerId === customerId && r.factoryLocationId === factoryLocationId && r.fuelSurcharges.length > 0
      ),
    [rates, customerId, factoryLocationId]
  )

  // rate ทั้งหมด (รวมไม่มีช่วง) ไว้นับ "สร้างใหม่/อัปเดต" ใน preview
  const existingRateKeys = useMemo(
    () =>
      new Set(
        rates
          .filter((r) => r.customerId === customerId && r.factoryLocationId === factoryLocationId)
          .map((r) => `${r.jobType}|${r.size}`)
      ),
    [rates, customerId, factoryLocationId]
  )

  const downloadXlsx = (rows: (string | number)[][], filename: string) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'fuel-rates')
    XLSX.writeFile(wb, filename)
  }

  const handleDownloadCurrent = () => downloadXlsx(buildFuelRateSheetRows(existingRates), 'fuel_rates_current.xlsx')
  const handleDownloadTemplate = () => downloadXlsx(FUEL_RATE_TEMPLATE_ROWS, 'fuel_rates_template.xlsx')

  const handleFile = async (f: File) => {
    try {
      const workbook = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = sheet ? (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]) : []
      setFile(f)
      setParsed(parseFuelRateRows(rows))
    } catch {
      setFile(null)
      setParsed(null)
      message.error('อ่านไฟล์ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx')
    }
    return false // ห้าม antd upload เอง
  }

  const handleSubmit = async () => {
    if (!file || !customerId || !factoryLocationId) return
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('customerId', customerId)
      formData.append('factoryLocationId', factoryLocationId)
      const res = await fetch('/api/rates/income/fuel-table/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || data.errors?.[0]?.message || 'เกิดข้อผิดพลาด')
        return
      }
      message.success(`บันทึกสำเร็จ — rate ใหม่ ${data.created} / อัปเดต ${data.updated} / ${data.rangeCount} ช่วงราคา`)
      handleClose()
      onSuccess()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setCustomerId(undefined)
    setFactoryLocationId(undefined)
    setFile(null)
    setParsed(null)
    onClose()
  }

  const previewColumns = [
    { title: 'ลักษณะงาน', dataIndex: 'jobType', render: (v: string) => getJobTypeLabel(v) },
    { title: 'SIZE', dataIndex: 'size' },
    { title: 'ราคาฐาน', dataIndex: 'baseIncome', align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: 'จำนวนช่วง', key: 'count', align: 'right' as const, render: (_: unknown, r: { ranges: unknown[] }) => r.ranges.length },
    {
      title: 'สถานะ',
      key: 'status',
      render: (_: unknown, r: { jobType: string; size: string }) =>
        existingRateKeys.has(`${r.jobType}|${r.size}`) ? 'อัปเดต' : 'สร้างใหม่',
    },
  ]

  return (
    <Modal
      title="Upload ตารางราคาตามน้ำมัน"
      open={open}
      onCancel={handleClose}
      width={680}
      okText="บันทึก"
      cancelText="ยกเลิก"
      onOk={handleSubmit}
      confirmLoading={submitting}
      okButtonProps={{ disabled: !selectionReady || !parsed || !parsed.ok, 'data-testid': 'fuel-upload-save-btn' } as object}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space wrap>
          <Select
            id="fuel-upload-customer"
            showSearch
            placeholder="เลือกลูกค้า"
            style={{ width: 220 }}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={customerId}
            onChange={(v) => { setCustomerId(v); setFile(null); setParsed(null) }}
            popupMatchSelectWidth={false}
          />
          <Select
            id="fuel-upload-factory"
            showSearch
            placeholder="เลือกโรงงาน"
            style={{ width: 220 }}
            options={factoryLocations.map((l) => ({ value: l.id, label: l.name }))}
            filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={factoryLocationId}
            onChange={(v) => { setFactoryLocationId(v); setFile(null); setParsed(null) }}
            popupMatchSelectWidth={false}
          />
        </Space>

        {selectionReady && (
          <>
            {existingRates.length > 0 ? (
              <Button icon={<DownloadOutlined />} onClick={handleDownloadCurrent} data-testid="fuel-upload-download-current-btn">
                ดาวน์โหลดข้อมูลปัจจุบัน (แก้แล้วอัปโหลดกลับ)
              </Button>
            ) : (
              <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} data-testid="fuel-upload-download-template-btn">
                ดาวน์โหลด Template
              </Button>
            )}

            <Upload.Dragger accept=".xlsx,.xls" maxCount={1} showUploadList={!!file} beforeUpload={handleFile} onRemove={() => { setFile(null); setParsed(null) }}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">คลิกหรือลากไฟล์ Excel มาวางที่นี่</p>
              <p className="ant-upload-hint">รูปแบบ: ลักษณะงาน | SIZE | ช่วงราคาน้ำมัน | ค่าขนส่ง (ราคาเต็มต่อช่วง)</p>
            </Upload.Dragger>

            {parsed && !parsed.ok && (
              <Alert
                type="error"
                message="ไฟล์มีข้อผิดพลาด — ยังไม่บันทึก"
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {parsed.errors.map((e, i) => (
                      <li key={i}>แถว {e.row}: {e.message}</li>
                    ))}
                  </ul>
                }
              />
            )}

            {parsed && parsed.ok && (
              <>
                <Divider style={{ margin: '4px 0' }}>Preview</Divider>
                <Alert
                  type="warning"
                  showIcon
                  message={`การบันทึกจะแทนที่ช่วงราคาน้ำมันเดิมทั้งหมดของลูกค้า+โรงงานนี้ (เดิมมี ${existingRates.length} rate ที่มีช่วงราคา)`}
                />
                <Table
                  columns={previewColumns}
                  dataSource={parsed.rates}
                  rowKey={(r) => `${r.jobType}|${r.size}`}
                  size="small"
                  pagination={false}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  * ราคาฐานของแต่ละแถว = ค่าขนส่งของช่วงราคาน้ำมันต่ำสุดในไฟล์
                </Typography.Text>
              </>
            )}
          </>
        )}
      </Space>
    </Modal>
  )
}
```

- [ ] **Step 2: เพิ่มปุ่มใน `RateIncomeManager.tsx`**

2.1 import: `import FuelRateUploadModal from './FuelRateUploadModal'` และเพิ่ม `UploadOutlined` ใน icons

2.2 state: `const [uploadOpen, setUploadOpen] = useState(false)`

2.3 ใน header `<Space>` (ข้างปุ่มเพิ่ม) เพิ่มปุ่มก่อนปุ่ม "เพิ่ม":

```tsx
<Button icon={<UploadOutlined />} onClick={() => setUploadOpen(true)} data-testid="fuel-upload-open-btn">
  Upload Excel (ราคาตามน้ำมัน)
</Button>
```

2.4 JSX ท้าย component:

```tsx
<FuelRateUploadModal
  open={uploadOpen}
  onClose={() => setUploadOpen(false)}
  customers={customers}
  factoryLocations={factoryLocations}
  rates={rates}
  onSuccess={fetchRates}
/>
```

- [ ] **Step 3: ตรวจ type + commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "FuelRateUploadModal|RateIncomeManager" | head -10` → ไม่มี error
รัน `mcp__gitnexus__detect_changes` แล้ว:

```bash
git add components/jobs/FuelRateUploadModal.tsx components/jobs/RateIncomeManager.tsx
git commit -m "feat: fuel rate excel upload modal with preview"
```

---

### Task 7: หน้าหลัก — ราคา effective, แบนเนอร์น้ำมัน, Export Excel, ลบของเก่า

**Files:**
- Modify: `components/jobs/RateIncomeManager.tsx`
- Delete: `components/jobs/RateIncomeFuelSurchargeManager.tsx`
- Delete: `app/api/rates/income/surcharge/route.ts`, `app/api/rates/income/surcharge/[id]/route.ts`
- Delete: `app/api/rates/income/import/route.ts`

- [ ] **Step 1: impact check ก่อนลบ**

รัน `mcp__gitnexus__impact` target `RateIncomeFuelSurchargeManager` direction upstream — caller ต้องเหลือศูนย์ (Task 5 ถอด usage ไปแล้ว) ถ้ายังมี caller ให้หยุดและตรวจสอบ

- [ ] **Step 2: แก้ `RateIncomeManager.tsx`**

2.1 import เพิ่ม: `import { effectiveIncome } from '@/lib/utils/fuelRateExcel'` (และลบ import `ImportCSVModal`, `ImportOutlined`, `ExportOutlined` ถ้าไม่ใช้แล้ว — ปุ่ม Export Excel ใช้ `ExportOutlined` ต่อได้)

2.2 คอลัมน์ `ค่าขนส่ง` เปลี่ยนเป็นราคา effective:

```tsx
{
  title: 'ค่าขนส่ง',
  dataIndex: 'income',
  key: 'income',
  width: 110,
  align: 'right' as const,
  render: (_: unknown, r: RateIncome) => effectiveIncome(r, fuelPrice?.pricePerLiter ?? null).toLocaleString(),
},
```

2.3 แบนเนอร์ราคาน้ำมันเหนือตาราง (ใต้ `<h2>อัตราค่าขนส่ง</h2>` หรือใต้ filter row):

```tsx
<div style={{ marginBottom: 12 }}>
  <Typography.Text type="secondary">
    {fuelPrice
      ? `⛽ ราคาน้ำมันปัจจุบัน ${fuelPrice.pricePerLiter.toFixed(2)} บาท/ลิตร (มีผล ${dayjs(fuelPrice.effectiveDate).format('YYYY-MM-DD')}) — ค่าขนส่งในตารางคำนวณตามราคานี้`
      : '⛽ ยังไม่มีบันทึกราคาน้ำมัน — ค่าขนส่งในตารางเป็นราคาฐาน'}
  </Typography.Text>
</div>
```

(เพิ่ม `Typography` ใน import จาก antd — `dayjs` import อยู่แล้ว)

2.4 แทน `handleExport` (CSV) ด้วย Export Excel:

```tsx
const handleExport = () => {
  const rows: (string | number)[][] = [
    ['ลูกค้า', 'โรงงาน', 'ลักษณะงาน', 'SIZE', 'ราคาฐาน', 'ค่าขนส่ง (ณ ราคาน้ำมันปัจจุบัน)'],
    ...filteredRates.map((r) => [
      r.customer.name,
      r.factoryLocation.name,
      getJobTypeLabel(r.jobType),
      r.size,
      Number(r.income),
      effectiveIncome(r, fuelPrice?.pricePerLiter ?? null),
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'rate-income')
  XLSX.writeFile(wb, 'rate_income.xlsx')
}
```

(เพิ่ม `import * as XLSX from 'xlsx'` — ปุ่มเดิมเปลี่ยน label เป็น `Export Excel`)

2.5 ลบ: ปุ่ม `Import CSV` + state `importOpen` + JSX `<ImportCSVModal ... />` ทั้งก้อน (บรรทัด ~231-247 เดิม) + import ของมัน

- [ ] **Step 3: ลบไฟล์เก่า**

```bash
git rm components/jobs/RateIncomeFuelSurchargeManager.tsx
git rm -r app/api/rates/income/surcharge
git rm app/api/rates/income/import/route.ts
```

- [ ] **Step 4: ตรวจว่าไม่มี reference ค้าง + build**

Run: `grep -rn "RateIncomeFuelSurchargeManager\|rates/income/surcharge\|rates/income/import" app components lib --include="*.ts" --include="*.tsx" | grep -v generated`
Expected: ไม่มีผลลัพธ์

Run: `npm run build`
Expected: build ผ่าน

- [ ] **Step 5: รัน unit tests ทั้งหมดอีกครั้ง + detect_changes + commit**

Run: `npx tsx --test lib/utils/__tests__/fuelRateExcel.test.ts` → PASS
รัน `mcp__gitnexus__detect_changes` repo `syl-system` — ตรวจว่า affected symbols อยู่ในขอบเขตงานนี้เท่านั้น (RateIncomeManager, route rates/income, ไฟล์ที่ลบ) **ห้ามมี** symbol ของ `/api/jobs/calculate/income`

```bash
git add components/jobs/RateIncomeManager.tsx
git commit -m "feat: effective income by current fuel price, export excel, remove legacy surcharge UI"
```

---

### Task 8: Verify รวม + manual test checklist

- [ ] **Step 1: รันทุกอย่างรอบสุดท้าย**

```bash
npx tsx --test lib/utils/__tests__/fuelRateExcel.test.ts
npm run lint
npm run build
```

Expected: ผ่านทั้งหมด (lint อาจมี warning เดิมของโปรเจกต์ — ห้ามมี error ใหม่ในไฟล์ที่แตะ)

- [ ] **Step 2: อัปเดต GitNexus index**

Run: `node .gitnexus/run.cjs analyze --no-stats`

- [ ] **Step 3: แจ้ง user ให้ manual test** (user เลือกเองว่าจะรัน `make dev` กับ staging)

Checklist สำหรับ user:
1. หน้า `/jobs/settings/rates/income` — เห็นแบนเนอร์ราคาน้ำมัน + ค่าขนส่ง effective
2. กด Upload Excel → เลือกลูกค้า+โรงงาน → ไม่มีข้อมูล → ดาวน์โหลด template → กรอก → แนบ → เห็น preview → บันทึก → ตารางอัปเดต, rate ใหม่ถูกสร้าง, ราคาฐาน = ช่วงต่ำสุด
3. เปิด modal ดูช่วงราคา (ไอคอนตา) → เห็นช่วง + highlight ช่วงปัจจุบัน
4. Upload ซ้ำลูกค้า+โรงงานเดิม → ดาวน์โหลดข้อมูลปัจจุบัน → แก้ → อัปกลับ → ข้อมูลถูกแทนที่
5. แนบไฟล์ผิด format → เห็น error รายแถว ไม่บันทึก
6. Export Excel หน้าหลัก → ได้ไฟล์ตรงกับตารางที่กรอง
7. สร้างงานใหม่ (JobFormModal) เลือกลูกค้า/โรงงาน/วันที่ → income auto-fill ตรงกับช่วงราคาน้ำมัน ณ วันที่งาน
8. แก้/เพิ่ม rate เดี่ยวผ่าน modal เดิม ยังทำงานปกติ

---

## Self-Review (ทำแล้ว)

- **Spec coverage**: long format ✓ (Task 1), ราคาฐานจากช่วงต่ำสุด ✓ (Task 1), upload modal เลือก→download→preview→save ✓ (Task 6), แทนที่ทั้งชุด ✓ (Task 4), ราคา effective + แบนเนอร์ ✓ (Task 7), view modal read-only ✓ (Task 5), Export Excel แทน CSV + ลบ Import CSV ✓ (Task 7), ลบ modal/endpoint เก่า ✓ (Task 7), calc API ไม่แตะ ✓, unit test เฉพาะ parser ไม่มี E2E ✓
- **Type consistency**: `ParseFuelRateResult`/`ParsedFuelRate`/`RateWithSurcharges` ใช้ชื่อเดียวกันทุก task, response shape `{ rates, fuelPrice }` ตรงกันระหว่าง Task 3/5/6/7
