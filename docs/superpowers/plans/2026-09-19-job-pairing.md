# Job Pairing (จับคู่งาน) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้จับคู่ใบงาน 20DC สองใบที่วิ่งครั้งเดียวกันได้ เพื่อให้ค่าขนส่ง/ค่าเที่ยวคิดในอัตรา `2x20DC` ครั้งเดียว และหน้าสรุปนับเป็น 1 เที่ยว

**Architecture:** เพิ่มตาราง `JobPairLink` (primary/secondary, `@unique` ทั้งสองฝั่ง) แยกจาก `Job` เพื่อบังคับ invariant "หนึ่งใบ = หนึ่งคู่" ที่ระดับ DB — pattern เดียวกับ `JobTowingLink` ที่มีอยู่ `size` ใน DB ไม่ถูกแก้ ระบบแปลงเป็น `2x20DC` เฉพาะตอนดึงอัตราผ่าน helper `getPairedSize()` UI ทั้งหมดอยู่ในตาราง `EditableJobTable` ที่เดียว

**Tech Stack:** Next.js 15 (App Router), Prisma v6 + PostgreSQL, Ant Design v5, TypeScript, `node:test` (unit), Playwright (E2E)

**Spec:** [docs/superpowers/specs/2026-09-19-job-pairing-design.md](../specs/2026-09-19-job-pairing-design.md)

## Global Constraints

- ตอบกลับผู้ใช้เป็นภาษาไทยเสมอ — error message ใน API และข้อความ UI ทั้งหมดเป็นภาษาไทย
- `<Table>` ทุกตัวต้องมี `size="small"`
- Confirm การลบ/action สำคัญใช้ `App.useApp().modal` → `modal.confirm({...})` **ไม่ใช้ `Popconfirm`**
- API auth pattern: `const session = await auth(); if (!session?.user) return 401`
- Prisma migration ใช้ `make migrate-stag` (push schema ไป staging) — **ไม่ใช้** `prisma migrate dev`
- Unit test รันด้วย `npx tsx --test <path>` (โปรเจกต์ใช้ `node:test` ไม่ใช่ Jest)
- E2E ต้องรันด้วย `npx playwright test --workers=1`
- `data-testid` ใส่บน Button/Input ได้โดยตรง แต่ Select/DatePicker ต้องใช้ `id` prop แทน
- ทุก field ใหม่ใน `SummaryJobInput` ต้องเป็น **optional** — test เดิม 17 ตัวสร้าง job object inline ครบทุก field ถ้าเพิ่ม required field จะพังทั้งหมด

## File Structure

**สร้างใหม่:**

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/utils/jobPairing.ts` | กฎการจับคู่ที่ใช้ร่วมกันทั้ง candidate query และ POST validation — single source of truth |
| `lib/utils/__tests__/jobPairing.test.ts` | unit test ของ helper ข้างบน |
| `app/api/jobs/[id]/pair-candidates/route.ts` | GET — หาใบที่จับคู่ได้ |
| `app/api/jobs/[id]/pair-link/route.ts` | POST (จับคู่) + DELETE (ปลดคู่) |
| `components/jobs/PairJobModal.tsx` | modal เลือก candidate + แสดงผลลัพธ์ก่อนยืนยัน |
| `e2e/jobs/job-pairing.spec.ts` | E2E |

**แก้ไข:**

| ไฟล์ | สิ่งที่แก้ |
|---|---|
| `prisma/schema.prisma` | เพิ่ม model `JobPairLink` + relation บน `Job` |
| `types/job.ts` | `getPairedSize`, `isPairableSize`, `isPairableJobType`, interface `JobPairLink` |
| `app/api/jobs/route.ts` | include pair links |
| `app/api/jobs/[id]/route.ts` | include pair links + guard ใน PATCH |
| `app/api/jobs/prefill-rates/route.ts` | ข้าม secondary + ใช้ paired size กับ primary |
| `lib/utils/summaryCalculator.ts` | ไม่นับ secondary ใน `jobTrips`/`towingTrips` |
| `lib/utils/summaryQuery.ts` | select + map `isPairSecondary` |
| `components/jobs/EditableJobTable.tsx` | ปุ่มจับคู่ + Tag + disable ช่องยอด + `paired-row` |
| `app/(protected)/jobs/[driverId]/page.tsx` | ส่ง prop `canPairJobs` |
| `components/jobs/JobFormModal.tsx` | prefill ใช้ paired size + ซ่อนปุ่ม/disable ช่องของ secondary |

**ลำดับ task:** helper (ไม่มี dependency) → schema → API → summary → UI — แต่ละ task ทดสอบได้เอง

---

### Task 1: Size mapping + pairing predicates ใน `types/job.ts`

**Files:**
- Modify: `types/job.ts` (เพิ่มท้ายไฟล์ ใกล้ `isTowingJobType` ที่บรรทัด ~210)
- Test: `lib/utils/__tests__/jobPairing.test.ts` (สร้างใหม่)

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces:
  - `getPairedSize(size: string | null): string | null`
  - `isPairableSize(size: string | null): boolean`
  - `isPairableJobType(jobType: string): boolean`
  - `PAIRABLE_JOB_TYPES: readonly ["inbound","outbound","towing","towingHeavy"]`
  - `interface PairedJobSummary { id, jobNumber, jobDate, size }`
  - `interface JobPairLink { id, primaryJobId, secondaryJobId, otherJob, createdAt }`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

สร้าง `lib/utils/__tests__/jobPairing.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPairedSize, isPairableSize, isPairableJobType } from '../../../types/job'

test('getPairedSize: 20DC และ 20RF แปลงเป็นอัตราคู่ได้', () => {
  assert.equal(getPairedSize('20DC'), '2x20DC')
  assert.equal(getPairedSize('20RF'), '2x20RF')
})

test('getPairedSize: size อื่นจับคู่ไม่ได้', () => {
  assert.equal(getPairedSize('40DC'), null)
  assert.equal(getPairedSize('45HC'), null)
  assert.equal(getPairedSize('truck'), null)
  assert.equal(getPairedSize(null), null)
})

test('getPairedSize: size ที่เป็นคู่อยู่แล้วจับคู่ซ้ำไม่ได้', () => {
  assert.equal(getPairedSize('2x20DC'), null)
  assert.equal(getPairedSize('2x20RF'), null)
})

test('isPairableSize: สะท้อนผลของ getPairedSize', () => {
  assert.equal(isPairableSize('20DC'), true)
  assert.equal(isPairableSize('40DC'), false)
  assert.equal(isPairableSize(null), false)
})

test('isPairableJobType: ขาเข้า ขาออก ทอยตู้ ทอยตู้หนัก จับคู่ได้', () => {
  assert.equal(isPairableJobType('inbound'), true)
  assert.equal(isPairableJobType('outbound'), true)
  assert.equal(isPairableJobType('towing'), true)
  assert.equal(isPairableJobType('towingHeavy'), true)
})

