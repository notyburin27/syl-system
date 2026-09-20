# ทอยตู้ถูกดูดซับโดยงานหลัก (Towing Absorbed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** งานหลัก (ขาเข้า/ขาออก) ที่รับตู้จาก "คาหาง" หรือ "รับเช้าเดินทาง" ดูดซับทอยตู้ที่เป็นขาเตรียมของมัน — ล้างค่าเที่ยวทอยตู้และไม่นับเป็นเที่ยวในหน้าสรุป

**Architecture:** ไม่มีตาราง link และไม่มีปุ่มจับคู่ — ระบบคำนวณจากข้อมูลที่มี (วัน/ลูกค้า/คนขับ/size/createdAt) แล้วบันทึกผลลงใน flag `isTowingAbsorbed` บน `Job` เพื่อให้เงินกับจำนวนเที่ยวเปลี่ยนพร้อมกันเสมอ กฎอยู่ใน helper ตัวเดียวที่ใช้ร่วมกันทุกจุด

**Tech Stack:** Next.js 15 (App Router), Prisma v7.8, Ant Design v5, TypeScript, `node:test` (unit), Playwright (E2E)

**Spec:** [docs/superpowers/specs/2026-09-20-towing-absorbed-design.md](../specs/2026-09-20-towing-absorbed-design.md)

## Global Constraints

- ตอบกลับผู้ใช้เป็นภาษาไทยเสมอ — error message ใน API และข้อความ UI ทั้งหมดเป็นภาษาไทย
- `<Table>` ทุกตัวต้องมี `size="small"`
- Confirm การลบ/action สำคัญใช้ `App.useApp().modal` → `modal.confirm({...})` **ไม่ใช้ `Popconfirm`**
- API auth pattern: `const session = await auth(); if (!session?.user) return 401`
- Prisma migration ใช้ `make migrate-stag` — **ไม่ใช้** `prisma migrate dev`
- Prisma unique-violation ใช้ `error.code === "P2002"` (โปรเจกต์ใช้ Prisma **7.8.0** ไม่ใช่ v6)
- Unit test รันด้วย `npx tsx --test <path>` (โปรเจกต์ใช้ `node:test` ไม่ใช่ Jest)
- E2E ต้องรันด้วย `npx playwright test --workers=1`
- **อย่ารัน `npm run lint`** — พังทั้งโปรเจกต์อยู่แล้ว (ESLint 9 vs `next lint` เก่า) ไม่เกี่ยวกับงานนี้
- `npx tsc --noEmit` มี **2 pre-existing errors** (`app/api/convert-statement/route.ts`, `prisma/seed.ts`) — เกินจากนี้คือของใหม่
- `data-testid` ใส่บน Button/Input ได้โดยตรง แต่ Select/DatePicker ต้องใช้ `id` prop และห้ามใส่บน `<Modal>`
- ทุก field ใหม่ใน `SummaryJobInput` ต้องเป็น **optional** — test เดิม 20 ตัวสร้าง job object inline ครบทุก field
- Git commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- ทำงานบน branch `feat/job-pairing`

## File Structure

**สร้างใหม่:**

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/utils/towingAbsorb.ts` | กฎการดูดซับที่ใช้ร่วมกันทุกจุด — single source of truth |
| `lib/utils/__tests__/towingAbsorb.test.ts` | unit test ของ helper |
| `app/api/jobs/[id]/absorb-towing/route.ts` | POST — คำนวณการดูดซับใหม่สำหรับงานหลักใบหนึ่ง |
| `e2e/jobs/towing-absorb.spec.ts` | E2E |

**แก้ไข:**

| ไฟล์ | สิ่งที่แก้ |
|---|---|
| `prisma/schema.prisma` | เพิ่ม `isTowingAbsorbed` ใน `Job` |
| `types/job.ts` | เพิ่ม `isTowingAbsorbed` ใน `Job` interface |
| `app/api/jobs/prefill-rates/route.ts` | กรองใบที่ถูกดูดซับออก + ดูดซับหลังเติมอัตรา |
| `app/api/jobs/[id]/route.ts` | guard ห้ามแก้ `driverWage` + คำนวณใหม่เมื่อแก้ field ที่เกี่ยวข้อง |
| `lib/utils/summaryCalculator.ts` | ไม่นับใบที่ถูกดูดซับใน `towingTrips` |
| `lib/utils/summaryQuery.ts` | select + map `isTowingAbsorbed` |
| `components/jobs/EditableJobTable.tsx` | Tag บอกสถานะ |
| `components/jobs/JobFormModal.tsx` | disable ช่องค่าเที่ยว + ซ่อนปุ่มดึงข้อมูล + trigger ตอนเลือกสถานที่ |

**ลำดับ:** helper → schema → API → summary → UI → E2E

---

### Task 1: กฎการดูดซับ (`towingAbsorb.ts`)

**Files:**
- Create: `lib/utils/towingAbsorb.ts`
- Test: `lib/utils/__tests__/towingAbsorb.test.ts`

**Interfaces:**
- Consumes: `isTowingJobType` จาก `@/types/job` (มีอยู่แล้ว)
- Produces:
  - `ABSORB_PICKUP_NAMES: readonly ["คาหาง", "รับเช้าเดินทาง"]`
  - `isAbsorbPickupName(name: string | null | undefined): boolean`
  - `interface AbsorbJob { id, jobDate, jobType, size, driverId, customerId, createdAt, isCancelled, clearStatus }`
  - `isAbsorbedBy(towing: AbsorbJob, main: AbsorbJob): boolean`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

สร้าง `lib/utils/__tests__/towingAbsorb.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAbsorbPickupName, isAbsorbedBy, type AbsorbJob } from '../towingAbsorb'

const main = (over: Partial<AbsorbJob> = {}): AbsorbJob => ({
  id: 'main1',
  jobDate: new Date('2026-08-25'),
  jobType: 'outbound',
  size: '20DC',
  driverId: 'd1',
  customerId: 'c1',
  createdAt: new Date('2026-08-24T09:37:00Z'),
  isCancelled: false,
  clearStatus: false,
  ...over,
})

const towing = (over: Partial<AbsorbJob> = {}): AbsorbJob => ({
  id: 'tow1',
  jobDate: new Date('2026-08-25'),
  jobType: 'towing',
  size: '20DC',
  driverId: 'd1',
  customerId: 'c1',
  createdAt: new Date('2026-08-24T09:36:00Z'),
  isCancelled: false,
  clearStatus: false,
  ...over,
})

test('isAbsorbPickupName: คาหาง และ รับเช้าเดินทาง เป็นตัวชี้', () => {
  assert.equal(isAbsorbPickupName('คาหาง'), true)
  assert.equal(isAbsorbPickupName('รับเช้าเดินทาง'), true)
})

