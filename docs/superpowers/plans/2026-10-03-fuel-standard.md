# น้ำมันมาตรฐาน (Fuel Standard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เมนูตั้งค่าน้ำมันมาตรฐานต่อเที่ยว (size + รับตู้ + โรงงาน + คืนตู้) และแสดงลิตรที่ใช้เกินมาตรฐานรายช่วงเติมน้ำมันในหน้าสรุปรายเดือนของคนขับ

**Architecture:** ตารางใหม่ `FuelStandard` + CRUD/Import API (ADMIN only) + หน้าตั้งค่าแบบเดียวกับ rate อื่น ตัวคำนวณเป็น pure function `computeFuelSegments` ที่ตัด job เป็นช่วงตามจุดเติม ถูกเรียกสดจาก `buildMonthSummaries` เฉพาะเมื่อขอ (`includeFuelStandard`) แล้วแสดงในการ์ดเดือนของ `/summary/[driverId]` พร้อม modal รายละเอียดช่วงและ quick-add ค่ามาตรฐานที่ขาด

**Tech Stack:** Next.js 15 App Router, Prisma (client ที่ `app/generated/prisma`), antd v5, `node:test` ผ่าน `npx tsx --test`, Playwright

**Spec:** `docs/superpowers/specs/2026-10-03-fuel-standard-design.md`

## Global Constraints

- ตอบ/ข้อความ UI/error message เป็นภาษาไทย
- API: `const session = await auth(); if (!session?.user) return 401` และ route ใหม่ทุกตัว **403 ถ้า `session.user.role !== "ADMIN"`** (ข้อความ `ไม่มีสิทธิ์เข้าถึงข้อมูลนี้`)
- `<Table>` ทุกตัวต้องมี `size="small"`
- Confirm ลบใช้ `App.useApp().modal.confirm` — ห้ามใช้ `Popconfirm`
- Notification ใช้ `App.useApp().message`
- antd Select ใส่ `id` prop (ไม่ครอบด้วย div data-testid), Button/Input ใส่ `data-testid` ได้ตรงๆ, ห้ามใส่ `data-testid` บน `<Modal>`
- Prisma model: `@id @default(cuid())`, `createdAt @default(now())`, `updatedAt @updatedAt`, `@@map("snake_case")`
- ข้อความ duplicate: `มีข้อมูลนี้อยู่แล้ว` (status 409)
- ห้ามรัน `make migrate-stag` / `make migrate-prod` — ผู้ใช้ทำเอง
- E2E ต้องรัน `npx playwright test --workers=1` (docker DB `syl-e2e-db` ต้องรันอยู่)
- ก่อนแก้ function/component เดิม ต้องรัน GitNexus impact (`node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`) และก่อน commit รัน `node .gitnexus/run.cjs detect-changes --scope staged --repo .`
- Commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **ชื่อสถานที่ใน CSV มี comma** — `ImportCSVModal.parseCSV` split ด้วย `,` ตรงๆ ชื่อที่มี comma จะเลื่อนคอลัมน์ → validator ต้องจับได้ว่า "ไม่พบสถานที่" แทนที่จะ import ผิดคอลัมน์เงียบๆ (test ใน Task 3: แถวที่ลิตรไม่ใช่ตัวเลข/สถานที่ไม่เจอ ต้องเป็น error)
2. **job หลายใบวันเดียวกัน** — ลำดับต้องเป็น `jobDate, createdAt` เหมือนตาราง job ไม่งั้นช่วงตัดผิดใบ (Task 7 query เรียงสองคีย์ + Task 2 test ใช้ลำดับ input ตามที่ส่งมา)
3. **จุดเติมก่อนหน้าอยู่วันเดียวกับ job อื่นที่สร้างก่อนมัน** — ต้องตัดด้วย index ของ id จุดเติม ไม่ใช่ตัดด้วยวันที่ (Task 7 Step 3 code)
4. **ลิตรติดลบ/ทศนิยม** — float เช่น 40.15 + 40 ต้องปัด 2 ตำแหน่ง ไม่โชว์ 80.14999 (Task 2 test "ปัดทศนิยม")
5. **แก้ค่ามาตรฐานแล้วการ์ดไม่อัปเดต** — quick-add ต้อง refetch ทั้งปีและ modal ต้องแสดงข้อมูลเดือนใหม่ (Task 9 e2e ตรวจตัวเลขเปลี่ยนหลังบันทึก)

---

## File Structure

| File | หน้าที่ |
|---|---|
| `prisma/schema.prisma` | model `FuelStandard` + back-relations ใน `Location` |
| `lib/utils/fuelSegments.ts` (new) | pure: ตัดช่วง + คำนวณมาตรฐาน/ส่วนต่าง |
| `lib/utils/fuelStandardImport.ts` (new) | pure: validate + resolve แถว CSV |
| `lib/utils/fuelStandardApi.ts` (new) | `requireAdmin`, parse body, key where, include |
| `app/api/rates/fuel-standard/route.ts` (new) | GET, POST |
| `app/api/rates/fuel-standard/[id]/route.ts` (new) | PUT, DELETE |
| `app/api/rates/fuel-standard/import/route.ts` (new) | POST import CSV |
| `components/jobs/FuelStandardFormModal.tsx` (new) | modal เพิ่ม/แก้ — ใช้ทั้งหน้าตั้งค่าและ quick-add |
| `components/jobs/FuelStandardManager.tsx` (new) | หน้าตั้งค่า (ตาราง/filter/import/export/ลบ) |
| `app/(protected)/jobs/settings/fuel-standard/page.tsx` (new) | server page เช็ค ADMIN |
| `components/ProtectedLayoutClient.tsx` | เมนู "น้ำมันมาตรฐาน" |
| `types/job.ts` | `FuelStandardSummary` + `DriverMonthlySummary.fuelStandard?` |
| `lib/utils/fuelSegmentsQuery.ts` (new) | ดึง DB → `computeFuelSegments` → view |
| `lib/utils/summaryQuery.ts` | option `includeFuelStandard` |
| `app/api/summary/[driverId]/route.ts` | ส่ง `includeFuelStandard: true` |
| `components/summary/FuelSegmentsModal.tsx` (new) | ตารางรายละเอียดช่วง + quick-add |
| `components/summary/SummaryDetail.tsx` | 3 แถวใหม่ในการ์ด + เปิด modal |
| `e2e/scripts/cleanup-fuel-standard.ts` (new) | ลบข้อมูล e2e ของฟีเจอร์นี้ |
| `e2e/scripts/seed-fuel-summary.ts` (new) | seed job/มาตรฐานสำหรับ e2e สรุป |
| `e2e/jobs/fuel-standard.spec.ts` (new) | e2e หน้าตั้งค่า + API |
| `e2e/summary/fuel-standard-summary.spec.ts` (new) | e2e หน้าสรุป |

---

### Task 1: Prisma model `FuelStandard`

**Files:**
- Modify: `prisma/schema.prisma` (model `Location` ~line 244-262, หมวด Rate Tables หลัง `RateDriverWage` ~line 496-509)

**Interfaces:**
- Produces: `prisma.fuelStandard` (fields `id, size, pickupLocationId, factoryLocationId: string | null, returnLocationId, liters: Decimal, createdAt, updatedAt`; relations `pickupLocation`, `factoryLocation`, `returnLocation`)

- [ ] **Step 1: เพิ่ม back-relations ใน `Location`** — ต่อท้ายบรรทัด `rateDriverWageFactory ...`

```prisma
  fuelStandardPickup    FuelStandard[]  @relation("FuelStandardPickup")
  fuelStandardFactory   FuelStandard[]  @relation("FuelStandardFactory")
  fuelStandardReturn    FuelStandard[]  @relation("FuelStandardReturn")
```

- [ ] **Step 2: เพิ่ม model หลัง `RateDriverWage`**

```prisma
// น้ำมันมาตรฐานต่อเที่ยว ตาม size + เส้นทาง (ไม่แยก jobType)
// factoryLocationId ว่างได้ (งานทอย) — Postgres ถือว่า NULL ไม่ซ้ำ จึงต้องเช็คซ้ำใน API ด้วย
model FuelStandard {
  id                String   @id @default(cuid())
  size              String
  pickupLocationId  String
  factoryLocationId String?
  returnLocationId  String
  liters            Decimal  @db.Decimal(10, 2)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  pickupLocation  Location  @relation("FuelStandardPickup", fields: [pickupLocationId], references: [id])
  factoryLocation Location? @relation("FuelStandardFactory", fields: [factoryLocationId], references: [id])
  returnLocation  Location  @relation("FuelStandardReturn", fields: [returnLocationId], references: [id])

  @@unique([size, pickupLocationId, factoryLocationId, returnLocationId])
  @@map("fuel_standard")
}
```

- [ ] **Step 3: Validate + generate**

Run: `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` และ generate สำเร็จ

- [ ] **Step 4: Push ไป e2e DB (docker) เพื่อเช็คว่า schema ใช้ได้จริง**

Run: `DATABASE_URL="postgresql://e2e:e2epass@localhost:5442/syl_e2e" npx prisma db push --accept-data-loss`
Expected: `Your database is now in sync with your Prisma schema`
(ถ้า container ไม่รัน: `docker start syl-e2e-db` — **ห้าม** push ไป stag/prod)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(fuel-standard): เพิ่มตาราง fuel_standard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure function `computeFuelSegments`

**Files:**
- Create: `lib/utils/fuelSegments.ts`
- Test: `lib/utils/__tests__/fuelSegments.test.ts`

**Interfaces:**
- Consumes: `getPairedSize(size: string | null): string | null` จาก `@/types/job`
- Produces (ใช้ใน Task 7):
  - `FUEL_EXCLUDED_JOB_TYPES: readonly ["noJob", "advance"]`
  - `interface FuelJob { id; jobNumber; jobDate: string /*YYYY-MM-DD*/; jobType; isCancelled; size: string|null; pickupLocationId: string|null; factoryLocationId: string|null; returnLocationId: string|null; fuelLiters: number; pairRole: "primary"|"secondary"|null }`
  - `interface FuelStandardEntry { size; pickupLocationId; factoryLocationId: string|null; returnLocationId; liters: number }`
  - `interface FuelMissingRoute { size: string|null; pickupLocationId: string|null; factoryLocationId: string|null; returnLocationId: string|null; jobNumbers: string[] }`
  - `type FuelSegmentStatus = "ok" | "missing_standard" | "no_previous_fill"`
  - `interface FuelSegment { startDate: string; endDate: string; closingJobNumber: string; jobCount: number; actualLiters: number; standardLiters: number|null; diffLiters: number|null; status: FuelSegmentStatus; missingRoutes: FuelMissingRoute[] }`
  - `interface FuelSegmentResult { segments: FuelSegment[]; pendingJobCount: number; excessLiters: number; netDiffLiters: number }`
  - `totalFuelLiters(j: { fuelOfficeLiters: number|null; fuelCashLiters: number|null; fuelCreditLiters: number|null }): number`
  - `computeFuelSegments(jobs: FuelJob[], standards: FuelStandardEntry[], opts: { month: string; hasPreviousFill: boolean }): FuelSegmentResult`

- [ ] **Step 1: Write the failing test**