test('isPairableJobType: พื้นเรียบ โรงสี เบิกล่วงหน้า ไม่มีงาน จับคู่ไม่ได้', () => {
  assert.equal(isPairableJobType('flatbed'), false)
  assert.equal(isPairableJobType('mill'), false)
  assert.equal(isPairableJobType('advance'), false)
  assert.equal(isPairableJobType('noJob'), false)
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx tsx --test lib/utils/__tests__/jobPairing.test.ts
```

Expected: FAIL — `getPairedSize is not a function` (ยังไม่ได้ export)

- [ ] **Step 3: เพิ่ม implementation ใน `types/job.ts`**

เพิ่มต่อจาก `isTowingJobType` (ท้ายบล็อก TOWING_JOB_TYPES ราวบรรทัด 212):

```ts
/**
 * จับคู่งาน — รถคันเดียววิ่งครั้งเดียวแต่ลากตู้ 20 ฟุตสองตู้
 * size ใน DB ไม่ถูกแก้ ระบบแปลงเป็นอัตราคู่เฉพาะตอนดึงอัตรา
 */
const PAIRABLE_SIZE_MAP: Record<string, string> = {
  "20DC": "2x20DC",
  "20RF": "2x20RF",
};

/** size ของอัตราหลังจับคู่ — null = size นี้จับคู่ไม่ได้ */
export function getPairedSize(size: string | null): string | null {
  return size ? PAIRABLE_SIZE_MAP[size] ?? null : null;
}

export function isPairableSize(size: string | null): boolean {
  return getPairedSize(size) !== null;
}

/** ลักษณะงานที่จับคู่ได้ — อัตรา key ด้วย jobType จึงต้องเป็นประเภทเดียวกันเท่านั้น */
export const PAIRABLE_JOB_TYPES = ["inbound", "outbound", "towing", "towingHeavy"] as const;

export function isPairableJobType(jobType: string): boolean {
  return (PAIRABLE_JOB_TYPES as readonly string[]).includes(jobType);
}

export interface PairedJobSummary {
  id: string;
  jobNumber: string;
  jobDate: string;
  size: string | null;
}

export interface JobPairLink {
  id: string;
  primaryJobId: string;
  secondaryJobId: string;
  /** อีกฝั่งของคู่ — client หาเองจาก primaryJobId/secondaryJobId */
  otherJob: PairedJobSummary;
  createdAt: string;
}
```

เพิ่มสองบรรทัดใน `interface Job` ต่อจาก `towingLinkAsTowing` (บรรทัด ~136):

```ts
  pairLinkAsPrimary?: JobPairRelation | null;
  pairLinkAsSecondary?: JobPairRelation | null;
```

และ interface ที่สะท้อนรูปแบบที่ Prisma คืนมาจริง (API คืน Prisma object ดิบ ไม่มี mapping layer):

```ts
/** รูปแบบที่ Prisma คืนจาก include — ฝั่งตรงข้ามมาในชื่อ field ของตัวเอง */
export interface JobPairRelation {
  id: string;
  primaryJobId: string;
  secondaryJobId: string;
  primaryJob?: PairedJobSummary;
  secondaryJob?: PairedJobSummary;
  createdAt: string;
}
```

> **หมายเหตุสำคัญ:** สเปคเขียนว่า API จะ map เป็น `otherJob` แต่ตรวจโค้ดจริงแล้ว `GET /api/jobs` คืน Prisma object ดิบด้วย `NextResponse.json(jobs)` ไม่มี mapping layer การเพิ่ม mapping จะต้องรื้อ route ทั้งตัว จึงใช้ `JobPairRelation` ที่สะท้อนรูป Prisma ตรงๆ แล้วให้ client อ่านจาก `pairLinkAsPrimary.secondaryJob` หรือ `pairLinkAsSecondary.primaryJob` แทน `interface JobPairLink` ข้างบนเก็บไว้สำหรับ response ของ `POST /pair-link` ที่เรา map เองได้

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx tsx --test lib/utils/__tests__/jobPairing.test.ts
```

Expected: PASS ทั้ง 6 tests

- [ ] **Step 5: ตรวจว่า test เดิมไม่พัง**

```bash
npx tsx --test lib/utils/__tests__/summaryCalculator.test.ts
```

Expected: PASS 17 tests (เท่าเดิม)

- [ ] **Step 6: Commit**

```bash
git add types/job.ts lib/utils/__tests__/jobPairing.test.ts
git commit -m "feat(jobs): เพิ่ม helper แปลง size และเช็คลักษณะงานที่จับคู่ได้

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Prisma schema — `JobPairLink`

**Files:**
- Modify: `prisma/schema.prisma` (เพิ่ม model หลัง `JobTowingLink` บรรทัด ~360, เพิ่ม relation ใน `Job` บรรทัด ~328)

**Interfaces:**
- Consumes: ไม่มี
- Produces: `prisma.jobPairLink` client + `job.pairLinkAsPrimary` / `job.pairLinkAsSecondary`

- [ ] **Step 1: เพิ่ม relation ใน model `Job`**

ใน `prisma/schema.prisma` ต่อจากบล็อก "Towing link relations" (บรรทัด ~326-328):

```prisma
  // Pair link relations — จับคู่งานที่วิ่งครั้งเดียวแต่แยกใบ
  pairLinkAsPrimary   JobPairLink? @relation("PairPrimary")
  pairLinkAsSecondary JobPairLink? @relation("PairSecondary")
```

- [ ] **Step 2: เพิ่ม model `JobPairLink`**

วางหลัง model `JobTowingLink` (จบที่บรรทัด ~360) ก่อน `JobTransfer`:

```prisma
/// จับคู่งาน — สองใบที่วิ่งครั้งเดียวกัน ยอดรวมอยู่ที่ใบ primary
/// @unique ทั้งสองฝั่งบังคับว่าหนึ่งใบอยู่ได้แค่คู่เดียว และเป็นได้ฝั่งเดียว
model JobPairLink {
  id             String   @id @default(cuid())
  /// ใบที่ถือยอด — createdAt ใหม่กว่า
  primaryJobId   String   @unique
  primaryJob     Job      @relation("PairPrimary", fields: [primaryJobId], references: [id], onDelete: Cascade)
  /// ใบที่ถูกล้างยอด — income/driverWage = null
  secondaryJobId String   @unique
  secondaryJob   Job      @relation("PairSecondary", fields: [secondaryJobId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())

  @@map("job_pair_links")
}
```

- [ ] **Step 3: Generate client และตรวจว่า schema ถูกต้อง**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` ไม่มี error
ถ้า error เรื่อง relation ให้ตรวจว่าชื่อ relation (`"PairPrimary"` / `"PairSecondary"`) ตรงกันทั้งสองฝั่ง

- [ ] **Step 4: ตรวจว่า TypeScript compile ผ่าน**

```bash
npx tsc --noEmit
```

Expected: ไม่มี error ใหม่ (อาจมี error เดิมของโปรเจกต์ — เทียบกับก่อนแก้)

- [ ] **Step 5: Push schema ไป staging**

```bash
make migrate-stag
```

Expected: `Your database is now in sync with your Prisma schema`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): เพิ่มตาราง job_pair_links สำหรับจับคู่งาน

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: กฎการจับคู่ (shared validation)

**Files:**
- Create: `lib/utils/jobPairing.ts`
- Test: `lib/utils/__tests__/jobPairing.test.ts` (เพิ่มใน test file ของ Task 1)

**Interfaces:**
- Consumes: `isPairableJobType`, `isPairableSize` จาก Task 1
- Produces:
  - `interface PairableJob { id, jobDate, jobType, size, driverId, factoryLocationId, isCancelled, clearStatus, hasPairLink }`
  - `checkPairable(a: PairableJob, b: PairableJob): string | null` — คืน `null` = จับคู่ได้, คืน string = เหตุผลภาษาไทยที่จับคู่ไม่ได้
  - `isSameDay(a: Date, b: Date): boolean`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

เพิ่มท้าย `lib/utils/__tests__/jobPairing.test.ts`:

```ts
import { checkPairable, type PairableJob } from '../jobPairing'

const baseJob = (over: Partial<PairableJob> = {}): PairableJob => ({
  id: 'j1',
  jobDate: new Date('2026-09-01'),
  jobType: 'inbound',
  size: '20DC',
  driverId: 'd1',
  factoryLocationId: 'f1',
  isCancelled: false,
  clearStatus: false,
  hasPairLink: false,
  ...over,
})

test('checkPairable: งานที่เข้าเงื่อนไขครบจับคู่ได้', () => {
  assert.equal(checkPairable(baseJob(), baseJob({ id: 'j2' })), null)
})

test('checkPairable: ทอยตู้ไม่เช็คโรงงาน', () => {
  const a = baseJob({ jobType: 'towing', factoryLocationId: null })
  const b = baseJob({ id: 'j2', jobType: 'towing', factoryLocationId: null })
  assert.equal(checkPairable(a, b), null)
})

test('checkPairable: คนละวันจับคู่ไม่ได้', () => {
  const b = baseJob({ id: 'j2', jobDate: new Date('2026-09-02') })
  assert.equal(checkPairable(baseJob(), b), 'วันที่งานไม่ตรงกัน')
})

test('checkPairable: คนละคนขับจับคู่ไม่ได้', () => {
  const b = baseJob({ id: 'j2', driverId: 'd2' })
  assert.equal(checkPairable(baseJob(), b), 'คนขับไม่ตรงกัน')
})

test('checkPairable: ไม่มีคนขับจับคู่ไม่ได้', () => {
  const a = baseJob({ driverId: null })
  assert.equal(checkPairable(a, baseJob({ id: 'j2' })), 'คนขับไม่ตรงกัน')
})

test('checkPairable: คนละลักษณะงานจับคู่ไม่ได้ (รวมทอยตู้กับทอยตู้หนัก)', () => {
  const b = baseJob({ id: 'j2', jobType: 'outbound' })
  assert.equal(checkPairable(baseJob(), b), 'ลักษณะงานไม่ตรงกัน')

  const towing = baseJob({ jobType: 'towing', factoryLocationId: null })
  const heavy = baseJob({ id: 'j2', jobType: 'towingHeavy', factoryLocationId: null })
  assert.equal(checkPairable(towing, heavy), 'ลักษณะงานไม่ตรงกัน')
})

test('checkPairable: ลักษณะงานที่จับคู่ไม่ได้', () => {
  const a = baseJob({ jobType: 'flatbed' })
  const b = baseJob({ id: 'j2', jobType: 'flatbed' })
  assert.equal(checkPairable(a, b), 'ลักษณะงานนี้จับคู่ไม่ได้')
})

test('checkPairable: size ต้องตรงกันและจับคู่ได้', () => {
  const b = baseJob({ id: 'j2', size: '20RF' })
  assert.equal(checkPairable(baseJob(), b), 'SIZE ไม่ตรงกัน')

  const a40 = baseJob({ size: '40DC' })
  const b40 = baseJob({ id: 'j2', size: '40DC' })
  assert.equal(checkPairable(a40, b40), 'SIZE นี้จับคู่ไม่ได้')
})

test('checkPairable: คนละโรงงานจับคู่ไม่ได้ (ขาเข้า/ขาออก)', () => {
  const b = baseJob({ id: 'j2', factoryLocationId: 'f2' })
  assert.equal(checkPairable(baseJob(), b), 'โรงงานไม่ตรงกัน')
})

test('checkPairable: งานยกเลิกจับคู่ไม่ได้', () => {
  const b = baseJob({ id: 'j2', isCancelled: true })
  assert.equal(checkPairable(baseJob(), b), 'งานที่ยกเลิกแล้วจับคู่ไม่ได้')
})

test('checkPairable: งานที่เคลียร์แล้วจับคู่ไม่ได้', () => {
  const b = baseJob({ id: 'j2', clearStatus: true })
  assert.equal(checkPairable(baseJob(), b), 'งานที่เคลียร์แล้วจับคู่ไม่ได้')
})

test('checkPairable: งานที่จับคู่ไปแล้วจับคู่ซ้ำไม่ได้', () => {
  const b = baseJob({ id: 'j2', hasPairLink: true })
  assert.equal(checkPairable(baseJob(), b), 'งานนี้ถูกจับคู่ไปแล้ว')
})

test('checkPairable: จับคู่กับตัวเองไม่ได้', () => {
  assert.equal(checkPairable(baseJob(), baseJob()), 'จับคู่กับงานเดียวกันไม่ได้')
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx tsx --test lib/utils/__tests__/jobPairing.test.ts
```

Expected: FAIL — `Cannot find module '../jobPairing'`

- [ ] **Step 3: สร้าง `lib/utils/jobPairing.ts`**

```ts
import { isPairableJobType, isPairableSize, isTowingJobType } from "@/types/job";

/** ข้อมูลขั้นต่ำที่ใช้ตัดสินว่าจับคู่ได้ไหม */
export interface PairableJob {
  id: string;
  jobDate: Date;
  jobType: string;
  size: string | null;
  driverId: string | null;
  factoryLocationId: string | null;
  isCancelled: boolean;
  clearStatus: boolean;
  /** true = ใบนี้อยู่ในคู่อื่นแล้ว */
  hasPairLink: boolean;
}

/** เทียบเฉพาะวัน ไม่สนเวลา — jobDate เก็บเป็น @db.Date อยู่แล้วแต่กันพลาด */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * ตรวจว่าสองใบจับคู่กันได้ไหม
 * คืน null = จับคู่ได้ / คืน string = เหตุผลภาษาไทยที่จับคู่ไม่ได้
 *
 * ใช้ร่วมกันทั้ง candidate query และ validation ตอน POST
 * เพื่อไม่ให้กฎสองฝั่งหลุดจากกัน
 */
export function checkPairable(a: PairableJob, b: PairableJob): string | null {
  if (a.id === b.id) return "จับคู่กับงานเดียวกันไม่ได้";

  if (a.hasPairLink || b.hasPairLink) return "งานนี้ถูกจับคู่ไปแล้ว";
  if (a.isCancelled || b.isCancelled) return "งานที่ยกเลิกแล้วจับคู่ไม่ได้";
  if (a.clearStatus || b.clearStatus) return "งานที่เคลียร์แล้วจับคู่ไม่ได้";

  if (!isPairableJobType(a.jobType) || !isPairableJobType(b.jobType)) {
    return "ลักษณะงานนี้จับคู่ไม่ได้";
  }
  if (a.jobType !== b.jobType) return "ลักษณะงานไม่ตรงกัน";

  if (!isPairableSize(a.size) || !isPairableSize(b.size)) {
    return "SIZE นี้จับคู่ไม่ได้";
  }
  if (a.size !== b.size) return "SIZE ไม่ตรงกัน";

  if (!a.driverId || !b.driverId || a.driverId !== b.driverId) {
    return "คนขับไม่ตรงกัน";
  }

  if (!isSameDay(a.jobDate, b.jobDate)) return "วันที่งานไม่ตรงกัน";

  // ทอยตู้/ทอยตู้หนักไม่ผูกโรงงาน — เช็คเฉพาะขาเข้า/ขาออก
  if (!isTowingJobType(a.jobType) && a.factoryLocationId !== b.factoryLocationId) {
    return "โรงงานไม่ตรงกัน";
  }

  return null;
}
```

> **ลำดับการเช็คสำคัญ:** เช็ค `isPairableJobType` ก่อน `jobType !== jobType` เพราะถ้าสองใบเป็น `flatbed` เหมือนกัน ต้องได้ข้อความ "ลักษณะงานนี้จับคู่ไม่ได้" ไม่ใช่ผ่าน การสลับลำดับจะทำให้ test ตัวที่ 7 fail

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx tsx --test lib/utils/__tests__/jobPairing.test.ts
```

Expected: PASS ทั้งหมด (6 จาก Task 1 + 13 ตัวใหม่ = 19 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/jobPairing.ts lib/utils/__tests__/jobPairing.test.ts
git commit -m "feat(jobs): เพิ่มกฎตรวจสอบการจับคู่งานที่ใช้ร่วมกันทั้ง client และ API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: API — `GET /api/jobs/[id]/pair-candidates`

**Files:**
- Create: `app/api/jobs/[id]/pair-candidates/route.ts`

**Interfaces:**
- Consumes: `checkPairable`, `PairableJob` จาก Task 3; `isTowingJobType` จาก `types/job`
- Produces: `GET /api/jobs/[id]/pair-candidates` คืน `{ jobs: PairCandidate[] }` โดย

```ts
interface PairCandidate {
  id: string; jobNumber: string; jobDate: string; size: string | null;
  customer: { name: string } | null;
  factoryLocation: { name: string } | null;
  income?: number | null;      // ADMIN เท่านั้น
  driverWage?: number | null;  // ADMIN เท่านั้น
  willBePrimary: boolean;
}
```

- [ ] **Step 1: สร้าง route**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPairable, type PairableJob } from "@/lib/utils/jobPairing";
import { isPairableJobType, isPairableSize, isTowingJobType } from "@/types/job";

const PAIR_ROLES = ["ADMIN", "SENIOR_STAFF"];

// GET /api/jobs/[id]/pair-candidates
// หางานที่จับคู่กับใบนี้ได้ — วันเดียวกัน คนขับเดียวกัน ลักษณะงาน/SIZE ตรงกัน
// ขาเข้า/ขาออก ต้องโรงงานเดียวกันด้วย
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!role || !PAIR_ROLES.includes(role)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
  }

  const { id } = await params;
  const isAdmin = role === "ADMIN";

  const job = await prisma.job.findUnique({
    where: { id },
    include: { pairLinkAsPrimary: true, pairLinkAsSecondary: true },
  });

  if (!job) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  // ใบนี้เองต้องจับคู่ได้ก่อน ไม่งั้นไม่ต้องหา candidate
  if (
    !isPairableJobType(job.jobType) ||
    !isPairableSize(job.size) ||
    !job.driverId ||
    job.isCancelled ||
    job.clearStatus ||
    job.pairLinkAsPrimary ||
    job.pairLinkAsSecondary
  ) {
    return NextResponse.json({ jobs: [] });
  }

  // narrow ให้ query แคบที่สุดก่อน แล้วค่อยกรองด้วย checkPairable
  const candidates = await prisma.job.findMany({
    where: {
      id: { not: id },
      jobDate: job.jobDate,
      driverId: job.driverId,
      jobType: job.jobType,
      size: job.size,
      isCancelled: false,
      clearStatus: false,
      pairLinkAsPrimary: null,
      pairLinkAsSecondary: null,
      ...(isTowingJobType(job.jobType)
        ? {}
        : { factoryLocationId: job.factoryLocationId }),
    },
    include: {
      customer: { select: { name: true } },
      factoryLocation: { select: { name: true } },
      pairLinkAsPrimary: { select: { id: true } },
      pairLinkAsSecondary: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const toPairable = (j: {
    id: string; jobDate: Date; jobType: string; size: string | null;
    driverId: string | null; factoryLocationId: string | null;
    isCancelled: boolean; clearStatus: boolean;
    pairLinkAsPrimary?: unknown; pairLinkAsSecondary?: unknown;
  }): PairableJob => ({
    id: j.id,
    jobDate: j.jobDate,
    jobType: j.jobType,
    size: j.size,
    driverId: j.driverId,
    factoryLocationId: j.factoryLocationId,
    isCancelled: j.isCancelled,
    clearStatus: j.clearStatus,
    hasPairLink: !!j.pairLinkAsPrimary || !!j.pairLinkAsSecondary,
  });

  const self = toPairable(job);

  const result = candidates
    .filter((c) => checkPairable(self, toPairable(c)) === null)
    .map((c) => ({
      id: c.id,
      jobNumber: c.jobNumber,
      jobDate: c.jobDate,
      size: c.size,
      customer: c.customer,
      factoryLocation: c.factoryLocation,
      // role ที่ไม่ใช่ ADMIN ไม่เห็นตัวเลขยอด — ตรงกับคอลัมน์การเงินในตาราง
      ...(isAdmin
        ? {
            income: c.income != null ? Number(c.income) : null,
            driverWage: c.driverWage != null ? Number(c.driverWage) : null,
          }
        : {}),
      // ใบที่ createdAt ใหม่กว่าเป็นคนถือยอด
      willBePrimary: c.createdAt > job.createdAt,
    }));

  return NextResponse.json({ jobs: result });
}
```

- [ ] **Step 2: ตรวจว่า compile ผ่าน**

```bash
npx tsc --noEmit
```

Expected: ไม่มี error ใหม่

- [ ] **Step 3: ทดสอบด้วยมือ**

```bash
make dev
```

สร้างงานสองใบในวันเดียวกัน คนขับเดียวกัน `jobType=inbound` `size=20DC` โรงงานเดียวกัน แล้วเรียก:

```bash
curl -s -b <cookie> http://localhost:3027/api/jobs/<jobId>/pair-candidates | jq
```

Expected: `{"jobs":[{...,"willBePrimary":true}]}` — ใบที่สร้างทีหลังมี `willBePrimary: true`

ทดสอบเคสที่ต้องไม่เจอ candidate:
- เปลี่ยนโรงงานของใบหนึ่ง → `{"jobs":[]}`
- เปลี่ยนวันที่ → `{"jobs":[]}`
- เปลี่ยน size เป็น 40DC ทั้งคู่ → `{"jobs":[]}`

- [ ] **Step 4: Commit**

```bash
git add app/api/jobs/\[id\]/pair-candidates/route.ts
git commit -m "feat(api): เพิ่ม endpoint หางานที่จับคู่ได้

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: API — `POST` / `DELETE /api/jobs/[id]/pair-link`

**Files:**
- Create: `app/api/jobs/[id]/pair-link/route.ts`

**Interfaces:**
- Consumes: `checkPairable`, `PairableJob` จาก Task 3
- Produces:
  - `POST` body `{ otherJobId: string }` → `{ id, primaryJobId, secondaryJobId, createdAt }`
  - `DELETE` → `{ ok: true }`

- [ ] **Step 1: สร้าง route**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPairable, type PairableJob } from "@/lib/utils/jobPairing";

const PAIR_ROLES = ["ADMIN", "SENIOR_STAFF"];

const PAIR_SELECT = {
  id: true,
  jobNumber: true,
  jobDate: true,
  jobType: true,
  size: true,
  driverId: true,
  factoryLocationId: true,
  isCancelled: true,
  clearStatus: true,
  createdAt: true,
  pairLinkAsPrimary: { select: { id: true } },
  pairLinkAsSecondary: { select: { id: true } },
} as const;

type JobRow = {
  id: string; jobNumber: string; jobDate: Date; jobType: string; size: string | null;
  driverId: string | null; factoryLocationId: string | null;
  isCancelled: boolean; clearStatus: boolean; createdAt: Date;
  pairLinkAsPrimary: { id: string } | null;
  pairLinkAsSecondary: { id: string } | null;
};

const toPairable = (j: JobRow): PairableJob => ({
  id: j.id,
  jobDate: j.jobDate,
  jobType: j.jobType,
  size: j.size,
  driverId: j.driverId,
  factoryLocationId: j.factoryLocationId,
  isCancelled: j.isCancelled,
  clearStatus: j.clearStatus,
  hasPairLink: !!j.pairLinkAsPrimary || !!j.pairLinkAsSecondary,
});

async function guard() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!role || !PAIR_ROLES.includes(role)) {
    return { error: NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 }) };
  }
  return { error: null };
}

// POST /api/jobs/[id]/pair-link — จับคู่งาน
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;
  const { otherJobId } = (await req.json()) as { otherJobId?: string };
  if (!otherJobId) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const [a, b] = await Promise.all([
    prisma.job.findUnique({ where: { id }, select: PAIR_SELECT }),
    prisma.job.findUnique({ where: { id: otherJobId }, select: PAIR_SELECT }),
  ]);

  if (!a || !b) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  const reason = checkPairable(toPairable(a as JobRow), toPairable(b as JobRow));
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });

  // ใบที่สร้างทีหลังถือยอด
  const [primary, secondary] = a.createdAt > b.createdAt ? [a, b] : [b, a];

  try {
    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.jobPairLink.create({
        data: { primaryJobId: primary.id, secondaryJobId: secondary.id },
      });
      // ล้างยอดฝั่ง secondary — ยอดทั้งคู่ไปรวมที่ primary ในอัตราคู่
      // (update ตรงนี้ไม่ผ่าน PATCH endpoint จึงไม่ติด guard ของตัวเอง)
      await tx.job.update({
        where: { id: secondary.id },
        data: { income: null, driverWage: null },
      });
      return created;
    });

    return NextResponse.json({
      id: link.id,
      primaryJobId: link.primaryJobId,
      secondaryJobId: link.secondaryJobId,
      createdAt: link.createdAt,
      primaryJobNumber: primary.jobNumber,
      secondaryJobNumber: secondary.jobNumber,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "งานนี้ถูกจับคู่ไปแล้ว" }, { status: 409 });
    }
    console.error("pair-link POST error:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

// DELETE /api/jobs/[id]/pair-link — ปลดคู่
// ไม่คืนยอดให้ secondary และไม่ล้างยอด primary — ผู้ใช้จัดการเอง
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      clearStatus: true,
      pairLinkAsPrimary: { select: { id: true, secondaryJob: { select: { clearStatus: true } } } },
      pairLinkAsSecondary: { select: { id: true, primaryJob: { select: { clearStatus: true } } } },
    },
  });

  if (!job) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  const link = job.pairLinkAsPrimary ?? job.pairLinkAsSecondary;
  if (!link) return NextResponse.json({ error: "งานนี้ยังไม่ได้จับคู่" }, { status: 400 });

  const otherCleared =
    job.pairLinkAsPrimary?.secondaryJob.clearStatus ??
    job.pairLinkAsSecondary?.primaryJob.clearStatus ??
    false;

  if (job.clearStatus || otherCleared) {
    return NextResponse.json({ error: "งานที่เคลียร์แล้วปลดคู่ไม่ได้" }, { status: 400 });
  }

  await prisma.jobPairLink.delete({ where: { id: link.id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: ตรวจว่า compile ผ่าน**

```bash
npx tsc --noEmit
```

Expected: ไม่มี error ใหม่

- [ ] **Step 3: ทดสอบด้วยมือ**

```bash
make dev
```

```bash
# จับคู่
curl -s -X POST -b <cookie> -H 'Content-Type: application/json' \
  -d '{"otherJobId":"<jobId2>"}' \
  http://localhost:3027/api/jobs/<jobId1>/pair-link | jq
```

Expected: คืน link พร้อม `primaryJobId` = ใบที่สร้างทีหลัง

ตรวจใน DB ว่า secondary ถูกล้างยอด:
```bash
curl -s -b <cookie> http://localhost:3027/api/jobs/<secondaryId> | jq '{income, driverWage}'
```
Expected: `{"income": null, "driverWage": null}`

```bash
# จับคู่ซ้ำ → ต้องได้ 400/409
curl -s -X POST -b <cookie> -H 'Content-Type: application/json' \
  -d '{"otherJobId":"<jobId2>"}' \
  http://localhost:3027/api/jobs/<jobId1>/pair-link | jq

# ปลดคู่
curl -s -X DELETE -b <cookie> http://localhost:3027/api/jobs/<jobId1>/pair-link | jq
```
Expected: `{"ok":true}`

- [ ] **Step 4: Commit**

```bash
git add app/api/jobs/\[id\]/pair-link/route.ts
git commit -m "feat(api): เพิ่ม endpoint จับคู่และปลดคู่งาน

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: include pair links ใน jobs API + guard ใน PATCH

**Files:**
- Modify: `app/api/jobs/route.ts:36-55` (include ใน GET)
- Modify: `app/api/jobs/[id]/route.ts:22-35` (include ใน GET), `:160-180` (PATCH — guard + include)

**Interfaces:**
- Consumes: schema จาก Task 2
- Produces: `job.pairLinkAsPrimary` / `job.pairLinkAsSecondary` มาถึง client ทุก endpoint ที่คืน job

- [ ] **Step 1: เพิ่ม include ใน `GET /api/jobs`**

ใน `app/api/jobs/route.ts` ต่อจาก `towingLinkAsTowing` (บรรทัด ~51-53) เพิ่ม:

```ts
        pairLinkAsPrimary: {
          include: { secondaryJob: { select: { id: true, jobNumber: true, jobDate: true, size: true } } },
        },
        pairLinkAsSecondary: {
          include: { primaryJob: { select: { id: true, jobNumber: true, jobDate: true, size: true } } },
        },
```

- [ ] **Step 2: เพิ่ม include เดียวกันใน `GET /api/jobs/[id]`**

ใน `app/api/jobs/[id]/route.ts` ต่อจาก `towingLinkAsTowing` ในบล็อก GET (บรรทัด ~30-32) เพิ่มบล็อกเดียวกับ Step 1

- [ ] **Step 3: เพิ่ม guard + include ใน PATCH**

ใน `app/api/jobs/[id]/route.ts` ก่อนบรรทัด `const job = await prisma.job.update(` (ราวบรรทัด 161) เพิ่ม:

```ts
    // งานที่ถูกจับคู่แล้ว (ฝั่ง secondary) ยอดต้องเป็น null เสมอ — ยอดอยู่ที่ใบ primary
    if (data.income !== undefined || data.driverWage !== undefined) {
      const pairLink = await prisma.jobPairLink.findUnique({
        where: { secondaryJobId: id },
        select: { primaryJob: { select: { jobNumber: true } } },
      });
      if (pairLink) {
        return NextResponse.json(
          { error: `งานนี้ถูกจับคู่แล้ว ยอดอยู่ที่ ${pairLink.primaryJob.jobNumber}` },
          { status: 400 }
        );
      }
    }
```

> **ระวัง:** guard นี้ต้องอยู่**ก่อน**บล็อก `if (data.isCancelled === true) { data.income = null; ... }` (บรรทัด ~156-159) ไม่งั้นการยกเลิกงาน secondary จะถูกปฏิเสธ เพราะบล็อกนั้น set `data.income = null` ขึ้นมาเอง ทำให้ `data.income !== undefined` เป็น true แล้ว guard จะเข้าใจผิดว่าผู้ใช้พยายามแก้ยอด
>
> ไล่เคสยืนยัน: ผู้ใช้ยกเลิกงาน secondary → client ส่งแค่ `{ isCancelled: true }` → ตอน guard ทำงาน `data.income` ยังเป็น `undefined` → guard ข้าม → บล็อก isCancelled ทำงานต่อ → ยกเลิกสำเร็จ ✅

และเพิ่ม include เดียวกับ Step 1 เข้าไปใน `prisma.job.update({ ..., include: {...} })` (บรรทัด ~163-180)

- [ ] **Step 4: ตรวจว่า compile ผ่าน**

```bash
npx tsc --noEmit
```

Expected: ไม่มี error ใหม่

- [ ] **Step 5: ทดสอบด้วยมือ**

```bash
make dev
```

จับคู่งานสองใบ แล้ว:

```bash
# อ่าน job ต้องเห็น pair link
curl -s -b <cookie> http://localhost:3027/api/jobs/<secondaryId> | jq '.pairLinkAsSecondary.primaryJob.jobNumber'
```
Expected: เลขที่งานของใบ primary

```bash
# พยายามแก้ยอดของ secondary → ต้องถูกปฏิเสธ
curl -s -X PATCH -b <cookie> -H 'Content-Type: application/json' \
  -d '{"income":5000}' http://localhost:3027/api/jobs/<secondaryId> | jq
```
Expected: `{"error":"งานนี้ถูกจับคู่แล้ว ยอดอยู่ที่ JOB-xxxx"}`

```bash
# ยกเลิกงาน secondary → ต้องผ่าน (ไม่ติด guard)
curl -s -X PATCH -b <cookie> -H 'Content-Type: application/json' \
  -d '{"isCancelled":true}' http://localhost:3027/api/jobs/<secondaryId> | jq '.isCancelled'
```
Expected: `true`

- [ ] **Step 6: Commit**

```bash
git add app/api/jobs/route.ts app/api/jobs/\[id\]/route.ts
git commit -m "feat(api): ส่งข้อมูลการจับคู่มากับ job และกันแก้ยอดฝั่งที่ถูกล้าง

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: หน้าสรุป — ไม่นับใบ secondary เป็นเที่ยว

**Files:**
- Modify: `lib/utils/summaryCalculator.ts:7-24` (interface), `:95-96` (การนับ)
- Modify: `lib/utils/summaryQuery.ts:46-60` (select), `:123-138` (map)
- Test: `lib/utils/__tests__/summaryCalculator.test.ts` (เพิ่ม test ใหม่ท้ายไฟล์)

**Interfaces:**
- Consumes: schema จาก Task 2
- Produces: `SummaryJobInput.isPairSecondary?: boolean` — **optional** เพื่อไม่ให้ test เดิม 17 ตัวพัง

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

เพิ่มท้าย `lib/utils/__tests__/summaryCalculator.test.ts`:

```ts
test('calculateDriverSummary: งานที่จับคู่แล้วนับเป็นเที่ยวเดียว แต่ยอดรวมครบ', () => {
  const base = {
    month: '2026-09',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
      isGasVehicle: false,
    },
    sickLeaveCount: 0,
    personalLeaveCount: 0,
    fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      // ใบ primary ถือยอดอัตรา 2x20DC
      { jobType: 'inbound', noJobReason: null, isCancelled: false, isCarry: false, toll: 50, liftFee: null, storageFee: null, tire: null, other: null, income: 5000, driverWage: 150, fuelOfficeLiters: 10, fuelCashLiters: 0, fuelCreditLiters: 0 },
      // ใบ secondary ยอดถูกล้าง แต่ค่าใช้จ่าย/น้ำมันยังนับ
      { jobType: 'inbound', noJobReason: null, isCancelled: false, isCarry: false, toll: 30, liftFee: null, storageFee: null, tire: null, other: null, income: null, driverWage: null, fuelOfficeLiters: 5, fuelCashLiters: 0, fuelCreditLiters: 0, isPairSecondary: true },
    ],
  })

  assert.equal(result.jobTrips, 1)              // จับคู่แล้วนับเที่ยวเดียว
  assert.equal(result.income, 5000)
  assert.equal(result.driverWage, 150)
  assert.equal(result.fuelLiters, 15)           // น้ำมันยังรวมทั้งสองใบ
  assert.equal(result.otherExpensesPrefill, 80) // ค่าใช้จ่ายยังรวมทั้งสองใบ
})