test('isAbsorbPickupName: สถานที่อื่นไม่ใช่ตัวชี้', () => {
  assert.equal(isAbsorbPickupName('BBT'), false)
  assert.equal(isAbsorbPickupName('ท่าเรือคลองเตย'), false)
  assert.equal(isAbsorbPickupName(''), false)
  assert.equal(isAbsorbPickupName(null), false)
  assert.equal(isAbsorbPickupName(undefined), false)
})

test('isAbsorbedBy: เข้าเกณฑ์ครบ', () => {
  assert.equal(isAbsorbedBy(towing(), main()), true)
})

test('isAbsorbedBy: ทอยตู้หนักก็ถูกดูดซับได้', () => {
  assert.equal(isAbsorbedBy(towing({ jobType: 'towingHeavy' }), main()), true)
})

test('isAbsorbedBy: ต้องเป็นทอยตู้เท่านั้น', () => {
  assert.equal(isAbsorbedBy(towing({ jobType: 'inbound' }), main()), false)
  assert.equal(isAbsorbedBy(towing({ jobType: 'outbound' }), main()), false)
  assert.equal(isAbsorbedBy(towing({ jobType: 'flatbed' }), main()), false)
})

test('isAbsorbedBy: คนละวันไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ jobDate: new Date('2026-08-26') }), main()), false)
})

test('isAbsorbedBy: คนละลูกค้าไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ customerId: 'c2' }), main()), false)
})

test('isAbsorbedBy: ลูกค้า null ทั้งคู่ก็ไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ customerId: null }), main({ customerId: null })), false)
})

test('isAbsorbedBy: คนละคนขับไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ driverId: 'd2' }), main()), false)
})

test('isAbsorbedBy: คนขับ null ไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ driverId: null }), main({ driverId: null })), false)
})

test('isAbsorbedBy: คนละ size ไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ size: '2x20DC' }), main({ size: '20DC' })), false)
})

test('isAbsorbedBy: size null ทั้งคู่ไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ size: null }), main({ size: null })), false)
})

test('isAbsorbedBy: ทอยตู้ที่สร้างหลังงานหลักไม่ถูกดูดซับ', () => {
  const t = towing({ createdAt: new Date('2026-08-24T09:38:00Z') })
  assert.equal(isAbsorbedBy(t, main()), false)
})

test('isAbsorbedBy: createdAt เท่ากันเป๊ะไม่ถูกดูดซับ', () => {
  const same = new Date('2026-08-24T09:37:00Z')
  assert.equal(isAbsorbedBy(towing({ createdAt: same }), main({ createdAt: same })), false)
})

test('isAbsorbedBy: งานที่ยกเลิกไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ isCancelled: true }), main()), false)
  assert.equal(isAbsorbedBy(towing(), main({ isCancelled: true })), false)
})

test('isAbsorbedBy: งานที่เคลียร์แล้วไม่ถูกดูดซับ', () => {
  assert.equal(isAbsorbedBy(towing({ clearStatus: true }), main()), false)
  assert.equal(isAbsorbedBy(towing(), main({ clearStatus: true })), false)
})