`lib/utils/__tests__/fuelSegments.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeFuelSegments, totalFuelLiters, type FuelJob, type FuelStandardEntry } from '../fuelSegments'

const MONTH = '2026-09'
const R1 = { pickupLocationId: 'P1', factoryLocationId: 'F1', returnLocationId: 'R1' }
const R2 = { pickupLocationId: 'P2', factoryLocationId: 'F2', returnLocationId: 'R2' }
const TOW = { pickupLocationId: 'P1', factoryLocationId: null, returnLocationId: 'SYL' }

let seq = 0
function job(over: Partial<FuelJob> = {}): FuelJob {
  seq++
  return {
    id: `j${seq}`,
    jobNumber: `JOB-${seq}`,
    jobDate: '2026-09-10',
    jobType: 'inbound',
    isCancelled: false,
    size: '40DC',
    ...R1,
    fuelLiters: 0,
    pairRole: null,
    ...over,
  }
}

const STD: FuelStandardEntry[] = [
  { size: '40DC', ...R1, liters: 40 },
  { size: '2x20DC', ...R1, liters: 50 },
  { size: '20DC', ...TOW, liters: 15 },
]

function run(jobs: FuelJob[], opts: Partial<{ month: string; hasPreviousFill: boolean }> = {}) {
  return computeFuelSegments(jobs, STD, { month: MONTH, hasPreviousFill: true, ...opts })
}

test('ตัวอย่างหลัก: B ไม่เติม, H เติม 97 มาตรฐานรวม 80 → เกิน +17', () => {
  const r = run([
    job({ jobDate: '2026-09-02' }),
    job({ jobDate: '2026-09-03', fuelLiters: 97 }),
  ])
  assert.equal(r.segments.length, 1)
  const s = r.segments[0]
  assert.equal(s.status, 'ok')
  assert.equal(s.startDate, '2026-09-02')
  assert.equal(s.endDate, '2026-09-03')
  assert.equal(s.jobCount, 2)
  assert.equal(s.actualLiters, 97)
  assert.equal(s.standardLiters, 80)
  assert.equal(s.diffLiters, 17)
  assert.equal(r.excessLiters, 17)
  assert.equal(r.netDiffLiters, 17)
  assert.equal(r.pendingJobCount, 0)
})

test('totalFuelLiters: รวม OFF + สด + เครดิต, null นับเป็น 0', () => {
  assert.equal(totalFuelLiters({ fuelOfficeLiters: 50, fuelCashLiters: 20.5, fuelCreditLiters: null }), 70.5)
  assert.equal(totalFuelLiters({ fuelOfficeLiters: null, fuelCashLiters: null, fuelCreditLiters: null }), 0)
})

test('ช่วงที่มี job ไม่มีค่ามาตรฐาน → missing_standard, ไม่รวมยอด, group เส้นทางพร้อมเลข JOB', () => {
  const a = job({ ...R2 })
  const b = job({ ...R2 })
  const r = run([a, b, job({ fuelLiters: 120 })])
  const s = r.segments[0]
  assert.equal(s.status, 'missing_standard')
  assert.equal(s.standardLiters, null)
  assert.equal(s.diffLiters, null)
  assert.deepEqual(s.missingRoutes, [
    { size: '40DC', ...R2, jobNumbers: [a.jobNumber, b.jobNumber] },
  ])
  assert.equal(r.excessLiters, 0)
  assert.equal(r.netDiffLiters, 0)
})

test('ไม่มีจุดเติมก่อนหน้า → ช่วงแรก no_previous_fill, ช่วงถัดไปคำนวณปกติ', () => {
  const r = run(
    [job({ fuelLiters: 100 }), job(), job({ fuelLiters: 90 })],
    { hasPreviousFill: false },
  )
  assert.equal(r.segments.length, 2)
  assert.equal(r.segments[0].status, 'no_previous_fill')
  assert.equal(r.segments[0].diffLiters, null)
  assert.equal(r.segments[1].status, 'ok')
  assert.equal(r.segments[1].diffLiters, 10)
  assert.equal(r.excessLiters, 10)
})

test('job หลังจุดเติมสุดท้าย → pendingJobCount และไม่สร้างช่วง', () => {
  const r = run([job({ fuelLiters: 40 }), job(), job()])
  assert.equal(r.segments.length, 1)
  assert.equal(r.pendingJobCount, 2)
})

test('งานจับคู่: primary ใช้ค่า 2x20DC, secondary = 0', () => {
  const r = run([
    job({ size: '20DC', pairRole: 'secondary' }),
    job({ size: '20DC', pairRole: 'primary', fuelLiters: 60 }),
  ])
  assert.equal(r.segments[0].standardLiters, 50)
  assert.equal(r.segments[0].diffLiters, 10)
})

test('งานจับคู่: secondary เป็นจุดเติมได้', () => {
  const r = run([
    job({ size: '20DC', pairRole: 'primary' }),
    job({ size: '20DC', pairRole: 'secondary', fuelLiters: 45 }),
  ])
  assert.equal(r.segments.length, 1)
  assert.equal(r.segments[0].diffLiters, -5)
})

test('งานจับคู่ที่ไม่มีค่า 2x20DC → missingRoutes ใช้ size 2x20DC (ไว้ quick-add)', () => {
  const r = run([job({ size: '20DC', pairRole: 'primary', ...R2, fuelLiters: 60 })])
  assert.equal(r.segments[0].missingRoutes[0].size, '2x20DC')
})

test('job ยกเลิก / noJob / advance ถูกข้ามทั้งมาตรฐานและลิตร', () => {
  const r = run([
    job(),
    job({ isCancelled: true, fuelLiters: 500, ...R2 }),
    job({ jobType: 'noJob', size: null, pickupLocationId: null, factoryLocationId: null, returnLocationId: null }),
    job({ jobType: 'advance', fuelLiters: 300 }),
    job({ fuelLiters: 85 }),
  ])
  assert.equal(r.segments.length, 1)
  assert.equal(r.segments[0].jobCount, 2)
  assert.equal(r.segments[0].diffLiters, 5)
})

test('โรงงานว่าง match เฉพาะมาตรฐานที่โรงงานว่าง', () => {
  const ok = run([job({ jobType: 'towing', size: '20DC', ...TOW, fuelLiters: 20 })])
  assert.equal(ok.segments[0].standardLiters, 15)

  const miss = run([job({ jobType: 'towing', size: '20DC', ...TOW, factoryLocationId: 'F1', fuelLiters: 20 })])
  assert.equal(miss.segments[0].status, 'missing_standard')
})

test('job ที่กรอก size/สถานที่ไม่ครบ → missing_standard', () => {
  const r = run([job({ size: null, fuelLiters: 30 })])
  assert.equal(r.segments[0].status, 'missing_standard')
  assert.equal(r.segments[0].missingRoutes[0].size, null)
})

test('เกินรวม vs สุทธิ: +17 และ −10 → เกินรวม 17, สุทธิ 7', () => {
  const r = run([
    job(), job({ fuelLiters: 97 }),       // มาตรฐาน 80 → +17
    job(), job({ fuelLiters: 70 }),       // มาตรฐาน 80 → −10
  ])
  assert.equal(r.excessLiters, 17)
  assert.equal(r.netDiffLiters, 7)
})

test('คร่อมเดือน: ช่วงที่ปิดเดือนก่อนไม่ถูกคืน, ช่วงที่เริ่มเดือนก่อนแต่ปิดเดือนนี้ถูกคืน', () => {
  const r = run([
    job({ jobDate: '2026-08-30', fuelLiters: 40 }),   // ปิดช่วงใน ส.ค.
    job({ jobDate: '2026-08-31' }),
    job({ jobDate: '2026-09-02', fuelLiters: 90 }),   // ปิดช่วงใน ก.ย.
    job({ jobDate: '2026-10-01' }),                    // เดือนถัดไป ไม่นับ pending
  ])
  assert.equal(r.segments.length, 1)
  assert.equal(r.segments[0].startDate, '2026-08-31')
  assert.equal(r.segments[0].diffLiters, 10)
  assert.equal(r.pendingJobCount, 0)
})

test('ปัดทศนิยม 2 ตำแหน่ง', () => {
  const r = computeFuelSegments(
    [job({ fuelLiters: 0 }), job({ fuelLiters: 97.3 })],
    [{ size: '40DC', ...R1, liters: 40.15 }],
    { month: MONTH, hasPreviousFill: true },
  )
  assert.equal(r.segments[0].standardLiters, 80.3)
  assert.equal(r.segments[0].diffLiters, 17)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/utils/__tests__/fuelSegments.test.ts`
Expected: FAIL — `Cannot find module '../fuelSegments'`

- [ ] **Step 3: Write implementation**

`lib/utils/fuelSegments.ts`:

```ts
import { getPairedSize } from "@/types/job";

/** ลักษณะงานที่ไม่ใช่การวิ่งรถ — ไม่นับทั้งมาตรฐานและลิตรที่เติม */
export const FUEL_EXCLUDED_JOB_TYPES = ["noJob", "advance"] as const;

export interface FuelJob {
  id: string;
  jobNumber: string;
  /** 'YYYY-MM-DD' */
  jobDate: string;
  jobType: string;
  isCancelled: boolean;
  size: string | null;
  pickupLocationId: string | null;
  factoryLocationId: string | null;
  returnLocationId: string | null;
  /** OFF + สด + เครดิต — มากกว่า 0 คือจุดเติมเต็มถัง */
  fuelLiters: number;
  pairRole: "primary" | "secondary" | null;
}

export interface FuelStandardEntry {
  size: string;
  pickupLocationId: string;
  factoryLocationId: string | null;
  returnLocationId: string;
  liters: number;
}

export interface FuelMissingRoute {
  /** size ที่ใช้หา — งานจับคู่ใบหลักเป็น paired size (2x20DC) */
  size: string | null;
  pickupLocationId: string | null;
  factoryLocationId: string | null;
  returnLocationId: string | null;
  jobNumbers: string[];
}

export type FuelSegmentStatus = "ok" | "missing_standard" | "no_previous_fill";

export interface FuelSegment {
  startDate: string;
  endDate: string;
  closingJobNumber: string;
  jobCount: number;
  actualLiters: number;
  /** null เมื่อ status ไม่ใช่ ok */
  standardLiters: number | null;
  /** ใช้จริง − มาตรฐาน; null เมื่อ status ไม่ใช่ ok */
  diffLiters: number | null;
  status: FuelSegmentStatus;
  /** job ในช่วงที่หาค่ามาตรฐานไม่เจอ (มีได้ทุก status — ใช้ทำ quick-add) */
  missingRoutes: FuelMissingRoute[];
}

export interface FuelSegmentResult {
  /** เฉพาะช่วงที่ปิดภายในเดือนที่ขอ */
  segments: FuelSegment[];
  /** job ในเดือนที่ขอซึ่งอยู่หลังจุดเติมสุดท้าย — ยังรอปิดช่วง */
  pendingJobCount: number;
  /** Σ ส่วนต่างที่ > 0 ของช่วงที่คำนวณได้ */
  excessLiters: number;
  /** Σ ส่วนต่างทุกช่วงที่คำนวณได้ (หักลบช่วงที่ประหยัด) */
  netDiffLiters: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const routeKey = (
  size: string | null,
  pickupLocationId: string | null,
  factoryLocationId: string | null,
  returnLocationId: string | null
) => [size ?? "", pickupLocationId ?? "", factoryLocationId ?? "", returnLocationId ?? ""].join("|");

export function totalFuelLiters(j: {
  fuelOfficeLiters: number | null;
  fuelCashLiters: number | null;
  fuelCreditLiters: number | null;
}): number {
  return round2((j.fuelOfficeLiters ?? 0) + (j.fuelCashLiters ?? 0) + (j.fuelCreditLiters ?? 0));
}

function isFuelCountedJob(job: FuelJob): boolean {
  return !job.isCancelled && !(FUEL_EXCLUDED_JOB_TYPES as readonly string[]).includes(job.jobType);
}

/** size ที่ใช้หามาตรฐาน + ลิตร (null = หาไม่เจอ) — ใบรองของงานจับคู่นับ 0 เพราะวิ่งเที่ยวเดียวกับใบหลัก */
function resolveStandard(
  job: FuelJob,
  litersByKey: Map<string, number>
): { lookupSize: string | null; liters: number | null } {
  if (job.pairRole === "secondary") return { lookupSize: job.size, liters: 0 };
  const lookupSize = job.pairRole === "primary" ? getPairedSize(job.size) ?? job.size : job.size;
  if (!lookupSize || !job.pickupLocationId || !job.returnLocationId) return { lookupSize, liters: null };
  const liters = litersByKey.get(
    routeKey(lookupSize, job.pickupLocationId, job.factoryLocationId, job.returnLocationId)
  );
  return { lookupSize, liters: liters ?? null };
}

function buildSegment(
  jobs: FuelJob[],
  litersByKey: Map<string, number>,
  noPreviousFill: boolean
): FuelSegment {
  const closing = jobs[jobs.length - 1];
  const actual = round2(closing.fuelLiters);
  let standard = 0;
  const missing = new Map<string, FuelMissingRoute>();

  for (const job of jobs) {
    const { lookupSize, liters } = resolveStandard(job, litersByKey);
    if (liters != null) {
      standard += liters;
      continue;
    }
    const key = routeKey(lookupSize, job.pickupLocationId, job.factoryLocationId, job.returnLocationId);
    const route = missing.get(key) ?? {
      size: lookupSize,
      pickupLocationId: job.pickupLocationId,
      factoryLocationId: job.factoryLocationId,
      returnLocationId: job.returnLocationId,
      jobNumbers: [],
    };
    route.jobNumbers.push(job.jobNumber);
    missing.set(key, route);
  }

  const status: FuelSegmentStatus = noPreviousFill
    ? "no_previous_fill"
    : missing.size > 0
      ? "missing_standard"
      : "ok";
  const complete = status === "ok";

  return {
    startDate: jobs[0].jobDate,
    endDate: closing.jobDate,
    closingJobNumber: closing.jobNumber,
    jobCount: jobs.length,
    actualLiters: actual,
    standardLiters: complete ? round2(standard) : null,
    diffLiters: complete ? round2(actual - standard) : null,
    status,
    missingRoutes: [...missing.values()],
  };
}

/**
 * ตัด job ของรถหนึ่งคันเป็นช่วงตามจุดเติม (เติมเต็มถังทุกครั้ง) แล้วเทียบลิตรที่เติมกับมาตรฐานรวมของช่วง
 * ช่วง = job ถัดจากจุดเติมก่อนหน้า ถึงจุดเติมนี้ (รวมจุดเติมนี้)
 *
 * @param jobs เรียง jobDate, createdAt แล้ว — เริ่มที่ job ถัดจากจุดเติมก่อนหน้า (ถ้ามี)
 */
export function computeFuelSegments(
  jobs: FuelJob[],
  standards: FuelStandardEntry[],
  opts: { month: string; hasPreviousFill: boolean }
): FuelSegmentResult {
  const litersByKey = new Map(
    standards.map((s) => [
      routeKey(s.size, s.pickupLocationId, s.factoryLocationId, s.returnLocationId),
      s.liters,
    ])
  );

  const segments: FuelSegment[] = [];
  let current: FuelJob[] = [];
  for (const job of jobs.filter(isFuelCountedJob)) {
    current.push(job);
    if (job.fuelLiters > 0) {
      segments.push(buildSegment(current, litersByKey, segments.length === 0 && !opts.hasPreviousFill));
      current = [];
    }
  }

  const inMonth = (date: string) => date.startsWith(opts.month);
  const monthSegments = segments.filter((s) => inMonth(s.endDate));
  const diffs = monthSegments.filter((s) => s.status === "ok").map((s) => s.diffLiters ?? 0);

  return {
    segments: monthSegments,
    pendingJobCount: current.filter((j) => inMonth(j.jobDate)).length,
    excessLiters: round2(diffs.reduce((sum, d) => sum + Math.max(0, d), 0)),
    netDiffLiters: round2(diffs.reduce((sum, d) => sum + d, 0)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/utils/__tests__/fuelSegments.test.ts`