test('calculateDriverSummary: ทอยตู้ที่จับคู่แล้วนับเป็นเที่ยวเดียว', () => {
  const base = {
    month: '2026-09',
    driver: {
      id: 'd1', name: 'ประวิทย์ กันภัย', vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1', startDate: '2025-08-25', baseSalary: 9000, isGasVehicle: false,
    },
    sickLeaveCount: 0, personalLeaveCount: 0, fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'towing', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 800, driverWage: 80, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'towing', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: null, driverWage: null, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0, isPairSecondary: true },
    ],
  })

  assert.equal(result.towingTrips, 1)
  assert.equal(result.income, 800)
})

test('calculateDriverSummary: แบกยังนับต่อตู้ แม้จับคู่แล้ว', () => {
  const base = {
    month: '2026-09',
    driver: {
      id: 'd1', name: 'ประวิทย์ กันภัย', vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1', startDate: '2025-08-25', baseSalary: 9000, isGasVehicle: false,
    },
    sickLeaveCount: 0, personalLeaveCount: 0, fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'inbound', noJobReason: null, isCancelled: false, isCarry: true, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 5000, driverWage: 150, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      { jobType: 'inbound', noJobReason: null, isCancelled: false, isCarry: true, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: null, driverWage: null, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0, isPairSecondary: true },
    ],
  })

  assert.equal(result.jobTrips, 1)          // เที่ยวลดลง
  assert.equal(result.carryTripsPrefill, 2) // แต่แบกยังนับสองตู้
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx tsx --test lib/utils/__tests__/summaryCalculator.test.ts
```

Expected: FAIL 3 ตัวใหม่ — `jobTrips` ได้ 2 แทนที่จะเป็น 1 (ส่วน 17 ตัวเดิมยัง PASS)

- [ ] **Step 3: เพิ่ม field ใน `SummaryJobInput`**

ใน `lib/utils/summaryCalculator.ts` ต่อจาก `isCarry` (บรรทัด ~12):

```ts
  /**
   * true = ใบที่ถูกจับคู่แล้วยอดถูกล้าง — ไม่นับเป็นเที่ยว แต่ค่าใช้จ่าย/น้ำมันยังรวม
   * optional เพื่อให้ call site เดิมไม่ต้องแก้
   */
  isPairSecondary?: boolean;