test('isAbsorbedBy: ดูดซับตัวเองไม่ได้', () => {
  const j = towing({ id: 'same' })
  assert.equal(isAbsorbedBy(j, main({ id: 'same' })), false)
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx tsx --test lib/utils/__tests__/towingAbsorb.test.ts
```

Expected: FAIL — `Cannot find module '../towingAbsorb'`

- [ ] **Step 3: สร้าง `lib/utils/towingAbsorb.ts`**

```ts
import { isTowingJobType } from "@/types/job";

/**
 * ชื่อสถานที่รับตู้ที่บอกว่า "ตู้อยู่บนหางอยู่แล้ว"
 * ไม่ใช่สถานที่จริง แต่เป็นสถานะที่เกิดจากทอยตู้ของวันก่อนหน้า
 */
export const ABSORB_PICKUP_NAMES = ["คาหาง", "รับเช้าเดินทาง"] as const;

export function isAbsorbPickupName(name: string | null | undefined): boolean {
  return !!name && (ABSORB_PICKUP_NAMES as readonly string[]).includes(name);
}

/** ข้อมูลขั้นต่ำที่ใช้ตัดสินการดูดซับ */
export interface AbsorbJob {
  id: string;
  jobDate: Date;
  jobType: string;
  size: string | null;
  driverId: string | null;
  customerId: string | null;
  createdAt: Date;
  isCancelled: boolean;
  clearStatus: boolean;
}

/** เทียบเฉพาะวัน — jobDate เก็บเป็น @db.Date อยู่แล้วแต่กันพลาด */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * ทอยตู้ใบนี้ถูกงานหลักใบนั้นดูดซับไหม
 *
 * ผู้เรียกต้องเช็คก่อนแล้วว่างานหลักมี pickupLocation เป็นคาหาง/รับเช้าเดินทาง
 * (ด้วย isAbsorbPickupName) เพราะฟังก์ชันนี้ไม่มีข้อมูลสถานที่
 */
export function isAbsorbedBy(towing: AbsorbJob, main: AbsorbJob): boolean {
  if (towing.id === main.id) return false;
  if (!isTowingJobType(towing.jobType)) return false;

  if (towing.isCancelled || main.isCancelled) return false;
  if (towing.clearStatus || main.clearStatus) return false;

  if (!towing.driverId || !main.driverId || towing.driverId !== main.driverId) return false;
  if (!towing.customerId || !main.customerId || towing.customerId !== main.customerId) return false;
  if (!towing.size || !main.size || towing.size !== main.size) return false;

  if (!isSameDay(towing.jobDate, main.jobDate)) return false;

  // ทอยตู้ต้องถูกบันทึกก่อนงานหลัก — ลากตู้มาคาไว้ก่อนแล้วค่อยวิ่งงาน
  if (towing.createdAt >= main.createdAt) return false;

  return true;
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx tsx --test lib/utils/__tests__/towingAbsorb.test.ts
```

Expected: PASS ทั้ง 16 tests

- [ ] **Step 5: Commit**

```bash
git add lib/utils/towingAbsorb.ts lib/utils/__tests__/towingAbsorb.test.ts
git commit -m "feat(jobs): เพิ่มกฎการดูดซับทอยตู้โดยงานหลักที่รับตู้จากคาหาง

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Schema + type

**Files:**
- Modify: `prisma/schema.prisma` (กลุ่ม Status fields ใน `model Job`, ถัดจาก `isCarry` ราวบรรทัด 313)
- Modify: `types/job.ts` (ถัดจาก `isCarry: boolean;` บรรทัด ~155)

**Interfaces:**
- Consumes: ไม่มี
- Produces: `Job.isTowingAbsorbed: boolean` ทั้งใน Prisma client และ TypeScript

- [ ] **Step 1: เพิ่ม field ใน schema**

ใน `prisma/schema.prisma` ต่อจาก `isCarry Boolean @default(false)`:

```prisma
  /// ทอยตู้ที่ถูกงานหลัก (รับตู้จากคาหาง/รับเช้าเดินทาง) ดูดซับ
  /// ค่าเที่ยวถูกล้างแล้ว และไม่นับเป็นเที่ยวในหน้าสรุป
  isTowingAbsorbed  Boolean   @default(false)
```

- [ ] **Step 2: เพิ่มใน TypeScript interface**

ใน `types/job.ts` ต่อจาก `isCarry: boolean;`:

```ts
  /** ทอยตู้ที่ถูกงานหลักดูดซับ — ค่าเที่ยวถูกล้าง ไม่นับเป็นเที่ยว */
  isTowingAbsorbed: boolean;
```

- [ ] **Step 3: Generate client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` ไม่มี error

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: เหลือ 2 pre-existing errors เท่านั้น

> ถ้ามี error เพิ่มเรื่อง `isTowingAbsorbed` ขาดในที่ที่สร้าง `Job` object — แปลว่ามี mock/fixture ที่ต้องเติม field ให้ครบ หาด้วย `grep -rn "isCarry:" --include='*.ts' --include='*.tsx' app components lib e2e | grep -v node_modules`

- [ ] **Step 5: Push schema ไป staging**

```bash
make migrate-stag
```

Expected: `Your database is now in sync with your Prisma schema`

- [ ] **Step 6: Commit (เฉพาะ schema กับ types — ห้าม commit `app/generated/`)**

```bash
git add prisma/schema.prisma types/job.ts
git commit -m "feat(db): เพิ่ม isTowingAbsorbed สำหรับทอยตู้ที่ถูกดูดซับ

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: API — `POST /api/jobs/[id]/absorb-towing`

**Files:**
- Create: `app/api/jobs/[id]/absorb-towing/route.ts`

**Interfaces:**
- Consumes: `isAbsorbPickupName`, `isAbsorbedBy`, `AbsorbJob` จาก Task 1; `Job.isTowingAbsorbed` จาก Task 2
- Produces: `POST /api/jobs/[id]/absorb-towing` → `{ absorbed: number, released: number, jobNumbers: string[] }`

- [ ] **Step 1: สร้าง route**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isAbsorbPickupName,
  isAbsorbedBy,
  type AbsorbJob,
} from "@/lib/utils/towingAbsorb";

const ABSORB_SELECT = {
  id: true,
  jobNumber: true,
  jobDate: true,
  jobType: true,
  size: true,
  driverId: true,
  customerId: true,
  createdAt: true,
  isCancelled: true,
  clearStatus: true,
  isTowingAbsorbed: true,
} as const;

type JobRow = {
  id: string; jobNumber: string; jobDate: Date; jobType: string; size: string | null;
  driverId: string | null; customerId: string | null; createdAt: Date;
  isCancelled: boolean; clearStatus: boolean; isTowingAbsorbed: boolean;
};

const toAbsorbJob = (j: JobRow): AbsorbJob => ({
  id: j.id,
  jobDate: j.jobDate,
  jobType: j.jobType,
  size: j.size,
  driverId: j.driverId,
  customerId: j.customerId,
  createdAt: j.createdAt,
  isCancelled: j.isCancelled,
  clearStatus: j.clearStatus,
});

// POST /api/jobs/[id]/absorb-towing
// คำนวณการดูดซับใหม่ทั้งหมดสำหรับงานหลักใบนี้
// - ทอยตู้ที่เข้าเกณฑ์ → ล้างค่าเที่ยว + ติดธง
// - ทอยตู้ที่เคยติดธงจากใบนี้แต่ไม่เข้าเกณฑ์แล้ว → ปลดธง (ไม่คืนค่าเที่ยว)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "ADMIN") return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });

  const { id } = await params;

  const main = await prisma.job.findUnique({
    where: { id },
    select: { ...ABSORB_SELECT, pickupLocation: { select: { name: true } } },
  });

  if (!main) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  const mainIsAbsorber =
    isAbsorbPickupName(main.pickupLocation?.name) &&
    !main.isCancelled &&
    !main.clearStatus &&
    !!main.driverId;

  // ทอยตู้ของคนขับคนเดียวกันในวันเดียวกัน — ดึงมาทั้งวันแล้วค่อยกรองด้วย isAbsorbedBy
  const sameDayTowing = main.driverId
    ? await prisma.job.findMany({
        where: {
          driverId: main.driverId,
          jobDate: main.jobDate,
          jobType: { in: ["towing", "towingHeavy"] },
          id: { not: id },
        },
        select: ABSORB_SELECT,
      })
    : [];

  const mainAsAbsorbJob = toAbsorbJob(main as JobRow);

  const toAbsorb: JobRow[] = [];
  const toRelease: JobRow[] = [];

  for (const t of sameDayTowing as JobRow[]) {
    const qualifies = mainIsAbsorber && isAbsorbedBy(toAbsorbJob(t), mainAsAbsorbJob);
    if (qualifies && !t.isTowingAbsorbed) toAbsorb.push(t);
    // ปลดธงเฉพาะใบที่ไม่เข้าเกณฑ์แล้ว และยังแก้ได้ (ไม่เคลียร์/ไม่ยกเลิก)
    if (!qualifies && t.isTowingAbsorbed && !t.clearStatus && !t.isCancelled) toRelease.push(t);
  }

  if (toAbsorb.length > 0 || toRelease.length > 0) {
    await prisma.$transaction([
      ...(toAbsorb.length > 0
        ? [
            prisma.job.updateMany({
              where: { id: { in: toAbsorb.map((t) => t.id) } },
              data: { driverWage: null, isTowingAbsorbed: true },
            }),
          ]
        : []),
      ...(toRelease.length > 0
        ? [
            prisma.job.updateMany({
              where: { id: { in: toRelease.map((t) => t.id) } },
              data: { isTowingAbsorbed: false },
            }),
          ]
        : []),
    ]);
  }

  return NextResponse.json({
    absorbed: toAbsorb.length,
    released: toRelease.length,
    jobNumbers: toAbsorb.map((t) => t.jobNumber),
  });
}
```

> **หมายเหตุการปลดธง:** route นี้เห็นเฉพาะทอยตู้ของคนขับ+วันเดียวกับงานหลักใบนี้ ถ้าทอยตู้ถูกดูดซับโดยงานหลัก **ใบอื่น** ที่ยังเข้าเกณฑ์อยู่ การเรียก route นี้จากงานหลักที่ไม่เข้าเกณฑ์แล้วจะปลดธงผิด — ป้องกันโดยเช็คงานหลักใบอื่นในวันเดียวกันก่อนปลด ดู Step 2

- [ ] **Step 2: กันปลดธงผิดเมื่อมีงานหลักหลายใบ**

แทนที่บล็อก `for` ใน Step 1 ด้วยเวอร์ชันที่เช็คงานหลักทุกใบในวันนั้น:

```ts
  // งานหลักทุกใบของคนขับคนนี้ในวันนี้ที่รับตู้จากคาหาง/รับเช้าเดินทาง
  // ต้องดูทั้งหมด ไม่งั้นการปลดธงจากใบหนึ่งจะไปลบธงที่อีกใบเป็นคนติด
  const sameDayMains = main.driverId
    ? await prisma.job.findMany({
        where: {
          driverId: main.driverId,
          jobDate: main.jobDate,
          jobType: { in: ["inbound", "outbound"] },
        },
        select: { ...ABSORB_SELECT, pickupLocation: { select: { name: true } } },
      })
    : [];

  const absorbers = sameDayMains
    .filter((m) => isAbsorbPickupName(m.pickupLocation?.name))
    .map((m) => toAbsorbJob(m as JobRow));

  const toAbsorb: JobRow[] = [];
  const toRelease: JobRow[] = [];

  for (const t of sameDayTowing as JobRow[]) {
    const tj = toAbsorbJob(t);
    const qualifies = absorbers.some((m) => isAbsorbedBy(tj, m));
    if (qualifies && !t.isTowingAbsorbed) toAbsorb.push(t);
    if (!qualifies && t.isTowingAbsorbed && !t.clearStatus && !t.isCancelled) toRelease.push(t);
  }
```

แล้วลบตัวแปร `mainIsAbsorber` และ `mainAsAbsorbJob` ที่ไม่ได้ใช้แล้วออก

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: เหลือ 2 pre-existing errors เท่านั้น

- [ ] **Step 4: Commit**

```bash
git add "app/api/jobs/[id]/absorb-towing/route.ts"
git commit -m "feat(api): เพิ่ม endpoint คำนวณการดูดซับทอยตู้

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: prefill-rates — ข้ามใบที่ถูกดูดซับ + ดูดซับหลังเติมอัตรา

**Files:**
- Modify: `app/api/jobs/prefill-rates/route.ts` (`where` ราวบรรทัด 35-42, `select` ราวบรรทัด 43-53, ท้ายฟังก์ชันราวบรรทัด 125-138)

**Interfaces:**
- Consumes: `isAbsorbPickupName`, `isAbsorbedBy`, `AbsorbJob` จาก Task 1
- Produces: response เพิ่ม field `absorbed: number`

- [ ] **Step 1: กรองใบที่ถูกดูดซับออกจาก query**

ใน `where` ของ `prisma.job.findMany` (ถัดจาก `pairLinkAsSecondary: null,`) เพิ่ม:

```ts
        // ทอยตู้ที่ถูกดูดซับแล้ว ค่าเที่ยวต้องเป็น null เสมอ — ห้ามเติมกลับ
        isTowingAbsorbed: false,
```

> **นี่คือจุดที่ feature จะพังเงียบๆ ถ้าลืม:** `where` มี `OR: [{ income: null }, { driverWage: null }]` ซึ่งทอยตู้ที่ถูกดูดซับเข้าเงื่อนไขนี้เสมอ (`driverWage` เป็น null) ถ้าไม่กรองออก ค่าเที่ยวจะถูกเติมกลับทุกครั้งที่กดปุ่ม "ดึงข้อมูล" ทำให้เงินเด้งกลับมาโดยไม่มีใครเห็น — bug เดียวกับที่เคยเกิดกับ feature จับคู่

- [ ] **Step 2: เพิ่ม import**

ที่หัวไฟล์:

```ts
import { isAbsorbPickupName, isAbsorbedBy, type AbsorbJob } from "@/lib/utils/towingAbsorb";
```

- [ ] **Step 3: เพิ่มขั้นตอนดูดซับหลังเติมอัตรา**

แทนที่บล็อก `return NextResponse.json({ scanned, updated, incomeFilled, driverWageFilled })` ท้ายฟังก์ชันด้วย:

```ts
    // ── ดูดซับทอยตู้ ──
    // งานหลักที่รับตู้จากคาหาง/รับเช้าเดินทาง ดูดซับทอยตู้ที่เป็นขาเตรียมของมัน
    const monthJobs = await prisma.job.findMany({
      where: {
        jobDate: { gte: start, lt: end },
        isCancelled: false,
        clearStatus: false,
        jobType: { in: ["inbound", "outbound", "towing", "towingHeavy"] },
      },
      select: {
        id: true,
        jobDate: true,
        jobType: true,
        size: true,
        driverId: true,
        customerId: true,
        createdAt: true,
        isCancelled: true,
        clearStatus: true,
        isTowingAbsorbed: true,
        pickupLocation: { select: { name: true } },
      },
    });

    const toAbsorbJob = (j: (typeof monthJobs)[number]): AbsorbJob => ({
      id: j.id,
      jobDate: j.jobDate,
      jobType: j.jobType,
      size: j.size,
      driverId: j.driverId,
      customerId: j.customerId,
      createdAt: j.createdAt,
      isCancelled: j.isCancelled,
      clearStatus: j.clearStatus,
    });

    const absorbers = monthJobs
      .filter(
        (j) =>
          (j.jobType === "inbound" || j.jobType === "outbound") &&
          isAbsorbPickupName(j.pickupLocation?.name)
      )
      .map(toAbsorbJob);

    const absorbIds: string[] = [];
    for (const j of monthJobs) {
      if (j.jobType !== "towing" && j.jobType !== "towingHeavy") continue;
      if (j.isTowingAbsorbed) continue;
      const tj = toAbsorbJob(j);
      if (absorbers.some((m) => isAbsorbedBy(tj, m))) absorbIds.push(j.id);
    }

    if (absorbIds.length > 0) {
      await prisma.job.updateMany({
        where: { id: { in: absorbIds } },
        data: { driverWage: null, isTowingAbsorbed: true },
      });
    }

    return NextResponse.json({
      scanned: jobs.length,
      updated: updates.length,
      incomeFilled,
      driverWageFilled,
      absorbed: absorbIds.length,
    });
```

> **ลำดับสำคัญ:** บล็อกนี้ต้องอยู่**หลัง**การ `$transaction` ที่เติมอัตรา ไม่งั้นทอยตู้จะถูกเติมค่าเที่ยวหลังจากถูกล้างไปแล้วในคำขอเดียวกัน

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: เหลือ 2 pre-existing errors

- [ ] **Step 5: Commit**

```bash
git add app/api/jobs/prefill-rates/route.ts
git commit -m "feat(jobs): ดึงข้อมูลทั้งเดือนดูดซับทอยตู้ และไม่เติมค่าเที่ยวกลับ

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: PATCH guard + คำนวณใหม่เมื่อแก้ field ที่เกี่ยวข้อง

**Files:**
- Modify: `app/api/jobs/[id]/route.ts` (PATCH — หลังบล็อก pair guard ราวบรรทัด 160-177, และก่อน `prisma.job.update`)

**Interfaces:**
- Consumes: `Job.isTowingAbsorbed` จาก Task 2
- Produces: ไม่มี (พฤติกรรมของ endpoint เดิม)

- [ ] **Step 1: เพิ่ม guard ห้ามแก้ค่าเที่ยวของทอยตู้ที่ถูกดูดซับ**

ใน PATCH ต่อจากบล็อก guard ของ pair link (ที่ขึ้นต้นด้วย `// งานที่ถูกจับคู่แล้ว (ฝั่ง secondary)`) เพิ่ม:

```ts
    // ทอยตู้ที่ถูกดูดซับ ค่าเที่ยวต้องเป็น null — ยอดถูกรวมไปกับงานหลักแล้ว
    if (data.driverWage !== undefined) {
      const current = await prisma.job.findUnique({
        where: { id },
        select: { isTowingAbsorbed: true },
      });
      if (current?.isTowingAbsorbed) {
        return NextResponse.json(
          { error: "ทอยตู้นี้ถูกงานหลักดูดซับแล้ว ค่าเที่ยวรวมอยู่กับงานหลัก" },
          { status: 400 }
        );
      }
    }
```

> **ตำแหน่งสำคัญ:** ต้องอยู่**ก่อน**บล็อก `if (data.isCancelled === true) { data.income = null; data.driverWage = null; }` ไม่งั้นการยกเลิกทอยตู้ที่ถูกดูดซับจะถูกปฏิเสธ เพราะบล็อกนั้น set `data.driverWage` ขึ้นมาเอง ทำให้ `!== undefined` เป็น true (เป็นกับดักเดียวกับที่ pair guard เคยเจอ)

- [ ] **Step 2: คำนวณการดูดซับใหม่หลังแก้ field ที่เกี่ยวข้อง**

หลัง `const job = await prisma.job.update({...})` และก่อน `return NextResponse.json(job)` เพิ่ม:

```ts
    // แก้ field ที่กระทบการดูดซับ → คำนวณใหม่ให้งานหลักใบนี้
    // (เปลี่ยนสถานที่รับตู้ออกจากคาหาง = ปลดธงทอยตู้ที่เคยดูดซับไว้)
    const ABSORB_TRIGGER_FIELDS = [
      "pickupLocationId",
      "customerId",
      "size",
      "jobDate",
      "jobType",
      "driverId",
    ];
    if (
      (job.jobType === "inbound" || job.jobType === "outbound") &&
      ABSORB_TRIGGER_FIELDS.some((f) => f in data)
    ) {
      try {
        await recalcAbsorbForMain(job.id);
      } catch (e) {
        // ไม่ให้การคำนวณดูดซับล้มทั้งคำขอ — ผู้ใช้กด "ดึงข้อมูล" ซ่อมได้
        console.error("recalcAbsorbForMain error:", e);
      }
    }
```

- [ ] **Step 3: แยก logic การคำนวณเป็นฟังก์ชันที่ใช้ร่วมกัน**

โค้ดคำนวณใน Task 3 Step 2 และที่ PATCH เรียกใช้เป็นตัวเดียวกัน — ย้ายไปไว้ใน `lib/utils/towingAbsorb.ts` เพื่อไม่ให้ซ้ำสองที่ เพิ่มท้ายไฟล์:

```ts
import { prisma } from "@/lib/prisma";

const RECALC_SELECT = {
  id: true,
  jobNumber: true,
  jobDate: true,
  jobType: true,
  size: true,
  driverId: true,
  customerId: true,
  createdAt: true,
  isCancelled: true,
  clearStatus: true,
  isTowingAbsorbed: true,
} as const;

export interface RecalcResult {
  absorbed: number;
  released: number;
  jobNumbers: string[];
}

/**
 * คำนวณการดูดซับใหม่สำหรับคนขับ+วันของงานหลักใบที่ระบุ
 * ดูงานหลักทุกใบในวันนั้น ไม่ใช่แค่ใบที่เรียก — ไม่งั้นการปลดธงจากใบหนึ่ง
 * จะไปลบธงที่อีกใบเป็นคนติด
 */
export async function recalcAbsorbForMain(mainJobId: string): Promise<RecalcResult> {
  const main = await prisma.job.findUnique({
    where: { id: mainJobId },
    select: { driverId: true, jobDate: true },
  });
  if (!main?.driverId) return { absorbed: 0, released: 0, jobNumbers: [] };

  const [mains, towings] = await Promise.all([
    prisma.job.findMany({
      where: {
        driverId: main.driverId,
        jobDate: main.jobDate,
        jobType: { in: ["inbound", "outbound"] },
      },
      select: { ...RECALC_SELECT, pickupLocation: { select: { name: true } } },
    }),
    prisma.job.findMany({
      where: {
        driverId: main.driverId,
        jobDate: main.jobDate,
        jobType: { in: ["towing", "towingHeavy"] },
      },
      select: RECALC_SELECT,
    }),
  ]);

  const toAbsorbJob = (j: {
    id: string; jobDate: Date; jobType: string; size: string | null;
    driverId: string | null; customerId: string | null; createdAt: Date;
    isCancelled: boolean; clearStatus: boolean;
  }): AbsorbJob => ({
    id: j.id,
    jobDate: j.jobDate,
    jobType: j.jobType,
    size: j.size,
    driverId: j.driverId,
    customerId: j.customerId,
    createdAt: j.createdAt,
    isCancelled: j.isCancelled,
    clearStatus: j.clearStatus,
  });

  const absorbers = mains
    .filter((m) => isAbsorbPickupName(m.pickupLocation?.name))
    .map(toAbsorbJob);

  const toAbsorb: { id: string; jobNumber: string }[] = [];
  const toRelease: string[] = [];

  for (const t of towings) {
    const tj = toAbsorbJob(t);
    const qualifies = absorbers.some((m) => isAbsorbedBy(tj, m));
    if (qualifies && !t.isTowingAbsorbed) toAbsorb.push({ id: t.id, jobNumber: t.jobNumber });
    if (!qualifies && t.isTowingAbsorbed && !t.clearStatus && !t.isCancelled) toRelease.push(t.id);
  }

  if (toAbsorb.length > 0 || toRelease.length > 0) {
    await prisma.$transaction([
      ...(toAbsorb.length > 0
        ? [
            prisma.job.updateMany({
              where: { id: { in: toAbsorb.map((t) => t.id) } },
              data: { driverWage: null, isTowingAbsorbed: true },
            }),
          ]
        : []),
      ...(toRelease.length > 0
        ? [
            prisma.job.updateMany({
              where: { id: { in: toRelease } },
              data: { isTowingAbsorbed: false },
            }),
          ]
        : []),
    ]);
  }

  return {
    absorbed: toAbsorb.length,
    released: toRelease.length,
    jobNumbers: toAbsorb.map((t) => t.jobNumber),
  };
}
```

แล้วแก้ `app/api/jobs/[id]/absorb-towing/route.ts` (Task 3) ให้เรียกฟังก์ชันนี้แทนการคำนวณเอง:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recalcAbsorbForMain } from "@/lib/utils/towingAbsorb";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "ADMIN") return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });

  const { id } = await params;
  const result = await recalcAbsorbForMain(id);
  return NextResponse.json(result);
}
```

และเพิ่ม import ใน `app/api/jobs/[id]/route.ts`:

```ts
import { recalcAbsorbForMain } from "@/lib/utils/towingAbsorb";
```

> **หมายเหตุ:** `lib/utils/towingAbsorb.ts` ตอนนี้ import `prisma` แล้ว จึงเป็น server-only ส่วน `isAbsorbPickupName`/`isAbsorbedBy` ยังเป็น pure function ที่ test ได้ตามปกติ — test ของ Task 1 ไม่เรียก `recalcAbsorbForMain` จึงไม่ต้องต่อ DB

- [ ] **Step 4: รัน test เดิมให้แน่ใจว่าไม่พัง**

```bash
npx tsx --test lib/utils/__tests__/towingAbsorb.test.ts
```

Expected: PASS 16 tests (การเพิ่ม import prisma ต้องไม่ทำให้ test พัง — ถ้าพังเพราะ prisma ต่อ DB ตอน import ให้ย้าย `recalcAbsorbForMain` ไปไฟล์ใหม่ `lib/utils/towingAbsorbDb.ts` แทน แล้วรายงานว่าทำแบบนั้น)

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: เหลือ 2 pre-existing errors

- [ ] **Step 6: Commit**

```bash
git add lib/utils/towingAbsorb.ts "app/api/jobs/[id]/route.ts" "app/api/jobs/[id]/absorb-towing/route.ts"
git commit -m "feat(api): กันแก้ค่าเที่ยวทอยตู้ที่ถูกดูดซับ และคำนวณใหม่เมื่อแก้งานหลัก

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: หน้าสรุป — ไม่นับทอยตู้ที่ถูกดูดซับ