Expected: PASS ทุก test (`# fail 0`)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/fuelSegments.ts lib/utils/__tests__/fuelSegments.test.ts
git commit -m "feat(fuel-standard): ตัวคำนวณน้ำมันเกินมาตรฐานรายช่วงเติม

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Validator สำหรับ import CSV

**Files:**
- Create: `lib/utils/fuelStandardImport.ts`
- Test: `lib/utils/__tests__/fuelStandardImport.test.ts`

**Interfaces:**
- Consumes: `SIZE_OPTIONS` จาก `@/types/job`
- Produces (ใช้ใน Task 4):
  - `interface FuelStandardImportRow { size?: string; pickupLocationName?: string; factoryLocationName?: string; returnLocationName?: string; liters?: string }`
  - `interface ImportLocation { id: string; name: string; type: string }`
  - `interface ImportValidationError { row: number; field: string; message: string }`
  - `interface ResolvedFuelStandardRow { size: string; pickupLocationId: string; factoryLocationId: string | null; returnLocationId: string; liters: number }`
  - `validateFuelStandardRows(rows: FuelStandardImportRow[], locations: ImportLocation[]): { errors: ImportValidationError[]; resolved: ResolvedFuelStandardRow[] }`

- [ ] **Step 1: Write the failing test**

`lib/utils/__tests__/fuelStandardImport.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateFuelStandardRows, type FuelStandardImportRow } from '../fuelStandardImport'

const LOCS = [
  { id: 'p1', name: 'CMA/KM.18', type: 'general' },
  { id: 'f1', name: 'โรงงาน B', type: 'factory' },
  { id: 'r1', name: 'SYL', type: 'general' },
]

const row = (over: Partial<FuelStandardImportRow> = {}): FuelStandardImportRow => ({
  size: '40DC',
  pickupLocationName: 'CMA/KM.18',
  factoryLocationName: 'โรงงาน B',
  returnLocationName: 'SYL',
  liters: '300',
  ...over,
})

test('แถวถูกต้อง → resolve เป็น id และลิตรเป็นตัวเลข', () => {
  const r = validateFuelStandardRows([row()], LOCS)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.resolved, [
    { size: '40DC', pickupLocationId: 'p1', factoryLocationId: 'f1', returnLocationId: 'r1', liters: 300 },
  ])
})

test('โรงงานว่าง → factoryLocationId = null', () => {
  const r = validateFuelStandardRows([row({ factoryLocationName: undefined })], LOCS)
  assert.deepEqual(r.errors, [])
  assert.equal(r.resolved[0].factoryLocationId, null)
})

test('ไม่พบสถานที่ → error ไม่สร้างสถานที่ใหม่', () => {
  const r = validateFuelStandardRows([row({ pickupLocationName: 'CMA/KM18' })], LOCS)
  assert.deepEqual(r.errors, [{ row: 1, field: 'pickupLocationName', message: 'ไม่พบสถานที่ "CMA/KM18"' }])
  assert.equal(r.resolved.length, 0)
})

test('ชื่อในคอลัมน์โรงงานไม่ใช่ type factory → error', () => {
  const r = validateFuelStandardRows([row({ factoryLocationName: 'SYL' })], LOCS)
  assert.equal(r.errors[0].field, 'factoryLocationName')
  assert.equal(r.errors[0].message, '"SYL" ไม่ใช่สถานที่ประเภทโรงงาน')
})

test('SIZE ไม่อยู่ในรายการ / ขาดสถานที่รับ-คืนตู้ → error', () => {
  const r = validateFuelStandardRows(
    [row({ size: '99XX' }), row({ pickupLocationName: undefined, returnLocationName: undefined })],
    LOCS,
  )
  assert.deepEqual(
    r.errors.map((e) => [e.row, e.field]),
    [[1, 'size'], [2, 'pickupLocationName'], [2, 'returnLocationName']],
  )
})

test('ลิตรไม่ใช่ตัวเลข หรือติดลบ → error', () => {
  const r = validateFuelStandardRows([row({ liters: 'abc' }), row({ liters: '-5', size: '20DC' }), row({ liters: undefined, size: '20RF' })], LOCS)
  assert.deepEqual(r.errors.map((e) => e.row), [1, 2, 3])
  assert.ok(r.errors.every((e) => e.field === 'liters'))
})

test('key ซ้ำกันในไฟล์ → error ที่แถวหลัง', () => {
  const r = validateFuelStandardRows([row(), row({ liters: '310' })], LOCS)
  assert.deepEqual(r.errors, [{ row: 2, field: 'size', message: 'ข้อมูลซ้ำในไฟล์ (แถว 1, 2)' }])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/utils/__tests__/fuelStandardImport.test.ts`
Expected: FAIL — `Cannot find module '../fuelStandardImport'`

- [ ] **Step 3: Write implementation**

`lib/utils/fuelStandardImport.ts`:

```ts
import { SIZE_OPTIONS } from "@/types/job";

export interface FuelStandardImportRow {
  size?: string;
  pickupLocationName?: string;
  factoryLocationName?: string;
  returnLocationName?: string;
  liters?: string;
}

export interface ImportLocation {
  id: string;
  name: string;
  type: string;
}

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ResolvedFuelStandardRow {
  size: string;
  pickupLocationId: string;
  factoryLocationId: string | null;
  returnLocationId: string;
  liters: number;
}

/**
 * ตรวจแถว CSV และแปลงชื่อสถานที่เป็น id
 * ไม่สร้างสถานที่ใหม่ให้ (ต่างจาก import อัตราอื่น) — ชื่อพิมพ์ผิดจะได้สถานที่ซ้ำที่ไม่ match กับ job เงียบๆ
 */
export function validateFuelStandardRows(
  rows: FuelStandardImportRow[],
  locations: ImportLocation[]
): { errors: ImportValidationError[]; resolved: ResolvedFuelStandardRow[] } {
  const byName = new Map(locations.map((l) => [l.name, l]));
  const errors: ImportValidationError[] = [];
  const resolved: ResolvedFuelStandardRow[] = [];

  const keyOf = (r: FuelStandardImportRow) =>
    [r.size ?? "", r.pickupLocationName ?? "", r.factoryLocationName ?? "", r.returnLocationName ?? ""].join("|");
  const rowsByKey = new Map<string, number[]>();
  rows.forEach((r, i) => rowsByKey.set(keyOf(r), [...(rowsByKey.get(keyOf(r)) ?? []), i + 1]));

  rows.forEach((r, index) => {
    const rowNum = index + 1;
    const rowErrors: ImportValidationError[] = [];
    const err = (field: string, message: string) => rowErrors.push({ row: rowNum, field, message });

    if (!r.size) err("size", "กรุณาระบุ SIZE");
    else if (!(SIZE_OPTIONS as readonly string[]).includes(r.size)) err("size", `SIZE "${r.size}" ไม่ถูกต้อง`);

    const findLocation = (field: string, name: string | undefined, label: string) => {
      if (!name) {
        err(field, `กรุณาระบุ${label}`);
        return null;
      }
      const loc = byName.get(name);
      if (!loc) err(field, `ไม่พบสถานที่ "${name}"`);
      return loc ?? null;
    };
    const pickup = findLocation("pickupLocationName", r.pickupLocationName, "สถานที่รับตู้");
    const ret = findLocation("returnLocationName", r.returnLocationName, "สถานที่คืนตู้");

    let factory: ImportLocation | null = null;
    if (r.factoryLocationName) {
      factory = byName.get(r.factoryLocationName) ?? null;
      if (!factory) err("factoryLocationName", `ไม่พบสถานที่ "${r.factoryLocationName}"`);
      else if (factory.type !== "factory")
        err("factoryLocationName", `"${r.factoryLocationName}" ไม่ใช่สถานที่ประเภทโรงงาน`);
    }

    const liters = Number(r.liters);
    if (r.liters == null || r.liters === "" || Number.isNaN(liters) || liters < 0)
      err("liters", "ลิตรต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");

    const dups = rowsByKey.get(keyOf(r)) ?? [];
    if (dups.length > 1 && dups[0] !== rowNum) err("size", `ข้อมูลซ้ำในไฟล์ (แถว ${dups.join(", ")})`);

    // ตำแหน่ง error ให้เรียง field ตามคอลัมน์ในไฟล์ (size, รับตู้, โรงงาน, คืนตู้, ลิตร)
    const order = ["size", "pickupLocationName", "factoryLocationName", "returnLocationName", "liters"];
    rowErrors.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
    errors.push(...rowErrors);

    if (rowErrors.length === 0 && pickup && ret) {
      resolved.push({
        size: r.size!,
        pickupLocationId: pickup.id,
        factoryLocationId: factory?.id ?? null,
        returnLocationId: ret.id,
        liters,
      });
    }
  });

  return { errors, resolved };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/utils/__tests__/fuelStandardImport.test.ts`
Expected: PASS (`# fail 0`)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/fuelStandardImport.ts lib/utils/__tests__/fuelStandardImport.test.ts
git commit -m "feat(fuel-standard): ตรวจข้อมูล import CSV น้ำมันมาตรฐาน

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API — CRUD + import

**Files:**
- Create: `lib/utils/fuelStandardApi.ts`
- Create: `app/api/rates/fuel-standard/route.ts`
- Create: `app/api/rates/fuel-standard/[id]/route.ts`
- Create: `app/api/rates/fuel-standard/import/route.ts`

**Interfaces:**
- Consumes: `prisma.fuelStandard` (Task 1), `validateFuelStandardRows` + `FuelStandardImportRow` (Task 3)
- Produces (ใช้ใน Task 5, 6):
  - `GET /api/rates/fuel-standard` → `FuelStandardRecord[]` (`{ id, size, pickupLocationId, factoryLocationId, returnLocationId, liters: string, pickupLocation: {id,name}, factoryLocation: {id,name}|null, returnLocation: {id,name} }`)
  - `POST /api/rates/fuel-standard` body `{ size, pickupLocationId, factoryLocationId: string|null, returnLocationId, liters: number }` → 201 record | 400 | 409 `มีข้อมูลนี้อยู่แล้ว`
  - `PUT /api/rates/fuel-standard/[id]` body เดียวกัน → 200 | 400 | 404 | 409
  - `DELETE /api/rates/fuel-standard/[id]` → `{ success: true }` | 404
  - `POST /api/rates/fuel-standard/import` body `{ rows, validate?: boolean }` → validate: `{ valid, errors, totalRows }`; import: 201 `{ success: true, created }` | 400 `{ valid: false, errors, totalRows }`
  - ทุก route: 401 ไม่มี session, 403 ไม่ใช่ ADMIN