```

- [ ] **Step 4: แก้การนับเที่ยว**

ใน `lib/utils/summaryCalculator.ts` เพิ่มต่อจาก `const active = jobs.filter(...)` (บรรทัด ~65):

```ts
  // ใบที่ถูกจับคู่แล้วยอดถูกล้าง ไม่นับเป็นเที่ยว — วิ่งครั้งเดียวคือหนึ่งเที่ยว
  const counted = active.filter((j) => !j.isPairSecondary);
```

แล้วแก้สองบรรทัด (ที่บรรทัด ~95-96):

```ts
    jobTrips: counted.filter((j) => MAIN_JOB_TYPES.includes(j.jobType)).length,
    towingTrips: counted.filter((j) => isTowingJobType(j.jobType)).length,
```

**ห้ามแก้บรรทัดอื่น** — `income`, `driverWage`, `fuelLiters`, `otherExpensesPrefill`, `carryTripsPrefill`, `repairDays`, `overnightDays`, `noShowDays` ยังใช้ `active` ทั้งหมด

- [ ] **Step 5: รัน test ให้ผ่าน**

```bash
npx tsx --test lib/utils/__tests__/summaryCalculator.test.ts
```

Expected: PASS 20 tests (17 เดิม + 3 ใหม่)

- [ ] **Step 6: ต่อข้อมูลจาก DB ใน `summaryQuery.ts`**

ใน `select` ของ `prisma.job.findMany` (ต่อจาก `other: true` ราวบรรทัด 60) เพิ่ม:

```ts
        pairLinkAsSecondary: { select: { id: true } },