**Files:**
- Modify: `lib/utils/summaryCalculator.ts` (`SummaryJobInput` ราวบรรทัด 7-25, `towingTrips` ราวบรรทัด 104)
- Modify: `lib/utils/summaryQuery.ts` (`select` ราวบรรทัด 60, map ราวบรรทัด 138)
- Test: `lib/utils/__tests__/summaryCalculator.test.ts` (เพิ่มท้ายไฟล์)

**Interfaces:**
- Consumes: `Job.isTowingAbsorbed` จาก Task 2
- Produces: `SummaryJobInput.isTowingAbsorbed?: boolean` — **optional**

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

เพิ่มท้าย `lib/utils/__tests__/summaryCalculator.test.ts`:

```ts
test('calculateDriverSummary: ทอยตู้ที่ถูกดูดซับไม่นับเป็นเที่ยว แต่ทอยตู้ปกติยังนับ', () => {
  const base = {
    month: '2026-08',
    driver: {
      id: 'd1', name: 'ประวิทย์ กันภัย', vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1', startDate: '2025-08-25', baseSalary: 9000, isGasVehicle: false,
    },
    sickLeaveCount: 0, personalLeaveCount: 0, fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      // งานหลักที่รับตู้จากคาหาง
      { jobType: 'outbound', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: 7000, driverWage: 650, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      // ทอยตู้ที่ถูกดูดซับ — ค่าเที่ยวถูกล้างไปแล้ว
      { jobType: 'towing', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: null, driverWage: null, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0, isTowingAbsorbed: true },
      // ทอยตู้ปกติในเดือนเดียวกัน — ยังนับ
      { jobType: 'towing', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: null, driverWage: 150, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
    ],
  })

  assert.equal(result.towingTrips, 1)   // นับเฉพาะใบที่ไม่ถูกดูดซับ
  assert.equal(result.jobTrips, 1)      // งานหลักยังนับปกติ
  assert.equal(result.driverWage, 800)  // 650 + 150 (ใบที่ถูกดูดซับเป็น null)
})

test('calculateDriverSummary: ทอยตู้หนักที่ถูกดูดซับก็ไม่นับ', () => {
  const base = {
    month: '2026-08',
    driver: {
      id: 'd1', name: 'ประวิทย์ กันภัย', vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1', startDate: '2025-08-25', baseSalary: 9000, isGasVehicle: false,
    },
    sickLeaveCount: 0, personalLeaveCount: 0, fuelPricePerLiter: 36,
  }

  const result = calculateDriverSummary({
    ...base,
    jobs: [
      { jobType: 'towingHeavy', noJobReason: null, isCancelled: false, isCarry: false, toll: null, liftFee: null, storageFee: null, tire: null, other: null, income: null, driverWage: null, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0, isTowingAbsorbed: true },
    ],
  })

  assert.equal(result.towingTrips, 0)
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx tsx --test lib/utils/__tests__/summaryCalculator.test.ts
```