- [ ] **Step 1: Shared helpers** — `lib/utils/fuelStandardApi.ts`

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SIZE_OPTIONS } from "@/types/job";

export const DUPLICATE_FUEL_STANDARD_ERROR = "มีข้อมูลนี้อยู่แล้ว";

export const FUEL_STANDARD_INCLUDE = {
  pickupLocation: { select: { id: true, name: true } },
  factoryLocation: { select: { id: true, name: true } },
  returnLocation: { select: { id: true, name: true } },
} as const;

/** route น้ำมันมาตรฐานทุกตัวใช้ได้เฉพาะ ADMIN — คืน response ถ้าไม่ผ่าน, null ถ้าผ่าน */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }
  return null;
}

export interface FuelStandardInput {
  size: string;
  pickupLocationId: string;
  factoryLocationId: string | null;
  returnLocationId: string;
  liters: number;
}

export function parseFuelStandardInput(body: unknown): { data: FuelStandardInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const size = str(b.size);
  const pickupLocationId = str(b.pickupLocationId);
  const returnLocationId = str(b.returnLocationId);
  const factoryLocationId = str(b.factoryLocationId);
  const liters = typeof b.liters === "number" ? b.liters : Number(b.liters);

  if (!size || !pickupLocationId || !returnLocationId || b.liters == null || b.liters === "") {
    return { error: "กรุณากรอกข้อมูลให้ครบ" };
  }
  if (!(SIZE_OPTIONS as readonly string[]).includes(size)) return { error: `SIZE "${size}" ไม่ถูกต้อง` };
  if (Number.isNaN(liters) || liters < 0) return { error: "ลิตรต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" };

  return { data: { size, pickupLocationId, factoryLocationId, returnLocationId, liters } };
}

/** where ของ key 4 ตัว — โรงงานว่างต้องใช้ equals null เพราะ unique constraint กัน NULL ซ้ำไม่ได้ */
export function fuelStandardKeyWhere(input: Omit<FuelStandardInput, "liters">) {
  return {
    size: input.size,
    pickupLocationId: input.pickupLocationId,
    factoryLocationId: input.factoryLocationId === null ? { equals: null } : input.factoryLocationId,
    returnLocationId: input.returnLocationId,
  };
}

export async function findDuplicateFuelStandard(input: FuelStandardInput, excludeId?: string) {
  return prisma.fuelStandard.findFirst({
    where: { ...fuelStandardKeyWhere(input), ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
}

export const isPrismaNotFound = (error: unknown) =>
  (error as { code?: string } | null)?.code === "P2025";
```

- [ ] **Step 2: GET/POST** — `app/api/rates/fuel-standard/route.ts`

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DUPLICATE_FUEL_STANDARD_ERROR,
  FUEL_STANDARD_INCLUDE,
  findDuplicateFuelStandard,
  parseFuelStandardInput,
  requireAdmin,
} from "@/lib/utils/fuelStandardApi";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const rows = await prisma.fuelStandard.findMany({
    include: FUEL_STANDARD_INCLUDE,
    orderBy: [{ size: "asc" }, { pickupLocation: { name: "asc" } }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const parsed = parseFuelStandardInput(await req.json());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (await findDuplicateFuelStandard(parsed.data)) {
      return NextResponse.json({ error: DUPLICATE_FUEL_STANDARD_ERROR }, { status: 409 });
    }

    const row = await prisma.fuelStandard.create({ data: parsed.data, include: FUEL_STANDARD_INCLUDE });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
```

- [ ] **Step 3: PUT/DELETE** — `app/api/rates/fuel-standard/[id]/route.ts`

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DUPLICATE_FUEL_STANDARD_ERROR,
  FUEL_STANDARD_INCLUDE,
  findDuplicateFuelStandard,
  isPrismaNotFound,
  parseFuelStandardInput,
  requireAdmin,
} from "@/lib/utils/fuelStandardApi";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const parsed = parseFuelStandardInput(await req.json());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (await findDuplicateFuelStandard(parsed.data, id)) {
      return NextResponse.json({ error: DUPLICATE_FUEL_STANDARD_ERROR }, { status: 409 });
    }

    const row = await prisma.fuelStandard.update({
      where: { id },
      data: parsed.data,
      include: FUEL_STANDARD_INCLUDE,
    });
    return NextResponse.json(row);
  } catch (error) {
    if (isPrismaNotFound(error)) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    await prisma.fuelStandard.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isPrismaNotFound(error)) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Import** — `app/api/rates/fuel-standard/import/route.ts`

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fuelStandardKeyWhere, requireAdmin } from "@/lib/utils/fuelStandardApi";
import { validateFuelStandardRows, type FuelStandardImportRow } from "@/lib/utils/fuelStandardImport";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { rows, validate } = (await req.json()) as { rows?: FuelStandardImportRow[]; validate?: boolean };
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "ไม่พบข้อมูลสำหรับ import" }, { status: 400 });
    }

    const locations = await prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true },
    });
    const { errors, resolved } = validateFuelStandardRows(rows, locations);

    if (validate) {
      return NextResponse.json({ valid: errors.length === 0, errors, totalRows: rows.length });
    }
    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors, totalRows: rows.length }, { status: 400 });
    }

    // key ซ้ำของเดิม → อัปเดตลิตร; ทั้งไฟล์สำเร็จหรือไม่สำเร็จพร้อมกัน
    await prisma.$transaction(async (tx) => {
      for (const r of resolved) {
        const existing = await tx.fuelStandard.findFirst({ where: fuelStandardKeyWhere(r), select: { id: true } });
        if (existing) await tx.fuelStandard.update({ where: { id: existing.id }, data: { liters: r.liters } });
        else await tx.fuelStandard.create({ data: r });
      }
    });

    return NextResponse.json({ success: true, created: resolved.length }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ import" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Type check + lint**

Run: `npx tsc --noEmit && npx next lint --dir app/api/rates/fuel-standard --dir lib/utils`
Expected: ไม่มี error (e2e ของ API อยู่ใน Task 6)

- [ ] **Step 6: Commit** (รัน detect-changes ก่อนตาม Global Constraints)

```bash
git add lib/utils/fuelStandardApi.ts app/api/rates/fuel-standard
git commit -m "feat(fuel-standard): API ตั้งค่าและ import น้ำมันมาตรฐาน (ADMIN เท่านั้น)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: หน้าตั้งค่า + เมนู

**Files:**
- Create: `components/jobs/FuelStandardFormModal.tsx`
- Create: `components/jobs/FuelStandardManager.tsx`
- Create: `app/(protected)/jobs/settings/fuel-standard/page.tsx`
- Modify: `components/ProtectedLayoutClient.tsx` (~line 58 selectedKey, ~line 119 เมนู)

**Interfaces:**
- Consumes: API จาก Task 4, `ImportCSVModal` props (`open, title, apiEndpoint, headers, headerLabels, exampleRow, templateFileName, onClose, onSuccess`), `Location` type, `SIZE_OPTIONS`
- Produces (ใช้ใน Task 8):
  - `export interface FuelStandardRecord` (shape ของ GET)
  - `export interface FuelStandardFormValues { size?: string; pickupLocationId?: string; factoryLocationId?: string | null; returnLocationId?: string; liters?: number }`
  - `export default function FuelStandardFormModal(props: { open: boolean; editing: FuelStandardRecord | null; initialValues?: FuelStandardFormValues; onClose: () => void; onSaved: () => void })`
  - test ids: Select `#fuel-standard-size`, `#fuel-standard-pickup`, `#fuel-standard-factory`, `#fuel-standard-return`; `fuel-standard-liters-input`, `fuel-standard-submit-btn`, `fuel-standard-add-btn`, `fuel-standard-edit-btn-${id}`, `fuel-standard-delete-btn-${id}`

- [ ] **Step 1: GitNexus impact ของเมนู**

Run: `node .gitnexus/run.cjs impact "ProtectedLayoutClient" --direction upstream --repo .`
ถ้าได้ `UNKNOWN` ให้ยืนยันด้วย `grep -rn "ProtectedLayoutClient" app components` (ใช้แค่ใน `app/(protected)/layout.tsx`) — การเพิ่ม menu item เป็น additive

- [ ] **Step 2: `components/jobs/FuelStandardFormModal.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal, Form, Select, InputNumber, App } from 'antd'
import type { Location } from '@/types/job'
import { SIZE_OPTIONS } from '@/types/job'

export interface FuelStandardRecord {
  id: string
  size: string
  pickupLocationId: string
  factoryLocationId: string | null
  returnLocationId: string
  liters: number | string
  pickupLocation: { id: string; name: string }
  factoryLocation: { id: string; name: string } | null
  returnLocation: { id: string; name: string }
}

export interface FuelStandardFormValues {
  size?: string
  pickupLocationId?: string
  factoryLocationId?: string | null
  returnLocationId?: string
  liters?: number
}

interface Props {
  open: boolean
  /** null = เพิ่มใหม่ */
  editing: FuelStandardRecord | null
  /** ค่าตั้งต้นตอนเพิ่มใหม่ — ใช้กับ quick-add จากหน้าสรุป */
  initialValues?: FuelStandardFormValues
  onClose: () => void
  onSaved: () => void
}

const filterByLabel = (input: string, option?: { label?: string }) =>
  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())

export default function FuelStandardFormModal({ open, editing, initialValues, onClose, onSaved }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FuelStandardFormValues>()
  const [locations, setLocations] = useState<Location[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/locations')
      .then((res) => (res.ok ? res.json() : []))
      .then(setLocations)
      .catch(() => setLocations([]))
  }, [open])

  // ตั้งค่าฟอร์มเฉพาะตอนเปิด — ถ้าผูกกับ initialValues ตรงๆ object ใหม่ทุก render จะล้างค่าที่กำลังพิมพ์
  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue(
      editing
        ? {
            size: editing.size,
            pickupLocationId: editing.pickupLocationId,
            factoryLocationId: editing.factoryLocationId,
            returnLocationId: editing.returnLocationId,
            liters: Number(editing.liters),
          }
        : initialValues ?? {},
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const locationOptions = useMemo(() => locations.map((l) => ({ value: l.id, label: l.name })), [locations])
  const factoryOptions = useMemo(
    () => locations.filter((l) => l.type === 'factory').map((l) => ({ value: l.id, label: l.name })),
    [locations],
  )
  const sizeOptions = SIZE_OPTIONS.map((s) => ({ value: s, label: s }))

  const handleSubmit = async (values: FuelStandardFormValues) => {
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/rates/fuel-standard/${editing.id}` : '/api/rates/fuel-standard', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, factoryLocationId: values.factoryLocationId ?? null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        message.error(err.error || 'เกิดข้อผิดพลาด')
        return
      }
      message.success(editing ? 'แก้ไขสำเร็จ' : 'เพิ่มสำเร็จ')
      onSaved()
      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'แก้ไขน้ำมันมาตรฐาน' : 'เพิ่มน้ำมันมาตรฐาน'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      okText={editing ? 'บันทึก' : 'เพิ่ม'}
      cancelText="ยกเลิก"
      okButtonProps={{ 'data-testid': 'fuel-standard-submit-btn' } as Record<string, string>}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="size" label="SIZE" rules={[{ required: true, message: 'กรุณาเลือก SIZE' }]}>
          <Select id="fuel-standard-size" showSearch options={sizeOptions} placeholder="เลือก SIZE" />
        </Form.Item>
        <Form.Item name="pickupLocationId" label="สถานที่รับตู้" rules={[{ required: true, message: 'กรุณาเลือกสถานที่รับตู้' }]}>
          <Select id="fuel-standard-pickup" showSearch options={locationOptions} filterOption={filterByLabel} placeholder="เลือกสถานที่รับตู้" />
        </Form.Item>
        <Form.Item name="factoryLocationId" label="โรงงาน" extra="ปล่อยว่างได้ สำหรับงานทอยที่ไม่มีโรงงาน">
          <Select id="fuel-standard-factory" showSearch allowClear options={factoryOptions} filterOption={filterByLabel} placeholder="ไม่ระบุโรงงาน" />
        </Form.Item>
        <Form.Item name="returnLocationId" label="สถานที่คืนตู้" rules={[{ required: true, message: 'กรุณาเลือกสถานที่คืนตู้' }]}>
          <Select id="fuel-standard-return" showSearch options={locationOptions} filterOption={filterByLabel} placeholder="เลือกสถานที่คืนตู้" />
        </Form.Item>
        <Form.Item name="liters" label="ลิตร" rules={[{ required: true, message: 'กรุณากรอกจำนวนลิตร' }]}>
          <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0" data-testid="fuel-standard-liters-input" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