```

> หน้าสรุปต้องการแค่ boolean ไม่ต้องรู้ว่าคู่กับใบไหน จึง select แค่ `id`

ใน map ของ `jobs` (ต่อจาก `other: ...` ราวบรรทัด 137) เพิ่ม:

```ts
        isPairSecondary: !!j.pairLinkAsSecondary,
```

- [ ] **Step 7: ตรวจว่า compile ผ่าน**

```bash
npx tsc --noEmit
```

Expected: ไม่มี error ใหม่

- [ ] **Step 8: ทดสอบด้วยมือ**

```bash
make dev
```

จับคู่งานสองใบผ่าน API (ตาม Task 5) แล้วเปิดหน้า `/summary` ของคนขับนั้น
Expected: จำนวนเที่ยวลดลง 1 แต่ยอดค่าขนส่ง/ค่าเที่ยว/น้ำมันเท่าเดิม

- [ ] **Step 9: Commit**

```bash
git add lib/utils/summaryCalculator.ts lib/utils/summaryQuery.ts lib/utils/__tests__/summaryCalculator.test.ts
git commit -m "feat(summary): งานที่จับคู่แล้วนับเป็นเที่ยวเดียว

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: prefill-rates — ข้าม secondary และใช้อัตราคู่กับ primary

**Files:**
- Modify: `app/api/jobs/prefill-rates/route.ts:37-52` (where + select), `:80-105` (key)

**Interfaces:**
- Consumes: `getPairedSize` จาก Task 1, schema จาก Task 2
- Produces: ไม่มี (พฤติกรรมของ endpoint เดิม)

- [ ] **Step 1: กรอง secondary ออกจาก query**

ใน `app/api/jobs/prefill-rates/route.ts` เพิ่มใน `where` ของ `prisma.job.findMany` (ราวบรรทัด 38-43):

```ts
        // ใบที่ถูกจับคู่แล้วยอดต้องเป็น null เสมอ — ห้ามเติมกลับ
        pairLinkAsSecondary: null,
```

> **นี่คือจุดที่ feature จะพังเงียบๆ ถ้าลืม:** `where` มี `OR: [{ income: null }, { driverWage: null }]` ซึ่งใบ secondary เข้าเงื่อนไขเสมอ (null ทั้งคู่) ถ้าไม่กรองออก ยอดจะถูกเติมกลับทุกครั้งที่กดปุ่ม "ดึงข้อมูล" ทำให้ยอดเบิ้ลในหน้าสรุป

- [ ] **Step 2: เพิ่ม `pairLinkAsPrimary` ใน select**

ใน `select` (ต่อจาก `driverWage: true` ราวบรรทัด 51) เพิ่ม:

```ts
        pairLinkAsPrimary: { select: { id: true } },
```

- [ ] **Step 3: ใช้ paired size ตอนสร้าง key**

เพิ่ม import ที่หัวไฟล์:

```ts
import { getPairedSize, isTowingJobType } from "@/types/job";
```

(ไฟล์ import `isTowingJobType` อยู่แล้ว — รวมเป็นบรรทัดเดียว)

ในลูป `for (const job of jobs)` เพิ่มบรรทัดแรกสุด (ก่อน `const data = {}` บรรทัด ~81):

```ts
      // ใบที่ถือยอดของคู่ ใช้อัตราคู่ (2x20DC) แม้ size ใน DB ยังเป็น 20DC
      const rateSize = job.pairLinkAsPrimary
        ? getPairedSize(job.size) ?? job.size
        : job.size;
```

แล้วแทนที่ `job.size` ด้วย `rateSize` **ใน 4 จุด**:

1. เงื่อนไข income: `if (job.income === null && job.jobType && rateSize && job.factoryLocationId && job.customerId)`
2. key income: `` `${job.jobType}|${rateSize}|${job.factoryLocationId}|${job.customerId}` ``
3. เงื่อนไข driverWage: `if (job.driverWage === null && job.jobType && rateSize)`
4. key driverWage: `` `${job.jobType}|${rateSize}|${job.factoryLocationId ?? ""}` ``

- [ ] **Step 4: ตรวจว่า compile ผ่าน**

```bash
npx tsc --noEmit
```

Expected: ไม่มี error ใหม่

- [ ] **Step 5: ทดสอบด้วยมือ**

```bash
make dev
```

เตรียมข้อมูล: ตั้งอัตรา `RateIncome` และ `RateDriverWage` สำหรับ `inbound|2x20DC|<โรงงาน>|<ลูกค้า>` ผ่านหน้า `/jobs/settings/rates/income` และ `/driver-wage`

1. สร้างงาน 20DC สองใบ (วันเดียวกัน คนขับ/โรงงาน/ลูกค้าเดียวกัน) ยอดว่างทั้งคู่
2. จับคู่ผ่าน API
3. กดปุ่ม "ดึงข้อมูล" ในหน้า `/jobs`

Expected:
- ใบ primary ได้ยอดตามอัตรา `2x20DC`
- ใบ secondary ยังเป็น `null` ทั้งสองช่อง
- กดปุ่มซ้ำอีกครั้ง → ใบ secondary ยังเป็น `null` (ไม่ถูกเติมกลับ)

- [ ] **Step 6: Commit**

```bash
git add app/api/jobs/prefill-rates/route.ts
git commit -m "fix(jobs): ดึงข้อมูลทั้งเดือนใช้อัตราคู่กับใบที่ถือยอด และข้ามใบที่ถูกล้าง

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: JobFormModal — prefill ใช้อัตราคู่ + ปิดช่องของ secondary

**Files:**
- Modify: `components/jobs/JobFormModal.tsx:425-473` (prefill), `:1064-1077` (ปุ่มดึงข้อมูล), `:1518-1524` (ช่อง income/driverWage)

**Interfaces:**
- Consumes: `getPairedSize` จาก Task 1, `pairLinkAsPrimary`/`pairLinkAsSecondary` จาก Task 6
- Produces: ไม่มี

> **ขอบเขต:** modal ไม่มี UI จับคู่/ปลดคู่ (อยู่ที่ตารางอย่างเดียว) แต่ต้องรู้สถานะคู่เพื่อไม่ให้ดึงอัตราผิดและไม่ให้กรอกยอดใส่ใบที่ต้องเป็น null

- [ ] **Step 1: เพิ่ม derived state**

ใกล้ `const isTowingLinked = ...` (บรรทัด ~857) เพิ่ม:

```ts
  // จับคู่งาน — UI จับคู่อยู่ที่ตาราง modal แค่ใช้สถานะเพื่อดึงอัตราให้ถูกและกันแก้ยอด
  const isPairPrimary = !!activeJob?.pairLinkAsPrimary;
  const isPairSecondary = !!activeJob?.pairLinkAsSecondary;
  const pairPrimaryJobNumber = activeJob?.pairLinkAsSecondary?.primaryJob?.jobNumber ?? "";
```

- [ ] **Step 2: แก้ `prefillIncome` ให้ใช้ paired size**

ใน `prefillIncome` (บรรทัด ~425) เปลี่ยนบรรทัด `const size = form.getFieldValue("size");` เป็น:

```ts
    const rawSize = form.getFieldValue("size");
    // ใบที่ถือยอดของคู่ใช้อัตราคู่ (2x20DC) แม้ size ใน DB ยังเป็น 20DC
    const size = isPairPrimary ? getPairedSize(rawSize) ?? rawSize : rawSize;
```

- [ ] **Step 3: แก้ `prefillDriverWage` แบบเดียวกัน**

ใน `prefillDriverWage` (บรรทัด ~453) เปลี่ยน `const size = form.getFieldValue("size");` เป็นบล็อกเดียวกับ Step 2

- [ ] **Step 4: เพิ่ม import**

ที่บรรทัด 32 เพิ่ม `getPairedSize` เข้าไปใน import จาก `@/types/job`:

```ts
import { getPairedSize } from "@/types/job";
```

(ถ้ามี import จาก `@/types/job` อยู่แล้วให้รวมเข้าไป — ระวังว่าบรรทัด 32 เป็น `import type` ต้องแยกเป็น import ปกติเพราะ `getPairedSize` เป็นฟังก์ชัน)

- [ ] **Step 5: ซ่อนปุ่ม "ดึงข้อมูล" ของใบ secondary**

ที่บรรทัด ~1064 เปลี่ยนเงื่อนไข:

```ts
              {isAdmin && !isSpecialType && activeJob && !isPairSecondary && (
```

- [ ] **Step 6: ปิดช่องยอดของใบ secondary**

ที่ช่อง `income` (บรรทัด ~1518-1524) และ `driverWage` เพิ่ม `|| isPairSecondary` เข้าไปในเงื่อนไข `disabled` ที่มีอยู่ และเพิ่ม hint ใต้ช่อง:

```tsx
{isPairSecondary && (
  <div style={{ fontSize: 12, color: "#faad14", marginTop: 2 }}>
    ยอดรวมอยู่ที่ {pairPrimaryJobNumber}
  </div>
)}
```

- [ ] **Step 7: ตรวจว่า compile ผ่าน**

```bash
npx tsc --noEmit
```

Expected: ไม่มี error ใหม่

- [ ] **Step 8: ทดสอบด้วยมือ**

```bash
make dev
```

จับคู่งานสองใบ แล้วเปิด modal ของแต่ละใบ

Expected:
- ใบ primary: ปุ่ม "ดึงข้อมูล" แสดง กดแล้วได้อัตรา `2x20DC`
- ใบ secondary: ปุ่ม "ดึงข้อมูล" ไม่แสดง ช่องค่าขนส่ง/ค่าเที่ยว disabled พร้อมข้อความ "ยอดรวมอยู่ที่ JOB-xxxx"

- [ ] **Step 9: Commit**

```bash
git add components/jobs/JobFormModal.tsx
git commit -m "feat(jobs): ใบงานที่จับคู่แล้วดึงอัตราคู่ และปิดช่องยอดฝั่งที่ถูกล้าง

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Modal เลือกคู่ (`PairJobModal`)

**Files:**
- Create: `components/jobs/PairJobModal.tsx`

**Interfaces:**
- Consumes: `GET /api/jobs/[id]/pair-candidates` (Task 4), `POST /api/jobs/[id]/pair-link` (Task 5)
- Produces:

```ts
interface PairJobModalProps {
  open: boolean;
  job: { id: string; jobNumber: string; size: string | null; income: number | null; driverWage: number | null } | null;
  isAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;  // ให้ parent refresh ตาราง
}
export default function PairJobModal(props: PairJobModalProps): JSX.Element
```

- [ ] **Step 1: สร้าง component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Modal, Radio, Spin, Empty, App, Space, Alert } from 'antd'
import { getPairedSize } from '@/types/job'

interface PairCandidate {
  id: string
  jobNumber: string
  jobDate: string
  size: string | null
  customer: { name: string } | null
  factoryLocation: { name: string } | null
  income?: number | null
  driverWage?: number | null
  willBePrimary: boolean
}

interface PairJobModalProps {
  open: boolean
  job: {
    id: string
    jobNumber: string
    size: string | null
    income: number | null
    driverWage: number | null
  } | null
  isAdmin: boolean
  onClose: () => void
  onSuccess: () => void
}

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString()

export default function PairJobModal({
  open, job, isAdmin, onClose, onSuccess,
}: PairJobModalProps) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [candidates, setCandidates] = useState<PairCandidate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !job) return
    setLoading(true)
    setSelectedId(null)
    fetch(`/api/jobs/${job.id}/pair-candidates`)
      .then((r) => r.json())
      .then((d: { jobs?: PairCandidate[] }) => {
        const list = d.jobs ?? []
        setCandidates(list)
        if (list.length === 1) setSelectedId(list[0].id)
      })
      .catch(() => message.error('เกิดข้อผิดพลาดในการดึงข้อมูล'))
      .finally(() => setLoading(false))
  }, [open, job, message])

  const selected = candidates.find((c) => c.id === selectedId) ?? null
  const pairedSize = getPairedSize(job?.size ?? null)

  const handleConfirm = async () => {
    if (!job || !selectedId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/pair-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherJobId: selectedId }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || 'จับคู่ไม่สำเร็จ')
        return
      }
      message.success(`จับคู่ ${job.jobNumber} + ${selected?.jobNumber} เรียบร้อย`)
      onSuccess()
      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาดในการจับคู่')
    } finally {
      setSaving(false)
    }
  }

  // ใบไหนถือยอด — candidate ที่ willBePrimary หรือใบที่เปิดอยู่
  const primaryLabel = selected
    ? selected.willBePrimary ? selected.jobNumber : job?.jobNumber
    : ''
  const clearedLabel = selected
    ? selected.willBePrimary ? job?.jobNumber : selected.jobNumber
    : ''
  const clearedAmounts = selected
    ? selected.willBePrimary
      ? { income: job?.income ?? null, driverWage: job?.driverWage ?? null }
      : { income: selected.income ?? null, driverWage: selected.driverWage ?? null }
    : null
  const primaryHasRate = selected
    ? selected.willBePrimary
      ? selected.income != null || selected.driverWage != null
      : (job?.income ?? null) != null || (job?.driverWage ?? null) != null
    : false

  return (
    <Modal
      open={open}
      title={`จับคู่งาน — ${job?.jobNumber ?? ''}`}
      onCancel={onClose}
      onOk={handleConfirm}
      okText="ยืนยัน"
      cancelText="ยกเลิก"
      okButtonProps={{
        disabled: !selectedId || loading,
        loading: saving,
        'data-testid': 'pair-confirm-btn',
      }}
      destroyOnHidden
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : candidates.length === 0 ? (
        <Empty description="ไม่มีงานที่จับคู่ได้" />
      ) : (
        <>
          <div style={{ marginBottom: 8, fontSize: 13, color: '#595959' }}>
            เลือกงานที่วิ่งไปด้วยกัน:
          </div>
          <Radio.Group
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {candidates.map((c) => (
                <Radio key={c.id} value={c.id} data-testid={`pair-candidate-${c.jobNumber}`}>
                  {c.jobNumber} · {c.size ?? '—'}
                  {c.factoryLocation ? ` · ${c.factoryLocation.name}` : ''}
                  {c.customer ? ` · ${c.customer.name}` : ''}
                  {isAdmin && c.income != null ? ` · ค่าขนส่ง ${fmt(c.income)}` : ''}
                </Radio>
              ))}
            </Space>
          </Radio.Group>

          {selected && (
            <div
              style={{
                marginTop: 16, padding: 12,
                background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 6,
                fontSize: 13, lineHeight: 1.8,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 4 }}>ผลลัพธ์:</div>
              <div>ยอดจะไปรวมที่ → <b>{primaryLabel}</b> (สร้างทีหลัง)</div>
              <div>
                {isAdmin && clearedAmounts
                  ? `ยอดที่จะถูกล้าง → ${clearedLabel}: ค่าขนส่ง ${fmt(clearedAmounts.income)} · ค่าเที่ยว ${fmt(clearedAmounts.driverWage)}`
                  : `ยอดของ ${clearedLabel} จะถูกล้าง`}
              </div>
              <div>อัตราที่จะใช้ → <b>{pairedSize ?? '—'}</b></div>
            </div>
          )}

          {isAdmin && selected && primaryHasRate && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message={`${primaryLabel} มียอดอยู่แล้ว — ปุ่ม "ดึงข้อมูล" จะไม่ทับ ต้องล้างยอดเองก่อน`}
            />
          )}
        </>
      )}
    </Modal>
  )
}
```

> **หมายเหตุ antd:** ไม่ใส่ `data-testid` บน `<Modal>` (antd render root div ไว้เสมอแม้ `open={false}` ทำให้ `toBeVisible()` fail) — E2E ใช้ `page.getByRole('dialog')` แทน

- [ ] **Step 2: ตรวจว่า compile ผ่าน**

```bash
npx tsc --noEmit
```

Expected: ไม่มี error ใหม่

- [ ] **Step 3: Commit**

```bash
git add components/jobs/PairJobModal.tsx
git commit -m "feat(jobs): เพิ่ม modal เลือกงานจับคู่พร้อมแสดงผลลัพธ์ก่อนยืนยัน

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: ตาราง — ปุ่มจับคู่ + Tag + ปิดช่องยอด