Expected: FAIL 2 ตัวใหม่ (`towingTrips` ได้ 2 แทน 1) ส่วน 20 ตัวเดิม PASS

- [ ] **Step 3: เพิ่ม field ใน `SummaryJobInput`**

ใน `lib/utils/summaryCalculator.ts` ต่อจาก `isPairSecondary?: boolean;`:

```ts
  /** ทอยตู้ที่ถูกงานหลักดูดซับ — ไม่นับเป็นเที่ยว (ค่าเที่ยวถูกล้างไปแล้ว) */
  isTowingAbsorbed?: boolean;
```

- [ ] **Step 4: แก้การนับ `towingTrips`**

เปลี่ยนบรรทัด `towingTrips:` เป็น:

```ts
    towingTrips: counted.filter((j) => isTowingJobType(j.jobType) && !j.isTowingAbsorbed).length,
```

**ห้ามแก้บรรทัดอื่น** — `jobTrips`, `income`, `driverWage`, `fuelLiters`, `carryTripsPrefill`, `otherExpensesPrefill`, `repairDays`, `overnightDays`, `noShowDays` คงเดิมทั้งหมด

- [ ] **Step 5: รัน test ให้ผ่าน**

```bash
npx tsx --test lib/utils/__tests__/summaryCalculator.test.ts
```