```

- [ ] **Step 3: `components/jobs/FuelStandardManager.tsx`**

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Button, Select, App, Space, Row, Col } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons'
import ImportCSVModal from './ImportCSVModal'
import FuelStandardFormModal, { type FuelStandardRecord } from './FuelStandardFormModal'
import { SIZE_OPTIONS } from '@/types/job'

const CSV_HEADERS = ['size', 'pickupLocationName', 'factoryLocationName', 'returnLocationName', 'liters']

export default function FuelStandardManager() {
  const { message, modal } = App.useApp()
  const [rows, setRows] = useState<FuelStandardRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FuelStandardRecord | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [filterSize, setFilterSize] = useState<string | undefined>()
  const [filterLocation, setFilterLocation] = useState<string | undefined>()

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rates/fuel-standard')
      if (res.ok) setRows(await res.json())
      else message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => { fetchRows() }, [fetchRows])

  // filter สถานที่ — ค้นทั้งรับตู้ โรงงาน คืนตู้ จากสถานที่ที่ถูกใช้อยู่ในตาราง
  const locationOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const r of rows) {
      byId.set(r.pickupLocation.id, r.pickupLocation.name)
      if (r.factoryLocation) byId.set(r.factoryLocation.id, r.factoryLocation.name)
      byId.set(r.returnLocation.id, r.returnLocation.name)
    }
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'th'))
  }, [rows])

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (filterSize && r.size !== filterSize) return false
        if (
          filterLocation &&
          ![r.pickupLocationId, r.factoryLocationId, r.returnLocationId].includes(filterLocation)
        )
          return false
        return true
      }),
    [rows, filterSize, filterLocation],
  )

  const openForm = (record: FuelStandardRecord | null) => {
    setEditing(record)
    setFormOpen(true)
  }

  const handleDelete = (record: FuelStandardRecord) => {
    modal.confirm({
      title: 'ยืนยันการลบ',
      content: `${record.size} · ${record.pickupLocation.name} → ${record.factoryLocation?.name ?? '-'} → ${record.returnLocation.name}`,
      okText: 'ลบ',
      okButtonProps: { danger: true },
      cancelText: 'ยกเลิก',
      onOk: async () => {
        const res = await fetch(`/api/rates/fuel-standard/${record.id}`, { method: 'DELETE' })
        if (res.ok) {
          message.success('ลบสำเร็จ')
          fetchRows()
        } else {
          message.error((await res.json().catch(() => ({}))).error || 'เกิดข้อผิดพลาด')
        }
      },
    })
  }

  // ไม่มีแถว label ภาษาไทย — แก้ไฟล์แล้ว import กลับได้ทันที
  const handleExport = () => {
    const lines = filteredRows.map((r) =>
      [r.size, r.pickupLocation.name, r.factoryLocation?.name ?? '', r.returnLocation.name, Number(r.liters)].join(','),
    )
    const csv = [CSV_HEADERS.join(','), ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'fuel_standard.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const columns = [
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 90 },
    { title: 'สถานที่รับตู้', key: 'pickup', render: (_: unknown, r: FuelStandardRecord) => r.pickupLocation.name },
    { title: 'โรงงาน', key: 'factory', render: (_: unknown, r: FuelStandardRecord) => r.factoryLocation?.name ?? '-' },
    { title: 'สถานที่คืนตู้', key: 'return', render: (_: unknown, r: FuelStandardRecord) => r.returnLocation.name },
    {
      title: 'ลิตร', dataIndex: 'liters', key: 'liters', width: 110, align: 'right' as const,
      render: (v: number | string) => Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    {
      title: 'จัดการ', key: 'actions', width: 90,
      render: (_: unknown, r: FuelStandardRecord) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} data-testid={`fuel-standard-edit-btn-${r.id}`} />
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} data-testid={`fuel-standard-delete-btn-${r.id}`} />
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>น้ำมันมาตรฐาน</h2>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport}>Export CSV</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)} data-testid="fuel-standard-add-btn">เพิ่ม</Button>
        </Space>
      </div>

      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select allowClear placeholder="SIZE" style={{ width: 110 }}
            options={SIZE_OPTIONS.map((s) => ({ value: s, label: s }))}
            value={filterSize} onChange={setFilterSize} />
        </Col>
        <Col>
          <Select allowClear showSearch placeholder="สถานที่" style={{ width: 220 }} popupMatchSelectWidth={false}
            options={locationOptions}
            filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={filterLocation} onChange={setFilterLocation} />
        </Col>
      </Row>

      <Table columns={columns} dataSource={filteredRows} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <FuelStandardFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={fetchRows}
      />

      <ImportCSVModal
        open={importOpen}
        title="Import น้ำมันมาตรฐาน"
        apiEndpoint="/api/rates/fuel-standard/import"
        headers={CSV_HEADERS}
        headerLabels={{
          size: 'SIZE',
          pickupLocationName: 'สถานที่รับตู้',
          factoryLocationName: 'โรงงาน',
          returnLocationName: 'สถานที่คืนตู้',
          liters: 'ลิตร',
        }}
        optionalHeaders={['factoryLocationName']}
        exampleRow={['40DC', 'CMA/KM.18', 'โรงงาน B', 'SYL', '300']}
        templateFileName="fuel_standard_template.csv"
        onClose={() => setImportOpen(false)}
        onSuccess={fetchRows}
      />
    </>
  )
}
```

- [ ] **Step 4: Page** — `app/(protected)/jobs/settings/fuel-standard/page.tsx`

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { App } from 'antd'
import FuelStandardManager from '@/components/jobs/FuelStandardManager'

export default async function FuelStandardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  if (!isAdmin) redirect('/jobs')

  return (
    <App>
      <FuelStandardManager />
    </App>
  )
}
```

- [ ] **Step 5: เมนู** — `components/ProtectedLayoutClient.tsx`

ใน `getSelectedKey` เพิ่มบรรทัดใหม่ **ก่อน** บรรทัด `if (pathname?.startsWith("/jobs/settings/fuel-price")) ...`:

```ts
    if (pathname?.startsWith("/jobs/settings/fuel-standard")) return "jobs-fuel-standard";
```

ในกลุ่ม `isAdmin || isManager` เพิ่มต่อจากบรรทัด `jobs-fuel-price`:

```tsx
            { key: "jobs-fuel-standard", label: <Link href="/jobs/settings/fuel-standard">น้ำมันมาตรฐาน</Link> },
```

- [ ] **Step 6: Type check + lint + ลองเปิดหน้า**

Run: `npx tsc --noEmit && npx next lint --dir components/jobs --dir app`
Expected: ไม่มี error
แล้วรัน `make dev` เปิด `http://localhost:3027/jobs/settings/fuel-standard` ด้วย ADMIN เพิ่ม/แก้/ลบ 1 รายการได้ (ใช้ staging DB — **ต้องไม่ทำ** ถ้า `fuel_standard` ยังไม่ถูก push ไป stag; ให้ข้ามไปเชื่อ e2e ใน Task 6 แทน)

- [ ] **Step 7: Commit** (detect-changes ก่อน)

```bash
git add components/jobs/FuelStandardFormModal.tsx components/jobs/FuelStandardManager.tsx "app/(protected)/jobs/settings/fuel-standard" components/ProtectedLayoutClient.tsx
git commit -m "feat(fuel-standard): หน้าตั้งค่าน้ำมันมาตรฐานพร้อม import/export CSV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: E2E หน้าตั้งค่า + API

**Files:**
- Create: `e2e/scripts/cleanup-fuel-standard.ts`
- Create: `e2e/jobs/fuel-standard.spec.ts`

**Interfaces:**
- Consumes: test ids จาก Task 5, API จาก Task 4, user `testadmin` / `testmanager` (รหัส `admin123`) จาก `e2e/scripts/seed.ts`
- Produces: `cleanup-fuel-standard.ts` ลบ: `FuelStandard` ที่อ้างสถานที่ชื่อขึ้นต้น `E2E_FUEL`, job/entry/leave ของคนขับ `Fuel Summary Driver`, คนขับนั้น, สถานที่ `E2E_FUEL*` (Task 9 ใช้ด้วย)

- [ ] **Step 1: Cleanup script** — `e2e/scripts/cleanup-fuel-standard.ts`

```ts
import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const locations = await prisma.location.findMany({ where: { name: { startsWith: 'E2E_FUEL' } } })
  const ids = locations.map((l) => l.id)

  // มาตรฐานอ้างสถานที่ด้วย FK — ต้องลบก่อนสถานที่
  await prisma.fuelStandard.deleteMany({
    where: {
      OR: [
        { pickupLocationId: { in: ids } },
        { factoryLocationId: { in: ids } },
        { returnLocationId: { in: ids } },
      ],
    },
  })

  const drivers = await prisma.driver.findMany({ where: { name: 'Fuel Summary Driver' } })
  for (const driver of drivers) {
    await prisma.driverMonthlyEntry.deleteMany({ where: { driverId: driver.id } })
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }

  await prisma.location.deleteMany({ where: { id: { in: ids } } })
  console.log(`🧹 [Playwright] ลบข้อมูลน้ำมันมาตรฐาน (สถานที่ ${ids.length}, คนขับ ${drivers.length})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Spec** — `e2e/jobs/fuel-standard.spec.ts`

```ts
import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

async function login(page: Page, username = 'testadmin') {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs|\/line-images/, { timeout: 10_000 })
}

// antd Select showSearch: id อยู่บน search input — คลิก wrapper เปิด dropdown แล้วพิมพ์ค้น
async function selectOption(page: Page, selectId: string, text: string) {
  const input = page.locator(`#${selectId}`)
  await input.locator('..').locator('..').click()
  await input.fill(text)
  const dropdown = page.locator('.ant-select-dropdown').filter({ has: page.locator(`[id="${selectId}_list"]`) })
  await dropdown.locator('.ant-select-item-option-content', { hasText: text }).first().click()
}

/** สร้างสถานที่ทดสอบ 3 แห่ง — suffix กันชื่อซ้ำระหว่าง test */
async function seedLocations(page: Page, suffix: string) {
  const make = async (name: string, type: 'general' | 'factory') => {
    const res = await page.request.post('/api/locations', { data: { name, type } })
    if (!res.ok()) throw new Error(`create location ${name} failed — ${await res.text()}`)
    return ((await res.json()) as { id: string }).id
  }
  const names = {
    pickup: `E2E_FUEL_PICK_${suffix}`,
    factory: `E2E_FUEL_FAC_${suffix}`,
    ret: `E2E_FUEL_RET_${suffix}`,
  }
  return {
    names,
    pickupId: await make(names.pickup, 'general'),
    factoryId: await make(names.factory, 'factory'),
    returnId: await make(names.ret, 'general'),
  }
}