**Files:**
- Modify: `components/jobs/EditableJobTable.tsx` — props (บรรทัด ~35, ~60), คอลัมน์ JOB (~556-570), คอลัมน์การเงิน (~638-662), คอลัมน์ action (~809-843), `rowClassName` (~975-986), render modal (~1051)
- Modify: `app/(protected)/jobs/[driverId]/page.tsx:28-40`

**Interfaces:**
- Consumes: `PairJobModal` (Task 10), `isPairableJobType`/`isPairableSize`/`getPairedSize` (Task 1), `DELETE /api/jobs/[id]/pair-link` (Task 5)
- Produces: prop `canPairJobs: boolean` บน `EditableJobTable`

- [ ] **Step 1: ส่ง prop จาก page**

ใน `app/(protected)/jobs/[driverId]/page.tsx` เปลี่ยนบรรทัด 28:

```ts
  const role = (session.user as { role?: string }).role
  const isAdmin = role === 'ADMIN'
  const canPairJobs = role === 'ADMIN' || role === 'SENIOR_STAFF'
```

แล้วส่ง prop เพิ่มที่บรรทัด ~37:

```tsx
        isAdmin={isAdmin}
        canPairJobs={canPairJobs}
```

- [ ] **Step 2: รับ prop ใน `EditableJobTable`**

บรรทัด ~35 เพิ่มใน interface props:

```ts
  /** ADMIN | SENIOR_STAFF — แยกจาก isAdmin ที่คุมการมองเห็นคอลัมน์การเงิน */
  canPairJobs: boolean
```

บรรทัด ~60 เพิ่มใน destructure:

```ts
  canPairJobs,
```

- [ ] **Step 3: เพิ่ม state + helper**

ใกล้ state อื่นๆ ที่หัว component:

```ts
  const [pairModalJob, setPairModalJob] = useState<Job | null>(null)
  const [unpairingId, setUnpairingId] = useState<string | null>(null)

  const pairInfo = (row: RowData) => {
    const j = row as Job
    const asPrimary = j.pairLinkAsPrimary
    const asSecondary = j.pairLinkAsSecondary
    return {
      isPrimary: !!asPrimary,
      isSecondary: !!asSecondary,
      isPaired: !!asPrimary || !!asSecondary,
      otherJobNumber:
        asPrimary?.secondaryJob?.jobNumber ?? asSecondary?.primaryJob?.jobNumber ?? '',
    }
  }

  const canPairRow = (row: RowData) => {
    const j = row as Job
    return (
      isPairableJobType(j.jobType) &&
      isPairableSize(j.size) &&
      !j.clearStatus &&
      !j.isCancelled &&
      !pairInfo(row).isPaired
    )
  }

  const handleUnpair = async (row: RowData) => {
    setUnpairingId(row.id)
    try {
      const res = await fetch(`/api/jobs/${row.id}/pair-link`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || 'ปลดคู่ไม่สำเร็จ')
        return
      }
      message.success('ปลดคู่เรียบร้อย')
      await fetchJobs()
    } catch {
      message.error('เกิดข้อผิดพลาดในการปลดคู่')
    } finally {
      setUnpairingId(null)
    }
  }
```

> ใช้ชื่อฟังก์ชัน refresh ตารางที่มีอยู่แล้วในไฟล์ (ตรวจชื่อจริงก่อน — อาจเป็น `fetchJobs`, `loadJobs` หรือ `refresh`)

เพิ่ม import:

```ts
import { LinkOutlined, DisconnectOutlined } from '@ant-design/icons'
import { isPairableJobType, isPairableSize, getPairedSize } from '@/types/job'
import PairJobModal from './PairJobModal'
import { Tag, Tooltip } from 'antd'
```

- [ ] **Step 4: เพิ่ม Tag ในคอลัมน์ JOB**

ในคอลัมน์ `jobNumber` (บรรทัด ~562-569) ครอบ `renderCell` ด้วย wrapper:

```tsx
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {renderCell(row, 'jobNumber', 'text', undefined, {
                  disabled: isAdvanceType(row),
                })}
                {(() => {
                  const p = pairInfo(row)
                  if (!p.isPaired) return null
                  return p.isPrimary ? (
                    <Tooltip title={`จับคู่กับ ${p.otherJobNumber}`}>
                      <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                        {getPairedSize((row as Job).size) ?? '2x'}
                      </Tag>
                    </Tooltip>
                  ) : (
                    <Tooltip title={`ยอดรวมอยู่ที่ ${p.otherJobNumber}`}>
                      <Tag style={{ margin: 0, fontSize: 11 }}>จับคู่</Tag>
                    </Tooltip>
                  )
                })()}
              </span>
            )
```

- [ ] **Step 5: ปิดช่องยอดของใบ secondary**

ในคอลัมน์ `income` (บรรทัด ~648) และ `driverWage` (บรรทัด ~658) เปลี่ยน `disabled`:

```ts
                renderCell(row, 'income', 'number', undefined, {
                  disabled: isAdvanceType(row) || pairInfo(row).isSecondary,
                }),
```

(ทำแบบเดียวกันกับ `driverWage`)

- [ ] **Step 6: เพิ่มปุ่มจับคู่เป็นคอลัมน์ซ้ายสุดของกลุ่ม action**

แทรกคอลัมน์ใหม่**ก่อน**คอลัมน์ `clearStatus` (บรรทัด ~809):

```ts
        ...(canPairJobs
          ? [{
              title: '',
              key: 'pairLink',
              width: 40,
              fixed: 'right' as const,
              align: 'center' as const,
              render: (_: unknown, row: RowData) => {
                if (isBanner(row)) return null
                if (row.jobType === 'advance' || row.jobType === 'noJob') return null
                const p = pairInfo(row)

                if (p.isPaired) {
                  const busy = unpairingId === row.id
                  return (
                    <Button
                      data-testid={`job-unpair-btn-${row.id}`}
                      type="link"
                      size="small"
                      icon={busy ? <LoadingOutlined /> : <DisconnectOutlined style={{ color: '#fa8c16' }} />}
                      disabled={busy || row.clearStatus}
                      title={`ปลดคู่กับ ${p.otherJobNumber}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        modal.confirm({
                          title: `ปลดคู่ ${(row as Job).jobNumber} + ${p.otherJobNumber}?`,
                          content: p.isPrimary
                            ? `ยอดของ ${p.otherJobNumber} จะยังเป็นค่าว่าง — ต้องกรอกหรือกด "ดึงข้อมูล" เอง และยอดของใบนี้จะยังเป็นอัตราคู่`
                            : `ยอดของใบนี้จะยังเป็นค่าว่าง — ต้องกรอกหรือกด "ดึงข้อมูล" เอง และยอดของ ${p.otherJobNumber} จะยังเป็นอัตราคู่`,
                          okText: 'ปลดคู่',
                          cancelText: 'ยกเลิก',
                          onOk: () => handleUnpair(row),
                        })
                      }}
                    />
                  )
                }

                if (!canPairRow(row)) return null
                return (
                  <Button
                    data-testid={`job-pair-btn-${row.id}`}
                    type="link"
                    size="small"
                    icon={<LinkOutlined />}
                    title="จับคู่งาน"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPairModalJob(row as Job)
                    }}
                  />
                )
              },
            }]
          : []),