Expected: PASS 22 tests (20 เดิม + 2 ใหม่)

- [ ] **Step 6: ต่อข้อมูลจาก DB ใน `summaryQuery.ts`**

ใน `select` ของ `prisma.job.findMany` (ถัดจาก `pairLinkAsSecondary: { select: { id: true } },`) เพิ่ม:

```ts
        isTowingAbsorbed: true,
```

ใน map ของ `jobs` (ถัดจาก `isPairSecondary: !!j.pairLinkAsSecondary,`) เพิ่ม:

```ts
        isTowingAbsorbed: j.isTowingAbsorbed,
```

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: เหลือ 2 pre-existing errors

- [ ] **Step 8: Commit**

```bash
git add lib/utils/summaryCalculator.ts lib/utils/summaryQuery.ts lib/utils/__tests__/summaryCalculator.test.ts
git commit -m "feat(summary): ไม่นับทอยตู้ที่ถูกงานหลักดูดซับเป็นเที่ยว

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: UI — modal และตาราง

**Files:**
- Modify: `components/jobs/JobFormModal.tsx` (derived state ราวบรรทัด 863, ปุ่มดึงข้อมูล ราวบรรทัด 1072, ช่อง driverWage ราวบรรทัด 1594, `handleFieldBlur` ราวบรรทัด 286)
- Modify: `components/jobs/EditableJobTable.tsx` (คอลัมน์ SIZE ราวบรรทัด 651)

**Interfaces:**
- Consumes: `Job.isTowingAbsorbed` จาก Task 2, `POST /api/jobs/[id]/absorb-towing` จาก Task 3/5
- Produces: ไม่มี

- [ ] **Step 1: derived state ใน JobFormModal**

ใกล้ `const isPairSecondary = ...` (ราวบรรทัด 864) เพิ่ม:

```ts
  // ทอยตู้ที่ถูกงานหลักดูดซับ — ค่าเที่ยวรวมไปกับงานหลักแล้ว
  const isTowingAbsorbed = !!activeJob?.isTowingAbsorbed;