function cleanup() {
  execSync('npx tsx e2e/scripts/cleanup-fuel-standard.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

test.describe.serial('น้ำมันมาตรฐาน', () => {
  test.afterEach(() => cleanup())

  test('Case 1: เพิ่มผ่านหน้าจอ → แสดงในตาราง', async ({ page }) => {
    await login(page)
    const { names } = await seedLocations(page, 'C1')
    await page.goto('/jobs/settings/fuel-standard')

    await expect(async () => {
      await page.getByTestId('fuel-standard-add-btn').click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })

    await selectOption(page, 'fuel-standard-size', '40DC')
    await selectOption(page, 'fuel-standard-pickup', names.pickup)
    await selectOption(page, 'fuel-standard-factory', names.factory)
    await selectOption(page, 'fuel-standard-return', names.ret)
    await page.getByTestId('fuel-standard-liters-input').fill('300')
    await page.getByTestId('fuel-standard-submit-btn').click()

    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: names.pickup })
    await expect(row).toContainText(names.factory)
    await expect(row).toContainText('300.00')
  })

  test('Case 2: key ซ้ำ (รวมกรณีโรงงานว่าง) → 409', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C2')
    const body = { size: '20DC', pickupLocationId: loc.pickupId, factoryLocationId: null, returnLocationId: loc.returnId, liters: 100 }

    expect((await page.request.post('/api/rates/fuel-standard', { data: body })).status()).toBe(201)
    const dup = await page.request.post('/api/rates/fuel-standard', { data: { ...body, liters: 120 } })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('มีข้อมูลนี้อยู่แล้ว')

    // โรงงานต่างกัน = คนละ key
    const other = await page.request.post('/api/rates/fuel-standard', { data: { ...body, factoryLocationId: loc.factoryId } })
    expect(other.status()).toBe(201)
  })

  test('Case 3: แก้ลิตร → ค่าใหม่ในตาราง', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C3')
    const res = await page.request.post('/api/rates/fuel-standard', {
      data: { size: '40DC', pickupLocationId: loc.pickupId, factoryLocationId: loc.factoryId, returnLocationId: loc.returnId, liters: 300 },
    })
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/fuel-standard')
    await expect(async () => {
      await page.getByTestId(`fuel-standard-edit-btn-${id}`).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })
    await page.getByTestId('fuel-standard-liters-input').fill('320')
    await page.getByTestId('fuel-standard-submit-btn').click()

    await expect(page.getByText('แก้ไขสำเร็จ')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: loc.names.pickup })).toContainText('320.00')
  })

  test('Case 4: ลบผ่าน modal.confirm → หายจากตาราง', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C4')
    const res = await page.request.post('/api/rates/fuel-standard', {
      data: { size: '40DC', pickupLocationId: loc.pickupId, factoryLocationId: null, returnLocationId: loc.returnId, liters: 50 },
    })
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/fuel-standard')
    await page.getByTestId(`fuel-standard-delete-btn-${id}`).click()
    await page.getByRole('dialog').getByRole('button', { name: 'ลบ' }).click()

    await expect(page.getByText('ลบสำเร็จ')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: loc.names.pickup })).toHaveCount(0)
  })

  test('Case 5: import — validate จับสถานที่ไม่พบ/ซ้ำในไฟล์, import ซ้ำ key เดิมอัปเดตลิตร', async ({ page }) => {
    await login(page)
    const { names } = await seedLocations(page, 'C5')
    const good = { size: '40DC', pickupLocationName: names.pickup, factoryLocationName: names.factory, returnLocationName: names.ret, liters: '300' }

    const bad = await page.request.post('/api/rates/fuel-standard/import', {
      data: { validate: true, rows: [good, { ...good, pickupLocationName: 'E2E_FUEL_NOPE' }, { ...good }] },
    })
    const badBody = await bad.json()
    expect(badBody.valid).toBe(false)
    expect(badBody.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, message: 'ไม่พบสถานที่ "E2E_FUEL_NOPE"' }),
        expect.objectContaining({ row: 3, message: 'ข้อมูลซ้ำในไฟล์ (แถว 1, 3)' }),
      ]),
    )

    expect((await page.request.post('/api/rates/fuel-standard/import', { data: { rows: [good] } })).status()).toBe(201)
    expect((await page.request.post('/api/rates/fuel-standard/import', { data: { rows: [{ ...good, liters: '333' }] } })).status()).toBe(201)

    const list = (await (await page.request.get('/api/rates/fuel-standard')).json()) as { pickupLocation: { name: string }; liters: string }[]
    const mine = list.filter((r) => r.pickupLocation.name === names.pickup)
    expect(mine).toHaveLength(1)
    expect(Number(mine[0].liters)).toBe(333)
  })

  test('Case 6: MANAGER เรียก API ได้ 403 และเข้าหน้าตรงๆ ถูก redirect', async ({ page }) => {
    await login(page, 'testmanager')
    expect((await page.request.get('/api/rates/fuel-standard')).status()).toBe(403)
    await page.goto('/jobs/settings/fuel-standard')
    await expect(page).not.toHaveURL(/fuel-standard/)
  })
})
```

- [ ] **Step 3: Run e2e**

Run: `docker start syl-e2e-db >/dev/null; npx playwright test e2e/jobs/fuel-standard.spec.ts --workers=1`
Expected: 6 passed

- [ ] **Step 4: Commit**

```bash
git add e2e/scripts/cleanup-fuel-standard.ts e2e/jobs/fuel-standard.spec.ts
git commit -m "test(fuel-standard): e2e หน้าตั้งค่าและ API น้ำมันมาตรฐาน

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ข้อมูลน้ำมันมาตรฐานใน summary API

**Files:**
- Modify: `types/job.ts` (หลัง `interface DriverMonthlySummary` ~line 297-336)
- Create: `lib/utils/fuelSegmentsQuery.ts`
- Modify: `lib/utils/summaryQuery.ts` (signature `buildMonthSummaries` line 6-9 และ `return drivers.map(...)` ท้ายไฟล์)
- Modify: `app/api/summary/[driverId]/route.ts:39`

**Interfaces:**
- Consumes: `computeFuelSegments`, `totalFuelLiters`, `FUEL_EXCLUDED_JOB_TYPES`, `FuelJob`, `FuelStandardEntry`, `FuelSegmentStatus` (Task 2)
- Produces (ใช้ใน Task 8):
  - `types/job.ts`:
    ```ts
    export interface FuelMissingRouteView { size: string|null; pickupLocationId: string|null; pickupLocationName: string|null; factoryLocationId: string|null; factoryLocationName: string|null; returnLocationId: string|null; returnLocationName: string|null; jobNumbers: string[] }
    export interface FuelSegmentView { startDate: string; endDate: string; closingJobNumber: string; jobCount: number; actualLiters: number; standardLiters: number|null; diffLiters: number|null; status: "ok"|"missing_standard"|"no_previous_fill"; missingRoutes: FuelMissingRouteView[] }
    export interface FuelStandardSummary { excessLiters: number; netDiffLiters: number; segments: FuelSegmentView[]; pendingJobCount: number }
    // ใน DriverMonthlySummary:
    fuelStandard?: FuelStandardSummary | null
    ```
  - `buildFuelStandardSummaries(month: string, driverIds: string[]): Promise<Map<string, FuelStandardSummary>>`
  - `buildMonthSummaries(month, driverIds?, opts?: { includeFuelStandard?: boolean })`

- [ ] **Step 1: GitNexus impact**

Run: `node .gitnexus/run.cjs impact "buildMonthSummaries" --direction upstream --repo .`
Expected: risk **HIGH** (ผู้เรียก 3 route: `/api/summary`, `/api/summary/[driverId]`, `/api/summary/export`) — **แจ้งผู้ใช้** ว่าการเปลี่ยนเป็น additive: parameter ใหม่เป็น optional default false, `fuelStandard` เป็น optional field → ผู้เรียกเดิมได้ผลเหมือนเดิมทุกไบต์

- [ ] **Step 2: Types** — `types/job.ts` เพิ่มก่อน `export interface DriverMonthlySummary`:

```ts
/** เส้นทางที่ยังไม่มีน้ำมันมาตรฐาน — ชื่อสถานที่ resolve ฝั่ง server ไว้แสดงและทำ quick-add */
export interface FuelMissingRouteView {
  size: string | null;
  pickupLocationId: string | null;
  pickupLocationName: string | null;
  factoryLocationId: string | null;
  factoryLocationName: string | null;
  returnLocationId: string | null;
  returnLocationName: string | null;
  jobNumbers: string[];
}

/** หนึ่งช่วงเติมน้ำมัน (จากจุดเติมก่อนหน้าถึงจุดเติมนี้) */
export interface FuelSegmentView {
  startDate: string;          // 'YYYY-MM-DD'
  endDate: string;            // วันของจุดเติมที่ปิดช่วง
  closingJobNumber: string;
  jobCount: number;
  actualLiters: number;
  standardLiters: number | null;
  diffLiters: number | null;  // ใช้จริง − มาตรฐาน
  status: "ok" | "missing_standard" | "no_previous_fill";
  missingRoutes: FuelMissingRouteView[];
}

/** น้ำมันเกินมาตรฐานของเดือน — ลิตรเท่านั้น ไม่คิดเงิน */
export interface FuelStandardSummary {
  excessLiters: number;       // Σ ส่วนต่างที่ > 0
  netDiffLiters: number;      // Σ ส่วนต่างทุกช่วง
  segments: FuelSegmentView[];
  pendingJobCount: number;    // job หลังเติมครั้งล่าสุด ยังรอปิดช่วง
}
```

และใน `DriverMonthlySummary` ต่อจาก `baseSalary: number | null;  // เงินเดือน`:

```ts

  /**
   * น้ำมันเกินมาตรฐาน — มีเฉพาะเมื่อเรียก buildMonthSummaries ด้วย includeFuelStandard
   * null = รถก๊าซ (ไม่คำนวณ)
   */
  fuelStandard?: FuelStandardSummary | null;
```

- [ ] **Step 3: Query module** — `lib/utils/fuelSegmentsQuery.ts`

```ts
import { prisma } from "@/lib/prisma";
import {
  computeFuelSegments,
  totalFuelLiters,
  FUEL_EXCLUDED_JOB_TYPES,
  type FuelJob,
  type FuelSegmentResult,
  type FuelStandardEntry,
} from "@/lib/utils/fuelSegments";
import type { FuelStandardSummary } from "@/types/job";

const num = (v: { toString(): string } | null) => (v != null ? Number(v) : null);

/** job ที่นับเป็นจุดเติม — ช่องลิตรใดช่องหนึ่ง > 0 และไม่ใช่ job ที่ถูกข้าม */
const FILL_WHERE = {
  isCancelled: false,
  jobType: { notIn: [...FUEL_EXCLUDED_JOB_TYPES] },
  OR: [{ fuelOfficeLiters: { gt: 0 } }, { fuelCashLiters: { gt: 0 } }, { fuelCreditLiters: { gt: 0 } }],
};

async function computeForDriver(
  driverId: string,
  month: string,
  monthStart: Date,
  monthEnd: Date,
  standards: FuelStandardEntry[]
): Promise<FuelSegmentResult> {
  // ช่วงแรกของเดือนเริ่มหลังจุดเติมล่าสุดก่อนต้นเดือน — ต้องย้อนไปหาก่อน
  const prevFill = await prisma.job.findFirst({
    where: { driverId, jobDate: { lt: monthStart }, ...FILL_WHERE },
    orderBy: [{ jobDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, jobDate: true },
  });

  const rows = await prisma.job.findMany({
    where: { driverId, jobDate: { gte: prevFill?.jobDate ?? monthStart, lt: monthEnd } },
    orderBy: [{ jobDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      jobNumber: true,
      jobDate: true,
      jobType: true,
      isCancelled: true,
      size: true,
      pickupLocationId: true,
      factoryLocationId: true,
      returnLocationId: true,
      fuelOfficeLiters: true,
      fuelCashLiters: true,
      fuelCreditLiters: true,
      pairLinkAsPrimary: { select: { id: true } },
      pairLinkAsSecondary: { select: { id: true } },
    },
  });

  // ตัดด้วยตำแหน่งของจุดเติม ไม่ใช่วันที่ — วันเดียวกันอาจมี job ที่สร้างก่อนจุดเติม
  const start = prevFill ? rows.findIndex((r) => r.id === prevFill.id) + 1 : 0;
  const jobs: FuelJob[] = rows.slice(start).map((r) => ({
    id: r.id,
    jobNumber: r.jobNumber,
    jobDate: r.jobDate.toISOString().slice(0, 10),
    jobType: r.jobType,
    isCancelled: r.isCancelled,
    size: r.size,
    pickupLocationId: r.pickupLocationId,
    factoryLocationId: r.factoryLocationId,
    returnLocationId: r.returnLocationId,
    fuelLiters: totalFuelLiters({
      fuelOfficeLiters: num(r.fuelOfficeLiters),
      fuelCashLiters: num(r.fuelCashLiters),
      fuelCreditLiters: num(r.fuelCreditLiters),
    }),
    pairRole: r.pairLinkAsPrimary ? "primary" : r.pairLinkAsSecondary ? "secondary" : null,
  }));

  return computeFuelSegments(jobs, standards, { month, hasPreviousFill: !!prevFill });
}

/** น้ำมันเกินมาตรฐานของเดือนต่อคนขับ — คำนวณสดจาก job และตาราง fuel_standard */
export async function buildFuelStandardSummaries(
  month: string,
  driverIds: string[]
): Promise<Map<string, FuelStandardSummary>> {
  const result = new Map<string, FuelStandardSummary>();
  if (driverIds.length === 0) return result;

  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, mon - 1, 1));
  const monthEnd = new Date(Date.UTC(year, mon, 1));

  const standards: FuelStandardEntry[] = (await prisma.fuelStandard.findMany()).map((s) => ({
    size: s.size,
    pickupLocationId: s.pickupLocationId,
    factoryLocationId: s.factoryLocationId,
    returnLocationId: s.returnLocationId,
    liters: Number(s.liters),
  }));

  const perDriver = await Promise.all(
    driverIds.map(
      async (id) => [id, await computeForDriver(id, month, monthStart, monthEnd, standards)] as const
    )
  );

  const locationIds = new Set<string>();
  for (const [, r] of perDriver)
    for (const s of r.segments)
      for (const m of s.missingRoutes)
        for (const id of [m.pickupLocationId, m.factoryLocationId, m.returnLocationId]) if (id) locationIds.add(id);
  const locations = locationIds.size
    ? await prisma.location.findMany({ where: { id: { in: [...locationIds] } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(locations.map((l) => [l.id, l.name]));
  const name = (id: string | null) => (id ? nameById.get(id) ?? null : null);

  for (const [driverId, r] of perDriver) {
    result.set(driverId, {
      excessLiters: r.excessLiters,
      netDiffLiters: r.netDiffLiters,
      pendingJobCount: r.pendingJobCount,
      segments: r.segments.map((s) => ({
        ...s,
        missingRoutes: s.missingRoutes.map((m) => ({
          ...m,
          pickupLocationName: name(m.pickupLocationId),
          factoryLocationName: name(m.factoryLocationId),
          returnLocationName: name(m.returnLocationId),
        })),
      })),
    });
  }
  return result;
}
```