```

และปรับ `width` ของคอลัมน์ที่ [บรรทัด 786](components/jobs/EditableJobTable.tsx#L786) (`width: isAdmin ? 124 : 84`) ให้เผื่อปุ่มใหม่ — เพิ่ม 40:

```ts
      width: (isAdmin ? 124 : 84) + (canPairJobs ? 40 : 0),
```

- [ ] **Step 7: เพิ่ม `paired-row` ใน `rowClassName`**

ที่บรรทัด ~975-986 เพิ่มบรรทัดก่อน `if (modalEditMode) return 'clickable-row'`:

```ts
          if (pairInfo(r).isPaired) return 'paired-row'
```

และเพิ่ม CSS ใน `<style jsx>` ที่อยู่**ในไฟล์เดียวกัน** (บรรทัด ~1085-1115 ใกล้ `.locked-row`) — ไม่ได้อยู่ใน `globals.css`

ต้องเขียนครบ **4 rule** ตาม pattern ของ row class อื่นในบล็อกนั้น ไม่งั้นเซลล์ที่ `fixed: 'left'/'right'` จะพื้นขาวไม่ตรงกับแถว:

```css
        .paired-row td {
          background-color: #f0f7ff !important;
        }
        .paired-row:hover td {
          background-color: #d6e9ff !important;
        }
        .paired-row td.ant-table-cell-fix-left,
        .paired-row td.ant-table-cell-fix-right {
          background-color: #f0f7ff !important;
        }
        .paired-row:hover td.ant-table-cell-fix-left,
        .paired-row:hover td.ant-table-cell-fix-right {
          background-color: #d6e9ff !important;
        }
```

- [ ] **Step 8: render `PairJobModal`**

ใกล้ `<JobFormModal ... />` (บรรทัด ~1051) เพิ่ม:

```tsx
      <PairJobModal
        open={!!pairModalJob}
        job={
          pairModalJob
            ? {
                id: pairModalJob.id,
                jobNumber: pairModalJob.jobNumber,
                size: pairModalJob.size,
                income: pairModalJob.income,
                driverWage: pairModalJob.driverWage,
              }
            : null
        }
        isAdmin={isAdmin}
        onClose={() => setPairModalJob(null)}
        onSuccess={fetchJobs}
      />
```

- [ ] **Step 9: ตรวจว่า compile ผ่าน**

```bash
npx tsc --noEmit
npm run lint
```

Expected: ไม่มี error ใหม่

- [ ] **Step 10: ทดสอบด้วยมือ**

```bash
make dev
```

เปิด `/jobs/<driverId>` ด้วยบัญชี ADMIN:

Expected:
- งาน 20DC ที่จับคู่ได้ มีปุ่ม 🔗 ซ้ายสุดของกลุ่ม icon ขวา
- กดแล้วเปิด modal เห็น candidate + บล็อกผลลัพธ์
- ยืนยันแล้ว ตาราง refresh ทั้งสองแถวพื้นฟ้าอ่อน มี Tag `2x20DC` / `จับคู่`
- ช่องค่าขนส่ง/ค่าเที่ยวของใบ secondary กดแก้ไม่ได้
- ปุ่มเปลี่ยนเป็น 🔗̸ สีส้ม กดแล้วปลดคู่ได้

ทดสอบด้วยบัญชี SENIOR_STAFF:
- ปุ่มจับคู่ยังใช้ได้เต็มที่
- modal ไม่แสดงตัวเลขยอด (แสดง "ยอดของ JOB-xxxx จะถูกล้าง")
- ไม่เห็นคอลัมน์ค่าขนส่ง/ค่าเที่ยวคนขับ (ตามเดิม)

ทดสอบด้วยบัญชี STAFF:
- ไม่เห็นปุ่มจับคู่เลย

- [ ] **Step 11: Commit**

```bash
git add components/jobs/EditableJobTable.tsx "app/(protected)/jobs/[driverId]/page.tsx"
git commit -m "feat(jobs): เพิ่มปุ่มจับคู่งานในตาราง พร้อมแสดงสถานะและปิดช่องยอดฝั่งที่ถูกล้าง

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: E2E

**Files:**
- Create: `e2e/jobs/job-pairing.spec.ts`

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า
- Produces: ไม่มี

- [ ] **Step 1: อ่าน spec ที่มีอยู่เพื่อ copy pattern**

```bash
sed -n '1,80p' e2e/jobs/job-core.spec.ts
ls e2e/scripts e2e/auth
```

ดู pattern การ login (น่าจะใช้ storage state จาก `e2e/auth/`), การสร้างงาน, และ helper ใน `e2e/scripts/` — **ใช้ helper เดิม อย่าเขียนใหม่**

ไฟล์ใหม่วางใน `e2e/jobs/` ให้ตรงกับ spec อื่นของโดเมนเดียวกัน

- [ ] **Step 2: เขียน E2E**

สร้าง `e2e/jobs/job-pairing.spec.ts` ครอบคลุม (ปรับ selector ให้ตรงกับ helper ที่เจอใน Step 1):

```ts
import { test, expect } from '@playwright/test'
// import helper เดิมจาก e2e/ ตามที่เจอใน Step 1

test.describe('จับคู่งาน', () => {
  test('จับคู่งาน 20DC สองใบ → ยอดใบเก่าถูกล้าง ใบใหม่ถือยอด', async ({ page }) => {
    // 1. login เป็น ADMIN
    // 2. สร้างงาน inbound 20DC สองใบ วันเดียวกัน คนขับ/โรงงาน/ลูกค้าเดียวกัน กรอกยอดทั้งคู่
    // 3. กดปุ่ม job-pair-btn-<id> ของใบแรก
    // 4. ใน dialog เลือก candidate แล้วกด pair-confirm-btn
    await expect(page.getByRole('dialog')).toBeVisible()
    // 5. ตรวจว่าใบที่สร้างทีหลังยังมียอด ใบแรกเป็น —
    // 6. ตรวจว่ามี Tag 2x20DC และ จับคู่
  })

  test('ปลดคู่ → ทั้งสองใบกลับมาแก้ยอดได้', async ({ page }) => {
    // จับคู่แล้วกด job-unpair-btn-<id> → ยืนยันใน modal.confirm
    // ตรวจว่า Tag หายและช่องยอดแก้ได้
  })

  test('งานคนละโรงงานไม่ขึ้นเป็น candidate', async ({ page }) => {
    // สร้างสองใบ โรงงานต่างกัน → เปิด modal ต้องเห็น "ไม่มีงานที่จับคู่ได้"
    await expect(page.getByText('ไม่มีงานที่จับคู่ได้')).toBeVisible()
  })

  test('งานคนละวันไม่ขึ้นเป็น candidate', async ({ page }) => {
    // สร้างสองใบ วันต่างกัน → "ไม่มีงานที่จับคู่ได้"
  })

  test('งาน 40DC ไม่มีปุ่มจับคู่', async ({ page }) => {
    // สร้างงาน 40DC → ปุ่ม job-pair-btn ต้องไม่มี
  })

  test('งานที่เคลียร์แล้วไม่มีปุ่มจับคู่', async ({ page }) => {
    // สร้างงาน 20DC แล้วเคลียร์ → ปุ่ม job-pair-btn ต้องไม่มี
  })

  test('ดึงข้อมูลไม่เติมยอดกลับให้ใบที่ถูกล้าง', async ({ page }) => {
    // ตั้งอัตรา 2x20DC → จับคู่ → กดดึงข้อมูลสองครั้ง
    // ใบ primary ได้อัตราคู่ ใบ secondary ยังเป็น —
  })

  test('หน้าสรุปนับเที่ยวลดลงหลังจับคู่', async ({ page }) => {
    // ดูจำนวนเที่ยวก่อน/หลังจับคู่ ต้องลดลง 1
  })
})
```

- [ ] **Step 3: รัน E2E**

```bash
npx playwright test e2e/jobs/job-pairing.spec.ts --workers=1
```

Expected: PASS ทั้งหมด

> ถ้า container ยังไม่มี:
> ```bash
> docker run -d --name syl-e2e-db --restart unless-stopped \
>   -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2epass -e POSTGRES_DB=syl_e2e \
>   -p 5442:5432 postgres:16-alpine
> ```

- [ ] **Step 4: รัน E2E ทั้งชุดเพื่อตรวจ regression**

```bash
npx playwright test --workers=1
```

Expected: PASS ทั้งหมด

> **หมายเหตุ:** test "อัตราค่าเที่ยวคนขับ Case 1" ในชุด settings เคย flaky เมื่อรันต่อจาก test อื่น ถ้า fail ให้รันเดี่ยวเพื่อยืนยันว่าไม่ใช่ regression จากงานนี้

- [ ] **Step 5: รัน unit test ทั้งหมด**

```bash
npx tsx --test lib/utils/__tests__/jobPairing.test.ts
npx tsx --test lib/utils/__tests__/summaryCalculator.test.ts
npx tsx --test lib/utils/__tests__/fuelRateExcel.test.ts
```

Expected: PASS ทั้งหมด

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: build สำเร็จ ไม่มี type error

- [ ] **Step 7: Commit**

```bash
git add e2e/jobs/job-pairing.spec.ts
git commit -m "test(e2e): เพิ่ม test การจับคู่งาน

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Post-Implementation

- [ ] รัน `npx gitnexus analyze` เพื่ออัปเดต knowledge graph
- [ ] `make migrate-prod` ตอน deploy production (schema เปลี่ยน)
- [ ] ตั้งอัตรา `2x20DC` / `2x20RF` ใน `RateIncome`, `RateDriverWage` ของ production ก่อนเปิดใช้ feature — ไม่งั้นกด "ดึงข้อมูล" แล้วจะไม่ได้ยอด