```

- [ ] **Step 2: ซ่อนปุ่ม "ดึงข้อมูล" ของทอยตู้ที่ถูกดูดซับ**

เปลี่ยนเงื่อนไขของปุ่ม `job-prefill-btn` จาก:

```tsx
{isAdmin && !isSpecialType && activeJob && !isPairSecondary && (
```

เป็น:

```tsx
{isAdmin && !isSpecialType && activeJob && !isPairSecondary && !isTowingAbsorbed && (
```

- [ ] **Step 3: disable ช่องค่าเที่ยวคนขับ**

ที่ `numberInput("driverWage", ...)` เปลี่ยน:

```tsx
{numberInput("driverWage", "ค่าเที่ยวคนขับ", isAdvance || isPairSecondary)}
```

เป็น:

```tsx
{numberInput("driverWage", "ค่าเที่ยวคนขับ", isAdvance || isPairSecondary || isTowingAbsorbed)}
{isTowingAbsorbed && (
  <div style={{ fontSize: 12, color: "#faad14", marginTop: 2 }}>
    ค่าเที่ยวรวมอยู่กับงานหลัก
  </div>
)}
```

- [ ] **Step 4: trigger การดูดซับเมื่อเลือกสถานที่รับตู้**

ใน `handleFieldBlur` หลังจากบันทึก field สำเร็จ เพิ่มการเรียก endpoint เมื่อ field เป็น `pickupLocationId` และงานเป็นขาเข้า/ขาออก

`handleFieldBlur` จบด้วยบล็อกนี้ (ราวบรรทัด 370-377) — ตัวแปรชื่อ `success` และ job ชื่อ `targetJob`:

```ts
    handleSaveStatus("saving");
    const success = await onFieldSave(targetJob.id, field, value);
    if (success) {
      handleSaveStatus("saved");
    } else {
      handleSaveStatus("error");
    }
  };
```

แทรกก่อนปิดฟังก์ชัน (หลัง `if (success) {...} else {...}`):

```ts
    // เลือกสถานที่รับตู้ → คำนวณการดูดซับทอยตู้ใหม่
    const jt = form.getFieldValue("jobType");
    if (
      success &&
      isAdmin &&
      field === "pickupLocationId" &&
      (jt === "inbound" || jt === "outbound")
    ) {
      try {
        const res = await fetch(`/api/jobs/${targetJob.id}/absorb-towing`, { method: "POST" });
        if (res.ok) {
          const d = (await res.json()) as { absorbed: number; released: number };
          if (d.absorbed > 0) message.success(`ล้างค่าเที่ยวทอยตู้ ${d.absorbed} ใบ`);
          if (d.released > 0) message.info(`คืนสถานะทอยตู้ ${d.released} ใบ`);
        }
      } catch {
        // เงียบไว้ — ผู้ใช้กด "ดึงข้อมูล" ซ่อมได้
      }
    }
```

> `targetJob` ถูก guard ด้วย `if (!targetJob) return;` ที่ต้นฟังก์ชันแล้ว จึงไม่ต้องเช็คซ้ำ

- [ ] **Step 5: Tag ในตาราง**

ใน `components/jobs/EditableJobTable.tsx` คอลัมน์ SIZE แก้ `render` ให้แสดง Tag เพิ่มเมื่อทอยตู้ถูกดูดซับ — วางต่อจากเงื่อนไข `pairInfo(row).isPaired` ที่มีอยู่:

```tsx
          render: (_: unknown, row: RowData) => {
            const p = pairInfo(row)
            const cell = renderCell(row, 'size', 'select', sizeOptions, {
              disabled: isAdvanceType(row),
            })
            const absorbed = !isBanner(row) && (row as Job).isTowingAbsorbed
            if (!p.isPaired && !absorbed) return cell
            return (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {cell}
                {p.isPaired && (
                  <Tooltip
                    title={p.isPrimary ? `จับคู่กับ ${p.otherJobNumber}` : `ยอดรวมอยู่ที่ ${p.otherJobNumber}`}
                  >
                    <Tag color={p.isPrimary ? 'blue' : undefined} style={{ margin: 0, fontSize: 11 }}>
                      2x
                    </Tag>
                  </Tooltip>
                )}
                {absorbed && (
                  <Tooltip title="ค่าเที่ยวรวมอยู่กับงานหลักที่รับตู้จากคาหาง/รับเช้าเดินทาง">
                    <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>รวม</Tag>
                  </Tooltip>
                )}
              </span>
            )
          },
```

- [ ] **Step 6: Typecheck + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: typecheck เหลือ 2 pre-existing errors, build ผ่าน

- [ ] **Step 7: Commit**

```bash
git add components/jobs/JobFormModal.tsx components/jobs/EditableJobTable.tsx
git commit -m "feat(jobs): UI สำหรับทอยตู้ที่ถูกดูดซับ

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: E2E

**Files:**
- Create: `e2e/jobs/towing-absorb.spec.ts`

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า
- Produces: ไม่มี

- [ ] **Step 1: อ่าน pattern จาก spec ที่มีอยู่**

```bash
sed -n '1,90p' e2e/jobs/job-pairing.spec.ts
ls e2e/scripts
```

ใช้ helper และรูปแบบเดิม: login ด้วย `testadmin`/`admin123` ผ่าน `getByPlaceholder('ชื่อผู้ใช้')`/`getByPlaceholder('รหัสผ่าน')`, สร้างข้อมูลผ่าน `page.request.post`, cleanup ด้วย script ใน `e2e/scripts/`

**สำคัญ:** spec นี้ต้องสร้างสถานที่ชื่อ `คาหาง` ผ่าน `POST /api/locations` (type `general`) เพราะ E2E DB เป็น container เปล่า ไม่มีข้อมูล production

**สำคัญ:** ลำดับการสร้างต้องให้ทอยตู้ถูกสร้าง**ก่อน**งานหลักเสมอ เพราะ `createdAt` เป็นเงื่อนไข

- [ ] **Step 2: เขียน spec**

สร้าง `e2e/jobs/towing-absorb.spec.ts` ครอบคลุม 6 เคส (ปรับ selector ตาม helper ที่เจอใน Step 1):

```ts
import { test, expect, type Page } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// ใช้ชื่อคนขับเฉพาะของ spec นี้ ไม่ชนกับ spec อื่น (ต้องรัน --workers=1)
const DRIVER_NAME = 'Test Driver TowingAbsorb'

test.describe('ดูดซับทอยตู้', () => {
  test('กดดึงข้อมูล → ทอยตู้ที่เข้าเกณฑ์ถูกล้างค่าเที่ยว และหน้าสรุปไม่นับ', async ({ page }) => {
    // 1. login, สร้างคนขับ + ลูกค้า + สถานที่ "คาหาง"
    // 2. สร้างทอยตู้ก่อน (size 20DC, ลูกค้า C, คนขับ D, วันที่ X) พร้อมค่าเที่ยว 150
    // 3. สร้างงานหลัก outbound ทีหลัง (size/ลูกค้า/คนขับ/วันเดียวกัน, รับตู้ = คาหาง)
    // 4. กดปุ่ม jobs-prefill-rates-btn
    // 5. ตรวจว่าทอยตู้ driverWage เป็น null ผ่าน GET /api/jobs/<id>
    // 6. ตรวจหน้าสรุปว่า towingTrips ลดลง
  })

  test('กดดึงข้อมูลซ้ำ → ค่าเที่ยวทอยตู้ยังว่าง ไม่ถูกเติมกลับ', async ({ page }) => {
    // กดปุ่มสองครั้ง แล้วตรวจว่า driverWage ยังเป็น null ทั้งสองรอบ
  })

  test('ทอยตู้คนละลูกค้าไม่ถูกดูดซับ', async ({ page }) => {
    // ทอยตู้ลูกค้า C2 งานหลักลูกค้า C1 → driverWage ของทอยตู้ยังอยู่
  })

  test('ทอยตู้ที่สร้างหลังงานหลักไม่ถูกดูดซับ', async ({ page }) => {
    // สร้างงานหลักก่อน แล้วค่อยสร้างทอยตู้ → ไม่ถูกดูดซับ
  })

  test('ทอยตู้คนละ size ไม่ถูกดูดซับ', async ({ page }) => {
    // ทอยตู้ 40DC งานหลัก 20DC → ไม่ถูกดูดซับ
  })

  test('เปลี่ยนสถานที่รับตู้ออกจากคาหาง → ทอยตู้กลับมานับเป็นเที่ยว', async ({ page }) => {
    // ดูดซับสำเร็จแล้ว PATCH งานหลักเปลี่ยน pickupLocationId เป็นที่อื่น
    // ตรวจว่า isTowingAbsorbed เป็น false และหน้าสรุปนับทอยตู้กลับมา
  })
})
```

- [ ] **Step 3: ตรวจว่า spec parse ได้**

```bash
npx playwright test e2e/jobs/towing-absorb.spec.ts --list
```

Expected: 6 tests

- [ ] **Step 4: พยายามรันจริง**

```bash
docker ps --filter name=syl-e2e-db --format '{{.Names}}'
```

ถ้า container ไม่ขึ้น ลองสร้าง:

```bash
docker run -d --name syl-e2e-db --restart unless-stopped \
  -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2epass -e POSTGRES_DB=syl_e2e \
  -p 5442:5432 postgres:16-alpine
```

แล้ว:

```bash
npx playwright test e2e/jobs/towing-absorb.spec.ts --workers=1
```

**ถ้า Docker daemon ไม่ทำงาน** — ไม่ต้องพยายามเปิดเอง รายงานตรงๆ ว่ารันไม่ได้ และ**ห้ามอ้างผลการรันที่ไม่ได้เกิดขึ้นจริง** ให้ตรวจ selector ทุกตัวกับ source แทน

- [ ] **Step 5: รัน regression ของ unit test ทั้งหมด**

```bash
npx tsx --test lib/utils/__tests__/towingAbsorb.test.ts
npx tsx --test lib/utils/__tests__/summaryCalculator.test.ts
npx tsx --test lib/utils/__tests__/jobPairing.test.ts
npx tsx --test lib/utils/__tests__/fuelRateExcel.test.ts
```

Expected: 16 / 22 / 19 / (ตามจำนวนเดิม) ผ่านทั้งหมด

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: ผ่าน

- [ ] **Step 7: Commit**

```bash
git add e2e/jobs/towing-absorb.spec.ts
git commit -m "test(e2e): เพิ่ม test การดูดซับทอยตู้

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Post-Implementation

- [ ] `make migrate-prod` ตอน deploy (schema เปลี่ยน)
- [ ] รัน E2E ทั้งชุดเมื่อ Docker พร้อม — `npx playwright test --workers=1`
- [ ] ข้อมูลเก่าใน production: 65 เคสเข้าเกณฑ์ แต่ 57 เคลียร์แล้วจึงถูกข้าม เหลือ 8 ใบที่ feature มีผล — **ไม่มี migration script** ตามสเปค