- [ ] **Step 4: `lib/utils/summaryQuery.ts`**

เพิ่ม import ด้านบน:

```ts
import { buildFuelStandardSummaries } from "@/lib/utils/fuelSegmentsQuery";
```

เปลี่ยน signature:

```ts
/** ดึงสรุปของคนขับหลายคนในเดือนเดียว — ใช้ร่วมกันโดย /api/summary และ /api/summary/[driverId] */
export async function buildMonthSummaries(
  month: string,
  driverIds?: string[],
  // น้ำมันมาตรฐานแสดงเฉพาะหน้ารายคน — list/export ไม่ต้องเสีย query เพิ่ม
  opts: { includeFuelStandard?: boolean } = {}
): Promise<DriverMonthlySummary[]> {
```

แทน `return drivers.map((driver) =>` ... `);` ท้ายไฟล์ ด้วยการเก็บผลไว้ก่อนแล้วเติม `fuelStandard`:

```ts
  const summaries = drivers.map((driver) =>
    calculateDriverSummary({
      // ... (เนื้อหาเดิมทั้งหมดไม่เปลี่ยน)
    })
  );

  if (!opts.includeFuelStandard) return summaries;

  // รถก๊าซไม่คิดน้ำมัน — ไม่ต้องคำนวณ
  const fuelByDriver = await buildFuelStandardSummaries(
    month,
    drivers.filter((d) => !d.isGasVehicle).map((d) => d.id)
  );
  return summaries.map((s) => ({ ...s, fuelStandard: fuelByDriver.get(s.driverId) ?? null }));
}
```

- [ ] **Step 5: Route** — `app/api/summary/[driverId]/route.ts:39`

```ts
      months.map((m) => buildMonthSummaries(m, [driverId], { includeFuelStandard: true }))
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx tsx --test lib/utils/__tests__/*.test.ts`
Expected: tsc ผ่าน, unit tests เดิม + ใหม่ผ่านทั้งหมด (`summaryCalculator.test.ts` ต้องไม่พัง)

- [ ] **Step 7: Commit** (detect-changes ก่อน — ต้องเห็น `buildMonthSummaries` ใน affected symbols)

```bash
git add types/job.ts lib/utils/fuelSegmentsQuery.ts lib/utils/summaryQuery.ts "app/api/summary/[driverId]/route.ts"
git commit -m "feat(summary): คำนวณน้ำมันเกินมาตรฐานรายช่วงในสรุปรายคน

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: UI หน้าสรุป — แถวในการ์ด + modal รายละเอียดช่วง

**Files:**
- Create: `components/summary/FuelSegmentsModal.tsx`
- Modify: `components/summary/SummaryDetail.tsx` (`SummaryRow` line 20-66, `MonthCard` line 74-251, render site ~line 415, state ใน `SummaryDetail`)

**Interfaces:**
- Consumes: `FuelStandardSummary`, `FuelSegmentView`, `FuelMissingRouteView` (Task 7), `FuelStandardFormModal`, `FuelStandardFormValues` (Task 5), `toThaiShortDate(date)`, `toThaiMonthYear(month)` จาก `@/lib/utils/thaiDate`
- Produces (ใช้ใน Task 9): test ids `fuel-excess-value`, `fuel-net-value`, `fuel-segments-summary`, `fuel-segments-view-btn`, `fuel-quick-add-btn`; modal title `รายละเอียดช่วงน้ำมัน <เดือนไทย>`

- [ ] **Step 1: GitNexus impact**

Run: `node .gitnexus/run.cjs impact "MonthCard" --direction upstream --repo .` (คาดว่า LOW) และ `impact "SummaryRow"` — แจ้งผล

- [ ] **Step 2: `components/summary/FuelSegmentsModal.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Modal, Table, Tag, Button, Typography } from 'antd'
import type { FuelMissingRouteView, FuelSegmentView, FuelStandardSummary } from '@/types/job'
import { toThaiMonthYear, toThaiShortDate } from '@/lib/utils/thaiDate'
import FuelStandardFormModal, { type FuelStandardFormValues } from '@/components/jobs/FuelStandardFormModal'

const fmtLiters = (v: number | null) =>
  v == null ? '-' : v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtSignedLiters = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : ''}${fmtLiters(v)}`)

export const diffColor = (v: number | null) => (v == null || v === 0 ? undefined : v > 0 ? '#cf1322' : '#389e0d')

const STATUS_TAG: Record<FuelSegmentView['status'], { color: string; label: string }> = {
  ok: { color: 'green', label: 'คำนวณได้' },
  missing_standard: { color: 'orange', label: 'ไม่มีค่ามาตรฐาน' },
  no_previous_fill: { color: 'orange', label: 'ไม่พบจุดเติมก่อนหน้า' },
}

function routeLabel(m: FuelMissingRouteView) {
  return `${m.size ?? '?'} · ${m.pickupLocationName ?? '?'} → ${m.factoryLocationName ?? '-'} → ${m.returnLocationName ?? '?'}`
}

interface Props {
  open: boolean
  month: string | null
  fuel: FuelStandardSummary | null
  onClose: () => void
  /** หลังเพิ่มค่ามาตรฐานจาก quick-add — ให้หน้าโหลดสรุปใหม่ */
  onStandardSaved: () => void
}

export default function FuelSegmentsModal({ open, month, fuel, onClose, onStandardSaved }: Props) {
  const [quickAdd, setQuickAdd] = useState<FuelStandardFormValues | null>(null)

  const columns = [
    {
      title: 'ช่วงวันที่', key: 'range',
      render: (_: unknown, s: FuelSegmentView) => `${toThaiShortDate(s.startDate)} – ${toThaiShortDate(s.endDate)}`,
    },
    { title: 'จำนวน job', dataIndex: 'jobCount', key: 'jobCount', align: 'right' as const, width: 80 },
    { title: 'มาตรฐาน', dataIndex: 'standardLiters', key: 'standard', align: 'right' as const, render: fmtLiters },
    { title: 'ใช้จริง', dataIndex: 'actualLiters', key: 'actual', align: 'right' as const, render: fmtLiters },
    {
      title: 'ส่วนต่าง', dataIndex: 'diffLiters', key: 'diff', align: 'right' as const,
      render: (v: number | null) => <span style={{ color: diffColor(v), fontWeight: 600 }}>{fmtSignedLiters(v) || '-'}</span>,
    },
    {
      title: 'สถานะ', dataIndex: 'status', key: 'status',
      render: (v: FuelSegmentView['status']) => <Tag color={STATUS_TAG[v].color}>{STATUS_TAG[v].label}</Tag>,
    },
  ]

  const renderMissing = (s: FuelSegmentView) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {s.missingRoutes.map((m) => {
        const canAdd = !!(m.size && m.pickupLocationId && m.returnLocationId)
        return (
          <div key={`${routeLabel(m)}|${m.jobNumbers.join(',')}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>
              {routeLabel(m)} <Typography.Text type="secondary">(JOB {m.jobNumbers.join(', ')})</Typography.Text>
            </span>
            {canAdd ? (
              <Button
                size="small"
                data-testid="fuel-quick-add-btn"
                onClick={() =>
                  setQuickAdd({
                    size: m.size!,
                    pickupLocationId: m.pickupLocationId!,
                    factoryLocationId: m.factoryLocationId,
                    returnLocationId: m.returnLocationId!,
                  })
                }
              >
                ตั้งค่า
              </Button>
            ) : (
              <Typography.Text type="warning">job กรอกข้อมูลไม่ครบ</Typography.Text>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      <Modal
        title={`รายละเอียดช่วงน้ำมัน ${month ? toThaiMonthYear(month) : ''}`}
        open={open}
        onCancel={onClose}
        footer={null}
        width={820}
        destroyOnClose
      >
        <Table
          size="small"
          rowKey="closingJobNumber"
          columns={columns}
          dataSource={fuel?.segments ?? []}
          pagination={false}
          expandable={{
            rowExpandable: (s) => s.missingRoutes.length > 0,
            expandedRowRender: renderMissing,
            defaultExpandAllRows: true,
          }}
          locale={{ emptyText: 'ไม่มีช่วงที่ปิดในเดือนนี้' }}
        />
        {fuel && fuel.pendingJobCount > 0 && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            รอปิดช่วง: {fuel.pendingJobCount} job หลังเติมครั้งล่าสุด
          </Typography.Text>
        )}
      </Modal>

      <FuelStandardFormModal
        open={quickAdd !== null}
        editing={null}
        initialValues={quickAdd ?? undefined}
        onClose={() => setQuickAdd(null)}
        onSaved={onStandardSaved}
      />
    </>
  )
}
```

- [ ] **Step 3: `SummaryRow` รองรับ `testId`** — ใน `components/summary/SummaryDetail.tsx`

เพิ่ม prop `testId?: string` ใน destructure และ type ของ `SummaryRow` แล้วใส่บน span ค่า:

```tsx
      <span
        data-testid={testId}
        style={{
          width: 112,
```

- [ ] **Step 4: imports + `FuelSegmentsRow`** — ใน `SummaryDetail.tsx`

แก้ import type: `import type { DriverMonthlySummary, FuelStandardSummary } from '@/types/job'`
เพิ่ม: `import FuelSegmentsModal, { fmtSignedLiters, diffColor } from './FuelSegmentsModal'`

เพิ่ม component หลัง `function RowGap()`:

```tsx
/** แถว "ช่วงน้ำมัน" — จำนวนช่วง + เตือนช่วงที่ข้อมูลไม่ครบ + ปุ่มเปิดรายละเอียด */
function FuelSegmentsRow({ fuel, onOpen }: { fuel: FuelStandardSummary | null; onOpen: () => void }) {
  const incomplete = fuel ? fuel.segments.filter((s) => s.status !== 'ok').length : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', height: ROW_HEIGHT, gap: 8 }}>
      <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>ช่วงน้ำมัน</span>
      {/* ข้อความยาวกว่าตัวเลข — ใช้ minWidth ให้ยืดได้แทน width ตายตัว */}
      <span
        data-testid="fuel-segments-summary"
        style={{ minWidth: 112, flexShrink: 0, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        {fuel && (
          <>
            {fuel.segments.length} ช่วง
            {incomplete > 0 && <span style={{ color: '#d48806' }}> ⚠ {incomplete} ไม่ครบ</span>}
          </>
        )}
      </span>
      <span style={{ width: 38, minWidth: 38, flexShrink: 0 }}>
        {fuel && (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={onOpen} data-testid="fuel-segments-view-btn">
            ดู
          </Button>
        )}
      </span>
    </div>
  )
}
```

- [ ] **Step 5: แถวใหม่ใน `MonthCard`**

เพิ่ม prop `onOpenFuelSegments: () => void` ใน `MonthCard` (destructure + type)
ในตัว component (หลัง `const diff45 = ...`):

```tsx
  // รถก๊าซไม่คำนวณน้ำมันมาตรฐาน — 3 แถวเว้นว่าง
  const fuelStd = s.isGasVehicle ? null : s.fuelStandard ?? null
```

แทรกหลัง `<SummaryRow label={`45% - ราคา${fuelWord}`} ... />` (ก่อน `<RowGap />` ถัดไป):

```tsx
      <SummaryRow
        label="น้ำมันเกินมาตรฐาน"
        value={fuelStd ? fmtSignedLiters(fuelStd.excessLiters) : null}
        unit="ลิตร"
        color={fuelStd ? diffColor(fuelStd.excessLiters) : undefined}
        testId="fuel-excess-value"
      />
      <SummaryRow
        label="น้ำมันเกินสุทธิ"
        value={fuelStd ? fmtSignedLiters(fuelStd.netDiffLiters) : null}
        unit="ลิตร"
        color={fuelStd ? diffColor(fuelStd.netDiffLiters) : undefined}
        testId="fuel-net-value"
      />
      <FuelSegmentsRow fuel={fuelStd} onOpen={onOpenFuelSegments} />
```

- [ ] **Step 6: state + modal ใน `SummaryDetail`**

เพิ่ม state ต่อจาก `const [savingMonth, ...]`:

```tsx
  const [fuelMonth, setFuelMonth] = useState<string | null>(null)
```

หลัง `visibleMonths` useMemo:

```tsx
  // อ่านจาก months ทุกครั้ง — หลัง quick-add แล้ว refetch modal จะเห็นตัวเลขใหม่ทันที
  const fuelMonthSummary = useMemo(
    () => (fuelMonth ? months.find((m) => m.month === fuelMonth) ?? null : null),
    [months, fuelMonth]
  )
```

แก้ render `MonthCard`:

```tsx
              <MonthCard
                s={s}
                saving={savingMonth === s.month}
                onSave={handleSaveCard}
                onOpenFuelSegments={() => setFuelMonth(s.month)}
              />
```

เพิ่มก่อน `<SummaryDriverSwitchModal`:

```tsx
      <FuelSegmentsModal
        open={fuelMonth !== null}
        month={fuelMonth}
        fuel={fuelMonthSummary?.fuelStandard ?? null}
        onClose={() => setFuelMonth(null)}
        onStandardSaved={() => fetchYear(year)}
      />
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx next lint --dir components/summary`
Expected: ไม่มี error
(`fetchYear` ตั้ง `loading` → การ์ดหายชั่วคราวระหว่างโหลด แต่ modal ยังเปิดอยู่เพราะ state `fuelMonth` อยู่ที่ `SummaryDetail` — ตรวจใน e2e Task 9)

- [ ] **Step 8: Commit** (detect-changes ก่อน)

```bash
git add components/summary/FuelSegmentsModal.tsx components/summary/SummaryDetail.tsx
git commit -m "feat(summary): แสดงน้ำมันเกินมาตรฐานและรายละเอียดช่วงในการ์ดเดือน

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: E2E หน้าสรุป

**Files:**
- Create: `e2e/scripts/seed-fuel-summary.ts`
- Create: `e2e/summary/fuel-standard-summary.spec.ts`

**Interfaces:**
- Consumes: `cleanup-fuel-standard.ts` (Task 6), test ids (Task 8), `FuelStandardFormModal` ids (Task 5)
- Produces: seed script รับ env `FUEL_MONTH=YYYY-MM` สร้างคนขับ `Fuel Summary Driver` + สถานที่ `E2E_FUEL_SUM_*` + มาตรฐาน 1 รายการ + job 4 ใบ

ข้อมูล seed (เดือน M = เดือนล่าสุดที่จบแล้ว):

| JOB | วัน | เส้นทาง | เติม | ผล |
|---|---|---|---|---|
| E2E-FUEL-1 | 1 | P1→F1→RET (มีมาตรฐาน 300) | OFF 100 | ช่วงที่ 1: ไม่พบจุดเติมก่อนหน้า |
| E2E-FUEL-2 | 2 | P1→F1→RET | – | |
| E2E-FUEL-3 | 3 | P1→F1→RET | สด 650 | ช่วงที่ 2: มาตรฐาน 600 ใช้จริง 650 → +50 |
| E2E-FUEL-4 | 4 | P2→F1→RET (ไม่มีมาตรฐาน) | เครดิต 200 | ช่วงที่ 3: ไม่มีค่ามาตรฐาน |

หลัง quick-add P2 = 180 → ช่วงที่ 3: +20 → เกินรวม +70

- [ ] **Step 1: Seed script** — `e2e/scripts/seed-fuel-summary.ts`

```ts
import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const month = process.env.FUEL_MONTH
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error('ต้องระบุ FUEL_MONTH=YYYY-MM')
  const [y, m] = month.split('-').map(Number)
  const day = (d: number) => new Date(Date.UTC(y, m - 1, d))

  const admin = await prisma.authUser.findUniqueOrThrow({ where: { username: 'testadmin' } })
  const loc = async (name: string, type: string) => prisma.location.create({ data: { name, type } })
  const p1 = await loc('E2E_FUEL_SUM_P1', 'general')
  const p2 = await loc('E2E_FUEL_SUM_P2', 'general')
  const f1 = await loc('E2E_FUEL_SUM_F1', 'factory')
  const ret = await loc('E2E_FUEL_SUM_RET', 'general')

  await prisma.fuelStandard.create({
    data: { size: '40DC', pickupLocationId: p1.id, factoryLocationId: f1.id, returnLocationId: ret.id, liters: 300 },
  })

  const driver = await prisma.driver.create({ data: { name: 'Fuel Summary Driver', vehicleNumber: 'FUEL-01' } })

  const base = { jobType: 'inbound', size: '40DC', driverId: driver.id, createdById: admin.id, factoryLocationId: f1.id, returnLocationId: ret.id }
  // สร้างทีละใบตามลำดับ — createdAt เรียงตามลำดับจริง
  await prisma.job.create({ data: { ...base, jobNumber: 'E2E-FUEL-1', jobDate: day(1), pickupLocationId: p1.id, fuelOfficeLiters: 100 } })
  await prisma.job.create({ data: { ...base, jobNumber: 'E2E-FUEL-2', jobDate: day(2), pickupLocationId: p1.id } })
  await prisma.job.create({ data: { ...base, jobNumber: 'E2E-FUEL-3', jobDate: day(3), pickupLocationId: p1.id, fuelCashLiters: 650 } })
  await prisma.job.create({ data: { ...base, jobNumber: 'E2E-FUEL-4', jobDate: day(4), pickupLocationId: p2.id, fuelCreditLiters: 200 } })

  console.log(`🌱 [Playwright] seed น้ำมันมาตรฐานเดือน ${month}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Spec** — `e2e/summary/fuel-standard-summary.spec.ts`

```ts
import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER = 'Fuel Summary Driver'
/** เดือนล่าสุดที่จบแล้ว — การ์ดใบแรกบนหน้าจอ */
const LAST_CLOSED = dayjs().subtract(1, 'month')
const ROOT = path.resolve(__dirname, '../..')

function run(script: string, env: Record<string, string> = {}) {
  execSync(`npx tsx ${script}`, { stdio: 'inherit', env: { ...process.env, ...env }, cwd: ROOT })
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL(/\/jobs|\/line-images/, { timeout: 20000 })
}

test.describe.serial('น้ำมันมาตรฐานในหน้าสรุป', () => {
  test.beforeEach(() => {
    run('e2e/scripts/cleanup-fuel-standard.ts')
    run('e2e/scripts/seed-fuel-summary.ts', { FUEL_MONTH: LAST_CLOSED.format('YYYY-MM') })
  })
  test.afterEach(() => run('e2e/scripts/cleanup-fuel-standard.ts'))

  test('Case 1: การ์ดแสดงเกินมาตรฐาน + quick-add ค่าที่ขาดแล้วคำนวณใหม่', async ({ page }) => {
    test.skip(dayjs().month() === 0, 'เดือน ม.ค. ยังไม่มีเดือนที่จบแล้วในปีนี้')
    await login(page)

    await page.goto('/summary')
    await page.getByRole('row').filter({ hasText: DRIVER }).click()
    await expect(page).toHaveURL(/\/summary\/[a-z0-9]+/)
    const card = page.getByTestId('summary-month-card').first()
    await expect(card).toBeVisible({ timeout: 20000 })

    await expect(card.getByTestId('fuel-excess-value')).toHaveText('+50.00')
    await expect(card.getByTestId('fuel-net-value')).toHaveText('+50.00')
    await expect(card.getByTestId('fuel-segments-summary')).toContainText('3 ช่วง')
    await expect(card.getByTestId('fuel-segments-summary')).toContainText('2 ไม่ครบ')

    await card.getByTestId('fuel-segments-view-btn').click()
    const dialog = page.getByRole('dialog', { name: /รายละเอียดช่วงน้ำมัน/ })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('ไม่พบจุดเติมก่อนหน้า')
    await expect(dialog).toContainText('ไม่มีค่ามาตรฐาน')
    await expect(dialog).toContainText('E2E_FUEL_SUM_P2')
    await expect(dialog).toContainText('E2E-FUEL-4')

    // quick-add: size/สถานที่ถูกกรอกไว้ให้แล้ว กรอกแค่ลิตร
    await dialog.getByTestId('fuel-quick-add-btn').click()
    await page.getByTestId('fuel-standard-liters-input').fill('180')
    await page.getByTestId('fuel-standard-submit-btn').click()
    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible()

    // modal รายละเอียดยังเปิดอยู่และเห็นตัวเลขใหม่
    await expect(dialog).toContainText('+20.00', { timeout: 15000 })
    await dialog.getByRole('button', { name: 'Close' }).click()

    await expect(card.getByTestId('fuel-excess-value')).toHaveText('+70.00', { timeout: 15000 })
    await expect(card.getByTestId('fuel-net-value')).toHaveText('+70.00')
    await expect(card.getByTestId('fuel-segments-summary')).toContainText('1 ไม่ครบ')
  })
})
```

- [ ] **Step 3: Run e2e**

Run: `npx playwright test e2e/summary/fuel-standard-summary.spec.ts --workers=1`
Expected: 1 passed
ถ้า `getByRole('button', { name: 'Close' })` หาไม่เจอ ให้ใช้ `dialog.locator('.ant-modal-close')` แทน (antd ใช้ aria-label `Close`)

- [ ] **Step 4: Commit**

```bash
git add e2e/scripts/seed-fuel-summary.ts e2e/summary/fuel-standard-summary.spec.ts
git commit -m "test(summary): e2e น้ำมันเกินมาตรฐานและ quick-add ในหน้าสรุป

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ตรวจทั้ง branch

- [ ] **Step 1: Unit + type + lint + build**

Run: `npx tsx --test lib/utils/__tests__/*.test.ts && npx tsc --noEmit && npm run lint && npm run build`
Expected: ผ่านทั้งหมด

- [ ] **Step 2: E2E ชุดที่เกี่ยวข้อง (รวมของเดิมที่อาจกระทบ)**

Run: `npx playwright test e2e/jobs/fuel-standard.spec.ts e2e/summary e2e/jobs/settings.spec.ts --workers=1`
Expected: ผ่านทั้งหมด — ถ้า "อัตราค่าเที่ยวคนขับ Case 1" ใน `settings.spec.ts` fail ตอนรันต่อจาก test อื่น เป็น flaky ที่รู้อยู่แล้ว (ดู memory `e2e-settings-flaky-driver-wage`) ให้รันไฟล์นั้นเดี่ยวยืนยัน แล้วรายงานตามจริง

- [ ] **Step 3: Graph check ทั้ง branch**

Run: `node .gitnexus/run.cjs detect-changes --scope compare --base-ref main --repo .`
Expected: affected symbols อยู่ในขอบเขต: `buildMonthSummaries`, `MonthCard`, `SummaryRow`, `SummaryDetail`, `ProtectedLayoutClient`, route `[driverId]` + ไฟล์ใหม่ — ถ้า `partial`/`truncated` ให้รันซ้ำ

- [ ] **Step 4: แจ้งผู้ใช้เรื่อง DB**

ต้อง push schema ไป staging/prod เอง: `make migrate-stag` แล้วค่อย `make migrate-prod` (ตาราง `fuel_standard` ใหม่ ไม่กระทบตารางเดิม)
