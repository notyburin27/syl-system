# ต่ออายุรถ (พรบ. / ภาษี / ประกัน) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มเมนู "ต่ออายุรถ" ให้ฝ่ายประกันติดตามการต่อ พรบ. / ภาษี / ประกันรถยนต์ / ประกันสินค้า ทีละคัน พร้อม dashboard รายเดือน, upload Excel และไฟล์แนบ

**Architecture:** ตาราง `Vehicle` + `VehicleCoverage` (1 แถว = 1 งวด, สถานะการต่ออยู่บนงวดที่กำลังจะหมด) + `Insurer` + `CoverageAttachment`.
Logic ที่ทดสอบได้แยกเป็น pure function ใน `lib/renewals/` (วันที่, bucket, auto-close, import validate) ส่วนที่แตะ DB อยู่ใน service (`coverageService.ts`, `vehicleService.ts`, `import/apply.ts`) — route เป็นชั้นบางๆ.
สิทธิ์บังคับใน `middleware.ts` (ถอด JWT ด้วย `getToken`) + guard ซ้ำใน layout และทุก API route.

**Tech Stack:** Next.js 15 App Router, Prisma 6 (generator `prisma-client` → `@/app/generated/prisma/client`), PostgreSQL, NextAuth v5 (JWT), antd 5 + dayjs, zod 3, exceljs, @aws-sdk/client-s3 (DO Spaces), node:test + tsx, Playwright

**Spec:** `docs/superpowers/specs/2026-10-06-vehicle-renewals-design.md`

## ก่อนเริ่ม

- ทำงานบน branch ใหม่ `feat/vehicle-renewals` แตกจาก `main` แล้ว cherry-pick commit ของ spec และ plan มาจาก `feat/fuel-standard`
  (`git log feat/fuel-standard --oneline -- docs/superpowers/specs/2026-10-06-vehicle-renewals-design.md docs/superpowers/plans/2026-10-06-vehicle-renewals.md`)
- Docker `syl-e2e-db` ต้องรันอยู่ (`docker ps | grep syl-e2e-db`) — ดู CLAUDE.md หัวข้อ E2E
- baseline TypeScript: `npx tsc --noEmit -p .` มี error เดิม 2 ตัวเท่านั้น (`app/api/convert-statement/route.ts`, `prisma/seed.ts`)

## Global Constraints

- ข้อความที่ผู้ใช้เห็น (UI, error จาก API) เป็นภาษาไทย; ชื่อตัวแปร/ไฟล์เป็นอังกฤษ
- Commit message: `feat(renewals): <คำอธิบายภาษาไทย>` และจบด้วยบรรทัด `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- `<Table size="small">` ทุกตาราง; `App.useApp()` สำหรับ `message`/`modal`; ยืนยัน action สำคัญด้วย `modal.confirm` (ห้าม `Popconfirm`)
- data-testid ตาม CLAUDE.md: Button/Input ใส่ `data-testid` ได้; **Modal ห้ามใส่ data-testid** (ใช้ `getByRole('dialog')`); DatePicker/Select/AutoComplete/InputNumber ใช้ `id`
- วันที่ใน API/DTO เป็น string `YYYY-MM-DD`; DB เป็น `@db.Date`; "วันนี้" = `todayInBangkok()` (Asia/Bangkok)
- antd ที่ติดตั้งคือ 5.26 → Modal ใช้ `destroyOnHidden` (ไม่ใช่ `destroyOnClose` ที่ deprecated แล้ว); zod 3.25, exceljs 4.4
- DatePicker ใช้ `format="DD/MM/YYYY"` (ค.ศ. — เหมือน `driver-resigned-at`); ตารางแสดงวันที่ พ.ศ. ด้วย `toThaiShortDate` จาก `lib/utils/thaiDate.ts`
- เงินเป็น `Decimal(10,2)` → ไม่เกิน `99,999,999.99` (`MAX_MONEY`)
- ห้ามเพิ่ม npm dependency (มี exceljs, zod, dayjs, @aws-sdk/client-s3, next-auth อยู่แล้ว)
- ไฟล์ pure/edge-safe ห้าม import prisma, `@/lib/auth`, `fs`: `lib/renewals/{constants,dateOnly,dueWindow,renewalDefaults,plate,routeAccess,autoClose,dashboardFilter,attachmentRules}.ts`, `lib/renewals/import/{columns,cells,validate}.ts` — import กันเองด้วย path แบบ relative (`./x`) เพื่อให้ Playwright import ได้
- Unit test: `npx tsx --test <ไฟล์>`; ทั้งหมด: `npx tsx --test lib/renewals/__tests__/*.test.ts lib/renewals/import/__tests__/*.test.ts`
- `next build` ไม่เช็ก type (`ignoreBuildErrors`) → ทุก task รัน `npx tsc --noEmit -p .` แล้วต้องเหลือแค่ 2 error เดิม
- E2E: `npx playwright test e2e/renewals --workers=1`; ทะเบียนทดสอบขึ้นต้น `E2E-`, ชื่อบริษัทประกันทดสอบขึ้นต้น `E2E` (cleanup ลบตาม prefix); user ทดสอบรหัส `admin123`
- GitNexus (CLAUDE.md): ก่อนแก้ symbol เดิมรัน `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .` แล้วรายงานผล (HIGH/CRITICAL ต้องแจ้งก่อนแก้); ก่อนทุก commit รัน `node .gitnexus/run.cjs detect-changes --scope all --repo .`
- Prisma: แก้ schema แล้วรัน `npx prisma generate`; E2E global-setup ทำ `db push` ให้เอง; **ห้าม** รัน `make migrate-stag` / `make migrate-prod` ระหว่าง implement

## Review Focus

1. **ทะเบียนพิมพ์ต่างรูปแบบ** (`"64-5598 กท."`, `"64-5598  กท"`) ในฟอร์ม ช่องค้นหา และไฟล์ import → ต้องถือเป็นคันเดียวกัน (Task 2 unit, Task 6 API 409, Task 8 filter, Task 11 validate)
2. **ชื่อไฟล์แนบภาษาไทย** → header `Content-Disposition` ต้องเป็น ASCII ล้วน และเปิดไฟล์ได้ (Task 5 unit, Task 10 e2e)
3. **Excel ปี 2 หลัก (`31/03/70`) และเงินมีคอมมา (`13,449.50`)** → ปี 2 หลักต้องขึ้น error ชัดเจน (ไม่เดาศตวรรษ), คอมมาต้องอ่านได้ (Task 11 unit, Task 12 e2e)
4. **แถวว่างที่มีแค่ format/dropdown** (template มี validation 1,000 แถว, ผู้ใช้ทาสีแถว) → ต้องถูกข้าม ไม่ฟ้อง "ช่องบังคับว่าง" (Task 11 unit)
5. **import ที่ตั้งรถเป็น "ขาย" พร้อมมีงวด "รอต่อ" ของคันนั้นในไฟล์เดียวกัน** → หลัง commit งวดต้องเป็น ไม่ต่อ/ขายรถ ไม่ค้างบน dashboard (Task 11 simulation, Task 12 e2e)

## File Structure

```
prisma/schema.prisma                         (แก้) enum Role + 4 enum + 4 model + relation ใน AuthUser
middleware.ts                                (แก้) ถอด JWT → renewalRouteDecision
next.config.js                               (แก้) experimental.middlewareClientMaxBodySize = '12mb'
playwright.config.ts                         (แก้) ATTACHMENT_STORAGE=local
.gitignore                                   (แก้) /.tmp
lib/utils/excel.ts                           (แก้) export normalizeCellValue
lib/renewals/
  constants.ts        enum keys, labels, สี, RENEWAL_ROLES, isRenewalRole (edge-safe)
  dateOnly.ts         YYYY-MM-DD helpers + todayInBangkok
  dueWindow.ts        endOfNextMonth, dueBucket, DUE_BUCKET_COLORS
  renewalDefaults.ts  nextPeriodDefaults, validateNewPeriod
  plate.ts            normalizePlate
  routeAccess.ts      renewalRouteDecision (middleware)
  access.ts           requireRenewalAccess (API)
  http.ts             RenewalError, parseJsonBody, renewalErrorResponse, Prisma error helpers
  schemas.ts          zod schemas + sanitizeCoverageFields
  serialize.ts        COVERAGE_INCLUDE + DTO mappers
  autoClose.ts        planAutoClose (pure)
  coverageService.ts  enforceCoverageRules + CRUD งวด + renew/bulk/reopen
  vehicleService.ts   create/update/delete รถ
  dashboardFilter.ts  filterDashboardItems, summarizeDashboard (client ใช้)
  attachmentRules.ts  validateAttachment, buildAttachmentKey, inlineContentDisposition
  storage.ts          AttachmentStorage (S3 / local)
  import/columns.ts   ชื่อชีต/คอลัมน์ template
  import/cells.ts     parse วันที่/เงิน/จำนวนเต็ม/label
  import/validate.ts  validateRenewalImport (pure) → errors + plan + summary
  import/workbook.ts  buildRenewalTemplate, readRenewalWorkbook (exceljs)
  import/apply.ts     loadImportSnapshot, applyRenewalImport (prisma)
  __tests__/*.test.ts, import/__tests__/*.test.ts
types/renewals.ts                            DTO ที่ API กับ UI ใช้ร่วมกัน
app/api/renewals/
  dashboard/route.ts
  insurers/route.ts, insurers/[id]/route.ts
  vehicles/route.ts, vehicles/[id]/route.ts
  coverages/route.ts, coverages/[id]/route.ts
  coverages/[id]/renew/route.ts, coverages/[id]/reopen/route.ts
  coverages/bulk-renew/route.ts, coverages/bulk-status/route.ts
  coverages/[id]/attachments/route.ts, attachments/[id]/route.ts
  import/route.ts, import/template/route.ts
app/(protected)/renewals/
  layout.tsx, page.tsx, vehicles/page.tsx, vehicles/[id]/page.tsx, insurers/page.tsx, import/page.tsx
components/renewals/
  api.ts, coverageForm.ts, uploadAttachments.ts, useRenewalLookups.ts
  CoveragePeriodFields.tsx, RenewalDashboard.tsx, RenewModal.tsx, NotRenewModal.tsx, BulkRenewModal.tsx, NoteModal.tsx
  InsurerManager.tsx, VehicleList.tsx, VehicleFormModal.tsx, VehicleDetail.tsx, CoverageFormModal.tsx, AttachmentsModal.tsx
  RenewalImport.tsx
app/(protected)/layout.tsx, components/ProtectedLayoutClient.tsx   (แก้) เมนู + tag role
app/(protected)/admin/users/page.tsx, app/api/users/route.ts, app/api/users/[id]/route.ts  (แก้) role INSURANCE
e2e/scripts/seed.ts (แก้), e2e/scripts/cleanup-renewals.ts
e2e/renewals/helpers.ts, access.spec.ts, insurers.spec.ts, vehicles-api.spec.ts, status-api.spec.ts,
             dashboard.spec.ts, vehicles-ui.spec.ts, attachments.spec.ts, import.spec.ts
```

---

### Task 1: Schema, ค่าคงที่ และ DTO types

**Files:**
- Modify: `prisma/schema.prisma` (enum `Role` บรรทัด 12-17, model `AuthUser` บรรทัด 19-37, ต่อท้ายไฟล์)
- Create: `lib/renewals/constants.ts`
- Create: `types/renewals.ts`
- Test: `lib/renewals/__tests__/constants.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `constants.ts`: `RENEWAL_ROLES`, `COVERAGE_TYPES`, `RENEWAL_STATUSES`, `NOT_RENEWED_REASONS`, `VEHICLE_STATUSES`, `OPEN_STATUSES`, `COVERAGE_CLASSES` (tuple `as const`); types `CoverageTypeKey`, `RenewalStatusKey`, `NotRenewedReasonKey`, `VehicleStatusKey`, `DueBucket`; `COVERAGE_TYPE_LABELS`, `RENEWAL_STATUS_LABELS`, `RENEWAL_STATUS_COLORS`, `NOT_RENEWED_REASON_LABELS`, `VEHICLE_STATUS_LABELS`, `VEHICLE_STATUS_COLORS`; `BULK_LIMIT = 500`, `MAX_MONEY = 99_999_999.99`; `isRenewalRole(role)`, `isOpenStatus(status)`
  - `types/renewals.ts`: `VehicleSummaryDto`, `VehicleDto`, `VehicleListItemDto`, `VehicleDetailResponse`, `InsurerDto`, `CoverageDto`, `DashboardItemDto`, `DashboardResponse`, `AttachmentDto`, `ImportErrorDto`, `ImportSummaryDto`, `ImportPreviewResponse`, `ImportCommitResponse`
  - Prisma models `vehicle`, `insurer`, `vehicleCoverage`, `coverageAttachment`

- [ ] **Step 1: เขียน test ที่ fail**

`lib/renewals/__tests__/constants.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  NOT_RENEWED_REASONS,
  NOT_RENEWED_REASON_LABELS,
  RENEWAL_STATUSES,
  RENEWAL_STATUS_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  isOpenStatus,
  isRenewalRole,
} from '../constants'

test('isRenewalRole: ADMIN / MANAGER / INSURANCE เท่านั้น', () => {
  for (const role of ['ADMIN', 'MANAGER', 'INSURANCE']) assert.equal(isRenewalRole(role), true)
  for (const role of ['STAFF', 'SENIOR_STAFF', 'admin', '', undefined, null]) assert.equal(isRenewalRole(role), false)
})

test('isOpenStatus: รอต่อ / กำลังดำเนินการ เท่านั้น', () => {
  assert.equal(isOpenStatus('PENDING'), true)
  assert.equal(isOpenStatus('IN_PROGRESS'), true)
  assert.equal(isOpenStatus('RENEWED'), false)
  assert.equal(isOpenStatus('NOT_RENEWED'), false)
})

test('label ครบทุก key และไม่ซ้ำกัน (import หา key กลับจาก label)', () => {
  const check = (keys: readonly string[], labels: Record<string, string>) => {
    assert.deepEqual(Object.keys(labels).sort(), [...keys].sort())
    assert.equal(new Set(Object.values(labels)).size, keys.length)
  }
  check(COVERAGE_TYPES, COVERAGE_TYPE_LABELS)
  check(RENEWAL_STATUSES, RENEWAL_STATUS_LABELS)
  check(NOT_RENEWED_REASONS, NOT_RENEWED_REASON_LABELS)
  check(VEHICLE_STATUSES, VEHICLE_STATUS_LABELS)
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npx tsx --test lib/renewals/__tests__/constants.test.ts`
Expected: FAIL — `Cannot find module '../constants'`

- [ ] **Step 3: สร้าง `lib/renewals/constants.ts`**

```ts
// ค่าคงที่ของฟีเจอร์ต่ออายุรถ — middleware import ไฟล์นี้ จึงต้อง edge-safe (ห้าม import prisma / auth / fs)

export const RENEWAL_ROLES = ['ADMIN', 'MANAGER', 'INSURANCE'] as const

export const COVERAGE_TYPES = ['PRB', 'TAX', 'MOTOR_INSURANCE', 'CARGO_INSURANCE'] as const
export type CoverageTypeKey = (typeof COVERAGE_TYPES)[number]

export const RENEWAL_STATUSES = ['PENDING', 'IN_PROGRESS', 'RENEWED', 'NOT_RENEWED'] as const
export type RenewalStatusKey = (typeof RENEWAL_STATUSES)[number]

export const NOT_RENEWED_REASONS = ['SOLD', 'SUSPENDED', 'ACCIDENT', 'REPAIR', 'OTHER'] as const
export type NotRenewedReasonKey = (typeof NOT_RENEWED_REASONS)[number]

export const VEHICLE_STATUSES = ['ACTIVE', 'SUSPENDED', 'SOLD'] as const
export type VehicleStatusKey = (typeof VEHICLE_STATUSES)[number]

/** งวดที่ยังต้องดำเนินการ — ขึ้น dashboard และเปลี่ยนสถานะต่อได้ */
export const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS'] as const

/** ช่วงวันหมดเทียบกับวันนี้ (ดู dueWindow.ts) */
export type DueBucket = 'OVERDUE' | 'THIS_MONTH' | 'NEXT_MONTH' | 'LATER'

export const COVERAGE_CLASSES = ['ป.1', 'ป.2+', 'ป.3', 'ป.3+'] as const

export const COVERAGE_TYPE_LABELS: Record<CoverageTypeKey, string> = {
  PRB: 'พรบ.',
  TAX: 'ภาษี',
  MOTOR_INSURANCE: 'ประกันรถยนต์',
  CARGO_INSURANCE: 'ประกันสินค้า',
}

export const RENEWAL_STATUS_LABELS: Record<RenewalStatusKey, string> = {
  PENDING: 'รอต่อ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RENEWED: 'ต่อแล้ว',
  NOT_RENEWED: 'ไม่ต่อ',
}

export const RENEWAL_STATUS_COLORS: Record<RenewalStatusKey, string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  RENEWED: 'success',
  NOT_RENEWED: 'error',
}

export const NOT_RENEWED_REASON_LABELS: Record<NotRenewedReasonKey, string> = {
  SOLD: 'ขายรถ',
  SUSPENDED: 'งดใช้',
  ACCIDENT: 'รถเกิดอุบัติเหตุ',
  REPAIR: 'รถซ่อม',
  OTHER: 'อื่นๆ',
}

export const VEHICLE_STATUS_LABELS: Record<VehicleStatusKey, string> = {
  ACTIVE: 'ใช้งาน',
  SUSPENDED: 'งดใช้',
  SOLD: 'ขาย',
}

export const VEHICLE_STATUS_COLORS: Record<VehicleStatusKey, string> = {
  ACTIVE: 'green',
  SUSPENDED: 'gold',
  SOLD: 'default',
}

/** จำนวนแถวสูงสุดต่อ bulk action */
export const BULK_LIMIT = 500

/** Decimal(10,2) */
export const MAX_MONEY = 99_999_999.99

export function isRenewalRole(role: string | null | undefined): boolean {
  return !!role && (RENEWAL_ROLES as readonly string[]).includes(role)
}

export function isOpenStatus(status: RenewalStatusKey): boolean {
  return (OPEN_STATUSES as readonly RenewalStatusKey[]).includes(status)
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx tsx --test lib/renewals/__tests__/constants.test.ts`
Expected: PASS 3 tests

- [ ] **Step 5: แก้ `prisma/schema.prisma`**

5.1 enum `Role` เพิ่ม `INSURANCE`:

```prisma
enum Role {
  ADMIN
  MANAGER
  SENIOR_STAFF
  STAFF
  INSURANCE // ฝ่ายประกัน — เห็นเฉพาะเมนูต่ออายุรถ
}
```

5.2 ใน `model AuthUser` ต่อจากบรรทัด `monthlyEntries  DriverMonthlyEntry[]` เพิ่ม:

```prisma
  coveragesCreated      VehicleCoverage[]    @relation("CoverageCreatedBy")
  coverageStatusUpdates VehicleCoverage[]    @relation("CoverageStatusUpdatedBy")
  coverageAttachments   CoverageAttachment[] @relation("AttachmentUploadedBy")
```

5.3 ต่อท้ายไฟล์:

```prisma
// ============================================
// ต่ออายุรถ (พรบ. / ภาษี / ประกัน)
// ============================================

enum VehicleStatus {
  ACTIVE // ใช้งาน
  SUSPENDED // งดใช้ (แจ้ง ม.89)
  SOLD // ขาย / เลิกใช้ (แจ้ง ม.79)
}

enum CoverageType {
  PRB // พรบ.
  TAX // ภาษี
  MOTOR_INSURANCE // ประกันรถยนต์
  CARGO_INSURANCE // ประกันสินค้า (ความรับผิดผู้ขนส่ง)
}

enum RenewalStatus {
  PENDING
  IN_PROGRESS
  RENEWED
  NOT_RENEWED
}

enum NotRenewedReason {
  SOLD
  SUSPENDED
  ACCIDENT
  REPAIR
  OTHER
}

model Vehicle {
  id            String        @id @default(cuid())
  /// normalize แล้ว (lib/renewals/plate.ts)
  plate         String        @unique
  /// เบอร์รถ — free text ไม่ unique (หัวกับหางใช้เลขซ้ำกันได้)
  fleetNumber   String?
  ownerName     String
  vehicleType   String
  brand         String?
  chassisNumber String?
  fuelType      String?
  weightKg      Int?
  status        VehicleStatus @default(ACTIVE)
  statusDate    DateTime?     @db.Date
  note          String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  coverages       VehicleCoverage[] @relation("CoverageVehicle")
  pairedCoverages VehicleCoverage[] @relation("CoveragePairedVehicle")

  @@index([ownerName])
  @@map("vehicles")
}

model Insurer {
  id        String   @id @default(cuid())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  coverages VehicleCoverage[]

  @@map("insurers")
}

/// 1 แถว = 1 งวดของรถ 1 คัน 1 ประเภท; สถานะการต่ออยู่บนงวดที่กำลังจะหมด
model VehicleCoverage {
  id                String            @id @default(cuid())
  vehicleId         String
  vehicle           Vehicle           @relation("CoverageVehicle", fields: [vehicleId], references: [id])
  type              CoverageType
  insurerId         String?
  insurer           Insurer?          @relation(fields: [insurerId], references: [id])
  coverageClass     String?
  policyNumber      String?
  startDate         DateTime?         @db.Date
  /// วันสุดท้ายที่คุ้มครอง (inclusive)
  endDate           DateTime          @db.Date
  amount            Decimal?          @db.Decimal(10, 2)
  serviceFee        Decimal?          @db.Decimal(10, 2)
  pairedVehicleId   String?
  pairedVehicle     Vehicle?          @relation("CoveragePairedVehicle", fields: [pairedVehicleId], references: [id])

  renewalStatus     RenewalStatus     @default(PENDING)
  notRenewedReason  NotRenewedReason?
  renewalNote       String?
  renewedToId       String?           @unique
  renewedTo         VehicleCoverage?  @relation("CoverageRenewal", fields: [renewedToId], references: [id])
  renewedFrom       VehicleCoverage?  @relation("CoverageRenewal")
  statusUpdatedAt   DateTime?
  statusUpdatedById String?
  statusUpdatedBy   AuthUser?         @relation("CoverageStatusUpdatedBy", fields: [statusUpdatedById], references: [id])
  createdById       String
  createdBy         AuthUser          @relation("CoverageCreatedBy", fields: [createdById], references: [id])
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  attachments CoverageAttachment[]

  @@unique([vehicleId, type, endDate])
  @@index([renewalStatus, endDate])
  @@index([vehicleId, type])
  @@map("vehicle_coverages")
}

model CoverageAttachment {
  id           String          @id @default(cuid())
  coverageId   String
  coverage     VehicleCoverage @relation(fields: [coverageId], references: [id], onDelete: Cascade)
  fileKey      String
  fileName     String
  contentType  String
  sizeBytes    Int
  uploadedById String
  uploadedBy   AuthUser        @relation("AttachmentUploadedBy", fields: [uploadedById], references: [id])
  createdAt    DateTime        @default(now())

  @@index([coverageId])
  @@map("coverage_attachments")
}
```

- [ ] **Step 6: validate + generate**

Run: `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` และ generate สำเร็จ

- [ ] **Step 7: สร้าง `types/renewals.ts`**

```ts
import type {
  CoverageTypeKey,
  DueBucket,
  NotRenewedReasonKey,
  RenewalStatusKey,
  VehicleStatusKey,
} from '@/lib/renewals/constants'

// DTO ที่ API ส่งให้ UI — วันที่เป็น 'YYYY-MM-DD', เงินเป็น number

export interface VehicleSummaryDto {
  id: string
  plate: string
  fleetNumber: string | null
  ownerName: string
  vehicleType: string
  status: VehicleStatusKey
}

export interface VehicleDto extends VehicleSummaryDto {
  brand: string | null
  chassisNumber: string | null
  fuelType: string | null
  weightKg: number | null
  statusDate: string | null
  note: string | null
}

export interface VehicleListItemDto extends VehicleDto {
  /** วันสิ้นสุดของงวดล่าสุดแต่ละประเภท */
  latestEndDates: Partial<Record<CoverageTypeKey, string>>
}

export interface InsurerDto {
  id: string
  name: string
  isActive: boolean
}

export interface CoverageDto {
  id: string
  vehicleId: string
  type: CoverageTypeKey
  insurerId: string | null
  insurerName: string | null
  coverageClass: string | null
  policyNumber: string | null
  startDate: string | null
  endDate: string
  amount: number | null
  serviceFee: number | null
  pairedVehicleId: string | null
  pairedPlate: string | null
  renewalStatus: RenewalStatusKey
  notRenewedReason: NotRenewedReasonKey | null
  renewalNote: string | null
  renewedToId: string | null
  attachmentCount: number
  vehicle: VehicleSummaryDto
}

export interface VehicleDetailResponse {
  vehicle: VehicleDto
  coverages: CoverageDto[]
}

export interface DashboardItemDto extends CoverageDto {
  bucket: DueBucket
}

export interface DashboardResponse {
  today: string
  items: DashboardItemDto[]
}

export interface AttachmentDto {
  id: string
  coverageId: string
  fileName: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

export interface ImportErrorDto {
  sheet: string
  row: number
  field: string
  message: string
}

export interface ImportSummaryDto {
  vehiclesCreated: number
  vehiclesUpdated: number
  coveragesCreated: number
  coveragesUpdated: number
  coveragesAutoClosed: number
}

export interface ImportPreviewResponse {
  valid: boolean
  errors: ImportErrorDto[]
  unknownInsurers: string[]
  summary: ImportSummaryDto
}

export interface ImportCommitResponse {
  success: true
  summary: ImportSummaryDto
}
```

- [ ] **Step 8: เช็ก type**

Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"`
Expected: เหลือแค่ 2 บรรทัดเดิม (`app/api/convert-statement/route.ts`, `prisma/seed.ts`)

- [ ] **Step 9: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add prisma/schema.prisma lib/renewals/constants.ts lib/renewals/__tests__/constants.test.ts types/renewals.ts
git commit -m "$(cat <<'EOF'
feat(renewals): เพิ่ม schema รถ/งวด/บริษัทประกัน/ไฟล์แนบ และ role ฝ่ายประกัน

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Helper วันที่ / ทะเบียน / งวดถัดไป (pure)

**Files:**
- Create: `lib/renewals/dateOnly.ts`, `lib/renewals/dueWindow.ts`, `lib/renewals/renewalDefaults.ts`, `lib/renewals/plate.ts`
- Test: `lib/renewals/__tests__/dateOnly.test.ts`, `dueWindow.test.ts`, `renewalDefaults.test.ts`, `plate.test.ts`

**Interfaces:**
- Consumes: `DueBucket` จาก `./constants`
- Produces:
  - `dateOnly.ts`: `isValidYmd(v: string): boolean`, `ymdToDate(ymd: string): Date` (UTC เที่ยงคืน), `dateToYmd(d: Date): string`, `addDays(ymd, n): string`, `addYears(ymd, n): string` (29 ก.พ. → 28 ก.พ.), `endOfMonth(ymd): string`, `todayInBangkok(now?: Date): string`
  - `dueWindow.ts`: `endOfNextMonth(today: string): string`, `dueBucket(endDate: string, today: string): DueBucket`, `DUE_BUCKET_COLORS: Record<DueBucket, string>`, `DUE_BUCKET_LABELS: Record<DueBucket, string>`
  - `renewalDefaults.ts`: `nextPeriodDefaults(oldEndDate: string): { startDate: string; endDate: string }`, `validateNewPeriod(oldEndDate: string, startDate: string | null, endDate: string): string | null`
  - `plate.ts`: `normalizePlate(raw: string): string`

- [ ] **Step 1: เขียน test ที่ fail (4 ไฟล์)**

`lib/renewals/__tests__/dateOnly.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, addYears, dateToYmd, endOfMonth, isValidYmd, todayInBangkok, ymdToDate } from '../dateOnly'

test('todayInBangkok ใช้เวลาไทย ไม่ใช่ UTC', () => {
  assert.equal(todayInBangkok(new Date('2026-10-05T17:30:00Z')), '2026-10-06') // 00:30 น. เวลาไทย
  assert.equal(todayInBangkok(new Date('2026-10-05T16:59:59Z')), '2026-10-05') // 23:59 น. เวลาไทย
})

test('isValidYmd ตรวจวันที่มีอยู่จริง', () => {
  assert.equal(isValidYmd('2028-02-29'), true)
  assert.equal(isValidYmd('2027-02-29'), false)
  assert.equal(isValidYmd('2027-13-01'), false)
  assert.equal(isValidYmd('27-01-01'), false)
  assert.equal(isValidYmd('2027-1-01'), false)
})

test('ymdToDate / dateToYmd ไปกลับได้ตรง', () => {
  assert.equal(ymdToDate('2027-03-31').toISOString(), '2027-03-31T00:00:00.000Z')
  assert.equal(dateToYmd(ymdToDate('2027-03-31')), '2027-03-31')
})

test('addDays ข้ามเดือนและปี', () => {
  assert.equal(addDays('2027-03-31', 1), '2027-04-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-10-06', -6), '2026-09-30')
})

test('addYears: 29 ก.พ. ปีถัดไปเป็น 28 ก.พ.', () => {
  assert.equal(addYears('2027-03-31', 1), '2028-03-31')
  assert.equal(addYears('2028-02-29', 1), '2029-02-28')
})

test('endOfMonth รวมเดือน ก.พ. ปีอธิกสุรทิน', () => {
  assert.equal(endOfMonth('2028-02-10'), '2028-02-29')
  assert.equal(endOfMonth('2027-02-01'), '2027-02-28')
  assert.equal(endOfMonth('2026-12-05'), '2026-12-31')
})
```

`lib/renewals/__tests__/dueWindow.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueBucket, endOfNextMonth } from '../dueWindow'

test('endOfNextMonth: วันนี้ 6 ต.ค. → 30 พ.ย., ธ.ค. ข้ามปี, ม.ค. → ก.พ. อธิกสุรทิน', () => {
  assert.equal(endOfNextMonth('2026-10-06'), '2026-11-30')
  assert.equal(endOfNextMonth('2026-12-15'), '2027-01-31')
  assert.equal(endOfNextMonth('2028-01-31'), '2028-02-29')
})

test('dueBucket ตามขอบวัน', () => {
  const today = '2026-10-06'
  assert.equal(dueBucket('2026-10-05', today), 'OVERDUE')
  assert.equal(dueBucket('2026-10-06', today), 'THIS_MONTH')
  assert.equal(dueBucket('2026-10-31', today), 'THIS_MONTH')
  assert.equal(dueBucket('2026-11-01', today), 'NEXT_MONTH')
  assert.equal(dueBucket('2026-11-30', today), 'NEXT_MONTH')
  assert.equal(dueBucket('2026-12-01', today), 'LATER')
})
```

`lib/renewals/__tests__/renewalDefaults.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextPeriodDefaults, validateNewPeriod } from '../renewalDefaults'

test('nextPeriodDefaults: เริ่มวันถัดจากวันหมดเดิม หมดอีก 1 ปี', () => {
  assert.deepEqual(nextPeriodDefaults('2027-03-31'), { startDate: '2027-04-01', endDate: '2028-03-31' })
  assert.deepEqual(nextPeriodDefaults('2028-02-29'), { startDate: '2028-03-01', endDate: '2029-02-28' })
})

test('validateNewPeriod', () => {
  assert.equal(validateNewPeriod('2027-03-31', '2027-04-01', '2028-03-31'), null)
  assert.equal(validateNewPeriod('2027-03-31', null, '2028-03-31'), null)
  assert.equal(validateNewPeriod('2027-03-31', null, '2027-03-31'), 'วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม')
  assert.equal(validateNewPeriod('2027-03-31', '2028-04-01', '2028-03-31'), 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม')
  assert.equal(validateNewPeriod('2027-03-31', null, '2028-02-30'), 'วันสิ้นสุดไม่ถูกต้อง')
  assert.equal(validateNewPeriod('2027-03-31', '2028-13-01', '2028-03-31'), 'วันเริ่มไม่ถูกต้อง')
})
```

`lib/renewals/__tests__/plate.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlate } from '../plate'

test('normalizePlate: ตัดจุดท้าย ยุบช่องว่าง trim', () => {
  assert.equal(normalizePlate('64-5598 กท.'), '64-5598 กท')
  assert.equal(normalizePlate('  64-0329  กท '), '64-0329 กท')
  assert.equal(normalizePlate('63-9883 กท. '), '63-9883 กท')
  assert.equal(normalizePlate('76-4349'), '76-4349')
  assert.equal(normalizePlate('ฆณ 8228 กท'), 'ฆณ 8228 กท')
  assert.equal(normalizePlate('   '), '')
  assert.equal(normalizePlate(' . '), '')
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/renewals/__tests__/dateOnly.test.ts lib/renewals/__tests__/dueWindow.test.ts lib/renewals/__tests__/renewalDefaults.test.ts lib/renewals/__tests__/plate.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: สร้างไฟล์ทั้ง 4**

`lib/renewals/dateOnly.ts`:

```ts
// วันที่แบบไม่มีเวลา ('YYYY-MM-DD') — คำนวณบน UTC ทั้งหมดเพื่อไม่ให้ timezone ของเครื่องทำวันเลื่อน
// (ตรงกับ Prisma @db.Date ที่คืน Date เวลา 00:00 UTC)

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function fromUtc(year: number, monthIndex: number, day: number): string {
  return dateToYmd(new Date(Date.UTC(year, monthIndex, day)))
}

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

export function isValidYmd(value: string): boolean {
  const match = YMD_RE.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

export function dateToYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(ymd: string, days: number): string {
  const { y, m, d } = parts(ymd)
  return fromUtc(y, m - 1, d + days)
}

export function endOfMonth(ymd: string): string {
  const { y, m } = parts(ymd)
  return fromUtc(y, m, 0)
}

/** +n ปี — ถ้าวันเดิมไม่มีในปีปลายทาง (29 ก.พ.) ใช้วันสุดท้ายของเดือน */
export function addYears(ymd: string, years: number): string {
  const { y, m, d } = parts(ymd)
  const lastDay = Number(endOfMonth(fromUtc(y + years, m - 1, 1)).slice(8))
  return fromUtc(y + years, m - 1, Math.min(d, lastDay))
}

export function todayInBangkok(now: Date = new Date()): string {
  // en-CA ให้รูปแบบ YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
```

`lib/renewals/dueWindow.ts`:

```ts
import type { DueBucket } from './constants'
import { addDays, endOfMonth } from './dateOnly'

/** dashboard แสดงงวดเปิดที่หมดไม่เกินวันนี้ของฟังก์ชันนี้ */
export function endOfNextMonth(today: string): string {
  return endOfMonth(addDays(endOfMonth(today), 1))
}

export function dueBucket(endDate: string, today: string): DueBucket {
  if (endDate < today) return 'OVERDUE'
  if (endDate <= endOfMonth(today)) return 'THIS_MONTH'
  if (endDate <= endOfNextMonth(today)) return 'NEXT_MONTH'
  return 'LATER'
}

export const DUE_BUCKET_COLORS: Record<DueBucket, string> = {
  OVERDUE: 'red',
  THIS_MONTH: 'orange',
  NEXT_MONTH: 'blue',
  LATER: 'default',
}

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  OVERDUE: 'เลยกำหนด',
  THIS_MONTH: 'หมดเดือนนี้',
  NEXT_MONTH: 'หมดเดือนหน้า',
  LATER: 'หลังเดือนหน้า',
}
```

`lib/renewals/renewalDefaults.ts`:

```ts
import { addDays, addYears, isValidYmd } from './dateOnly'

/** ค่าเริ่มต้นของงวดใหม่ตอนกด "ต่อแล้ว" */
export function nextPeriodDefaults(oldEndDate: string): { startDate: string; endDate: string } {
  return { startDate: addDays(oldEndDate, 1), endDate: addYears(oldEndDate, 1) }
}

/** คืนข้อความ error ภาษาไทย หรือ null ถ้าผ่าน */
export function validateNewPeriod(oldEndDate: string, startDate: string | null, endDate: string): string | null {
  if (!isValidYmd(endDate)) return 'วันสิ้นสุดไม่ถูกต้อง'
  if (startDate !== null && !isValidYmd(startDate)) return 'วันเริ่มไม่ถูกต้อง'
  if (endDate <= oldEndDate) return 'วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม'
  if (startDate !== null && endDate < startDate) return 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'
  return null
}
```

`lib/renewals/plate.ts`:

```ts
/**
 * ทำทะเบียนให้อยู่รูปเดียวกัน — ใช้ทุกจุดที่รับทะเบียน (ฟอร์ม, ค้นหา, import)
 * "64-5598 กท." / " 64-5598  กท " → "64-5598 กท"
 */
export function normalizePlate(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/\.+$/, '').trim()
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx tsx --test lib/renewals/__tests__/dateOnly.test.ts lib/renewals/__tests__/dueWindow.test.ts lib/renewals/__tests__/renewalDefaults.test.ts lib/renewals/__tests__/plate.test.ts`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/renewals/dateOnly.ts lib/renewals/dueWindow.ts lib/renewals/renewalDefaults.ts lib/renewals/plate.ts lib/renewals/__tests__/
git commit -m "$(cat <<'EOF'
feat(renewals): helper วันที่ (Asia/Bangkok), ช่วงวันหมด, งวดถัดไป และ normalize ทะเบียน

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: สิทธิ์ (middleware) + เมนู + role ฝ่ายประกัน

**Files:**
- Create: `lib/renewals/routeAccess.ts`, `lib/renewals/__tests__/routeAccess.test.ts`
- Modify: `middleware.ts`
- Create: `app/(protected)/renewals/layout.tsx`, `app/(protected)/renewals/page.tsx` (หน้าชั่วคราว — Task 8 แทนที่)
- Modify: `components/ProtectedLayoutClient.tsx`
- Modify: `app/(protected)/admin/users/page.tsx`, `app/api/users/route.ts:10`, `app/api/users/[id]/route.ts:9`
- Modify: `e2e/scripts/seed.ts`
- Create: `e2e/renewals/helpers.ts`, `e2e/renewals/access.spec.ts`

**Interfaces:**
- Consumes: `isRenewalRole` จาก Task 1
- Produces:
  - `renewalRouteDecision(role: string | undefined, pathname: string): RouteDecision` โดย `RouteDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'forbidden' }`
  - e2e helper `login(page: Page, username: string, landing: RegExp): Promise<void>`
  - seed users `testinsurance` (INSURANCE), `teststaff` (STAFF) รหัส `admin123`
  - หน้า `/renewals` มี `<h2>ต่ออายุรถ</h2>` (Task 8 ต้องคงหัวข้อนี้)

- [ ] **Step 1: เขียน test ที่ fail**

`lib/renewals/__tests__/routeAccess.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renewalRouteDecision } from '../routeAccess'

const allow = { kind: 'allow' }
const forbidden = { kind: 'forbidden' }
const redirect = (to: string) => ({ kind: 'redirect', to })

test('INSURANCE: หน้าและ API ของ renewals ผ่าน', () => {
  for (const p of ['/renewals', '/renewals/vehicles/abc', '/api/renewals/dashboard', '/api/auth/session']) {
    assert.deepEqual(renewalRouteDecision('INSURANCE', p), allow, p)
  }
})

test('INSURANCE: หน้าอื่น (รวม /) ถูกพาไป /renewals', () => {
  for (const p of ['/', '/jobs', '/line-images', '/admin/users', '/renewalsx']) {
    assert.deepEqual(renewalRouteDecision('INSURANCE', p), redirect('/renewals'), p)
  }
})

test('INSURANCE: API อื่น 403', () => {
  for (const p of ['/api/jobs', '/api/drivers', '/api/users']) {
    assert.deepEqual(renewalRouteDecision('INSURANCE', p), forbidden, p)
  }
})

test('STAFF / SENIOR_STAFF เข้า renewals ไม่ได้ แต่ path อื่นไม่ยุ่ง', () => {
  assert.deepEqual(renewalRouteDecision('STAFF', '/renewals'), redirect('/line-images'))
  assert.deepEqual(renewalRouteDecision('SENIOR_STAFF', '/renewals/import'), redirect('/jobs'))
  assert.deepEqual(renewalRouteDecision('STAFF', '/api/renewals/dashboard'), forbidden)
  assert.deepEqual(renewalRouteDecision('STAFF', '/renewalsx'), allow)
  assert.deepEqual(renewalRouteDecision('STAFF', '/jobs'), allow)
})

test('ADMIN / MANAGER ผ่านทุก path', () => {
  for (const role of ['ADMIN', 'MANAGER']) {
    for (const p of ['/renewals', '/api/renewals/x', '/jobs', '/api/jobs']) {
      assert.deepEqual(renewalRouteDecision(role, p), allow, `${role} ${p}`)
    }
  }
})

test('ไม่รู้ role (ถอด token ไม่ได้) → ปล่อยผ่าน ให้ page/route เช็กเอง', () => {
  assert.deepEqual(renewalRouteDecision(undefined, '/renewals'), allow)
  assert.deepEqual(renewalRouteDecision(undefined, '/api/renewals/x'), allow)
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/renewals/__tests__/routeAccess.test.ts`
Expected: FAIL — `Cannot find module '../routeAccess'`

- [ ] **Step 3: สร้าง `lib/renewals/routeAccess.ts`**

```ts
import { isRenewalRole } from './constants'

export type RouteDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'forbidden' }

const ALLOW: RouteDecision = { kind: 'allow' }

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/**
 * สิทธิ์ path ของฟีเจอร์ต่ออายุรถ — middleware เรียกหลังถอด JWT
 * - INSURANCE เห็นเฉพาะ /renewals และ /api/renewals
 * - role อื่นที่ไม่อยู่ใน RENEWAL_ROLES เข้า /renewals ไม่ได้
 * - ไม่รู้ role (ถอด token ไม่ได้) → ปล่อยผ่าน ให้ page/route เช็กเอง (พฤติกรรมเดิม)
 */
export function renewalRouteDecision(role: string | undefined, pathname: string): RouteDecision {
  if (!role) return ALLOW
  const isApi = isUnder(pathname, '/api')
  const isRenewal = isUnder(pathname, '/renewals') || isUnder(pathname, '/api/renewals')

  if (role === 'INSURANCE') {
    if (isRenewal || isUnder(pathname, '/api/auth')) return ALLOW
    return isApi ? { kind: 'forbidden' } : { kind: 'redirect', to: '/renewals' }
  }

  if (isRenewal && !isRenewalRole(role)) {
    if (isApi) return { kind: 'forbidden' }
    return { kind: 'redirect', to: role === 'STAFF' ? '/line-images' : '/jobs' }
  }

  return ALLOW
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx tsx --test lib/renewals/__tests__/routeAccess.test.ts`
Expected: PASS 6 tests

- [ ] **Step 5: Impact analysis ก่อนแก้ไฟล์เดิม**

Run:
```bash
node .gitnexus/run.cjs impact "middleware" --direction upstream --repo .
node .gitnexus/run.cjs impact "ProtectedLayoutClient" --direction upstream --repo .
```
รายงาน risk ที่ได้ ถ้า HIGH/CRITICAL ให้แจ้งก่อนแก้

- [ ] **Step 6: แก้ `middleware.ts`**

แทนที่ทั้งไฟล์ (คง matcher และพฤติกรรมเดิมไว้ เพิ่มเฉพาะช่วงหลังเช็ก cookie):

```ts
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { renewalRouteDecision } from "@/lib/renewals/routeAccess"

/** role จาก JWT — ถอดไม่ได้ (secret หาย/ token เสีย) คืน undefined ให้ทำงานแบบเดิม */
async function readRole(request: NextRequest): Promise<string | undefined> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
      secureCookie: request.cookies.has("__Secure-authjs.session-token"),
    })
    return typeof token?.role === "string" ? token.role : undefined
  } catch {
    return undefined
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page, API auth routes, and LINE webhook (authenticated by signature)
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/line/webhook")
  ) {
    return NextResponse.next()
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("authjs.session-token") || request.cookies.get("__Secure-authjs.session-token")

  // Redirect to login if no session
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // สิทธิ์ของฟีเจอร์ต่ออายุรถ — ฝ่ายประกันเห็นเฉพาะ /renewals
  // (authorized() ใน lib/auth.ts ไม่ถูกเรียกเพราะ middleware นี้เขียนเอง จึงต้องเช็กที่นี่)
  const decision = renewalRouteDecision(await readRole(request), pathname)
  if (decision.kind === "forbidden") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 })
  }
  if (decision.kind === "redirect") {
    return NextResponse.redirect(new URL(decision.to, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (NextAuth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!api/auth|api/line/webhook|_next/static|_next/image|favicon.ico|.*\\..*|login).*)",
  ],
}
```

- [ ] **Step 7: สร้าง layout guard และหน้าชั่วคราว**

`app/(protected)/renewals/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { App } from 'antd'
import { auth } from '@/lib/auth'
import { isRenewalRole } from '@/lib/renewals/constants'

// guard ชั้นที่สอง (ชั้นแรกคือ middleware) — กันกรณีถอด JWT ใน middleware ไม่ได้
export default async function RenewalsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isRenewalRole(session.user.role)) redirect('/jobs')
  return <App>{children}</App>
}
```

`app/(protected)/renewals/page.tsx` (ชั่วคราว — Task 8 แทนที่ด้วย dashboard):

```tsx
export default function RenewalsPage() {
  return <h2 style={{ margin: 0 }}>ต่ออายุรถ</h2>
}
```

- [ ] **Step 8: เมนูใน `components/ProtectedLayoutClient.tsx`**

8.1 import icon — เพิ่ม `CarOutlined,` ในรายการ import จาก `@ant-design/icons` (ต่อจาก `PictureOutlined,`)

8.2 ใน `getSelectedKey` เพิ่มเป็นบรรทัดแรกของฟังก์ชัน (ก่อน `if (pathname?.startsWith("/admin/users"))`):

```ts
    if (pathname?.startsWith("/renewals/vehicles")) return "renewals-vehicles";
    if (pathname?.startsWith("/renewals/insurers")) return "renewals-insurers";
    if (pathname?.startsWith("/renewals/import")) return "renewals-import";
    if (pathname?.startsWith("/renewals")) return "renewals-dashboard";
```

8.3 ใน `getOpenKeys` เพิ่มก่อน `return keys;`:

```ts
    if (pathname?.startsWith("/renewals")) keys.push("renewals");
```

8.4 ต่อจาก `const usersMenu = {...};` เพิ่ม:

```tsx
  const renewalsMenu = {
    key: "renewals",
    icon: <CarOutlined />,
    label: "ต่ออายุรถ",
    children: [
      { key: "renewals-dashboard", label: <Link href="/renewals">ภาพรวม</Link> },
      { key: "renewals-vehicles", label: <Link href="/renewals/vehicles">ทะเบียนรถ</Link> },
      { key: "renewals-insurers", label: <Link href="/renewals/insurers">บริษัทประกัน</Link> },
      { key: "renewals-import", label: <Link href="/renewals/import">นำเข้า Excel</Link> },
    ],
  };
```

8.5 แทนที่ส่วนต้นของ `menuItems`:

เดิม:
```tsx
  const menuItems = isAdmin
    ? [
        ...commonMenuItems,
        stockMenu,
        usersMenu,
      ]
    : isManager
    ? commonMenuItems
    : isSeniorStaff
```
ใหม่:
```tsx
  const menuItems = isAdmin
    ? [
        ...commonMenuItems,
        renewalsMenu,
        stockMenu,
        usersMenu,
      ]
    : isManager
    ? [...commonMenuItems, renewalsMenu]
    : userRole === "INSURANCE"
    ? [renewalsMenu]
    : isSeniorStaff
```

8.6 Tag role ที่ header — เดิม:
```tsx
                    : userRole === "SENIOR_STAFF"
                    ? "geekblue"
                    : "blue"
                }
                style={{ marginLeft: 2, marginRight: 0 }}
              >
                {userRole}
              </Tag>
```
ใหม่:
```tsx
                    : userRole === "SENIOR_STAFF"
                    ? "geekblue"
                    : userRole === "INSURANCE"
                    ? "gold"
                    : "blue"
                }
                style={{ marginLeft: 2, marginRight: 0 }}
              >
                {userRole === "INSURANCE" ? "ฝ่ายประกัน" : userRole}
              </Tag>
```

- [ ] **Step 9: role INSURANCE ในหน้าจัดการผู้ใช้และ API**

รัน impact ก่อน: `node .gitnexus/run.cjs impact "POST" --direction upstream --repo .` (route `app/api/users/route.ts`) — ถ้า index หา symbol ไม่เจอ (UNKNOWN) ให้ยืนยันด้วย `grep -rn "api/users" app components` แล้วรายงาน

9.1 `app/api/users/route.ts` บรรทัด 10: `role: z.enum(['ADMIN', 'MANAGER', 'SENIOR_STAFF', 'STAFF']),` → `role: z.enum(['ADMIN', 'MANAGER', 'SENIOR_STAFF', 'STAFF', 'INSURANCE']),`

9.2 `app/api/users/[id]/route.ts` บรรทัด 9: `role: z.enum(['ADMIN', 'MANAGER', 'SENIOR_STAFF', 'STAFF']).optional(),` → `role: z.enum(['ADMIN', 'MANAGER', 'SENIOR_STAFF', 'STAFF', 'INSURANCE']).optional(),`

9.3 `app/(protected)/admin/users/page.tsx`:
- ทุกที่ที่มี union `'ADMIN' | 'MANAGER' | 'SENIOR_STAFF' | 'STAFF'` (บรรทัด 12 และ 156) → เพิ่ม `| 'INSURANCE'`
- object `colors` เพิ่ม `INSURANCE: '#d48806',`; object `labels` เพิ่ม `INSURANCE: 'ฝ่ายประกัน',`
- ใน `<Select>` ของฟอร์มเพิ่ม/แก้ผู้ใช้ทั้ง 2 จุด (บรรทัด ~291 และ ~341) เพิ่มต่อจาก `<Select.Option value="STAFF">STAFF</Select.Option>`:

```tsx
              <Select.Option value="INSURANCE">ฝ่ายประกัน</Select.Option>
```

- [ ] **Step 10: seed users ทดสอบ (`e2e/scripts/seed.ts`)**

ใน `main()` ต่อจาก upsert ของ `testmanager` เพิ่ม และแก้ข้อความ log:

```ts
  await prisma.authUser.upsert({
    where: { username: 'testinsurance' },
    update: { password, role: 'INSURANCE' },
    create: { username: 'testinsurance', password, role: 'INSURANCE', name: 'Test Insurance' },
  })
  await prisma.authUser.upsert({
    where: { username: 'teststaff' },
    update: { password, role: 'STAFF' },
    create: { username: 'teststaff', password, role: 'STAFF', name: 'Test Staff' },
  })
  console.log('✅ [Playwright] seed test users สำเร็จ: testadmin, testmanager, testinsurance, teststaff / admin123')
```
(ลบบรรทัด `console.log` เดิม)

- [ ] **Step 11: e2e helper + access spec**

`e2e/renewals/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'

export async function login(page: Page, username: string, landing: RegExp) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(landing, { timeout: 10_000 })
}

export function cleanupRenewals() {
  execSync('npx tsx e2e/scripts/cleanup-renewals.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}
```

`e2e/renewals/access.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('สิทธิ์ฟีเจอร์ต่ออายุรถ', () => {
  test('INSURANCE: login แล้วอยู่ /renewals และเห็นเฉพาะเมนูต่ออายุรถ', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const sider = page.locator('.ant-layout-sider')
    await expect(sider.getByText('ต่ออายุรถ')).toBeVisible()
    await expect(sider.getByText('งานขนส่ง')).toHaveCount(0)
    await expect(sider.getByText('รูปภาพ LINE')).toHaveCount(0)
  })

  test('INSURANCE: เปิดหน้าอื่นตรงๆ ถูกพากลับ /renewals', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    for (const path of ['/jobs', '/line-images', '/admin/users']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/renewals$/)
    }
  })

  test('INSURANCE: API อื่นได้ 403', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    expect((await page.request.get('/api/drivers')).status()).toBe(403)
  })

  test('STAFF: เปิด /renewals ถูกพาไป /line-images และ API ต่ออายุรถได้ 403', async ({ page }) => {
    await login(page, 'teststaff', /\/jobs/)
    await page.goto('/renewals')
    await expect(page).toHaveURL(/\/line-images/)
    expect((await page.request.get('/api/renewals/dashboard')).status()).toBe(403)
  })

  test('MANAGER: เห็นเมนูต่ออายุรถและเปิด /renewals ได้', async ({ page }) => {
    await login(page, 'testmanager', /\/jobs/)
    await expect(page.locator('.ant-layout-sider').getByText('ต่ออายุรถ')).toBeVisible()
    await page.goto('/renewals')
    await expect(page).toHaveURL(/\/renewals$/)
    await expect(page.getByRole('heading', { name: 'ต่ออายุรถ' })).toBeVisible()
  })
})
```

- [ ] **Step 12: รัน e2e**

Run: `npx playwright test e2e/renewals/access.spec.ts --workers=1`
Expected: PASS 5 tests (global-setup ทำ db push + seed ก่อน)
ถ้า INSURANCE ไม่ถูก redirect จาก `/jobs`: แปลว่า `getToken` ถอด token ไม่ได้ — ตรวจว่า `NEXTAUTH_SECRET` อยู่ใน env ของ webServer (`playwright.config.ts`) และชื่อ cookie ตรงกับ `authjs.session-token`

- [ ] **Step 13: เช็ก type + unit test**

Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → เหลือ 2 error เดิม
Run: `npx tsx --test lib/renewals/__tests__/*.test.ts` → PASS

- [ ] **Step 14: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/renewals/routeAccess.ts lib/renewals/__tests__/routeAccess.test.ts middleware.ts "app/(protected)/renewals" components/ProtectedLayoutClient.tsx "app/(protected)/admin/users/page.tsx" app/api/users/route.ts "app/api/users/[id]/route.ts" e2e/scripts/seed.ts e2e/renewals/helpers.ts e2e/renewals/access.spec.ts
git commit -m "$(cat <<'EOF'
feat(renewals): role ฝ่ายประกัน, สิทธิ์ใน middleware และเมนูต่ออายุรถ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 4: พื้นฐาน API (สิทธิ์, error, schema, DTO) + บริษัทประกัน

**Files:**
- Create: `lib/renewals/access.ts`, `lib/renewals/http.ts`, `lib/renewals/schemas.ts`, `lib/renewals/serialize.ts`
- Test: `lib/renewals/__tests__/schemas.test.ts`
- Create: `app/api/renewals/insurers/route.ts`, `app/api/renewals/insurers/[id]/route.ts`
- Create: `components/renewals/api.ts`, `components/renewals/InsurerManager.tsx`, `app/(protected)/renewals/insurers/page.tsx`
- Create: `e2e/scripts/cleanup-renewals.ts`, `e2e/renewals/insurers.spec.ts`
- Modify: `e2e/renewals/helpers.ts`

**Interfaces:**
- Consumes: constants (Task 1), `isValidYmd` / `normalizePlate` (Task 2)
- Produces:
  - `requireRenewalAccess(): Promise<{ user: RenewalUser } | { response: NextResponse }>`, `RenewalUser = { id: string; role: string }`
  - `http.ts`: `RenewalError`, `badRequest(msg)`, `notFound(msg)`, `conflict(msg)`, `isUniqueViolation(e)`, `isPrismaNotFound(e)`, `parseJsonBody(req, schema)`, `renewalErrorResponse(e)`, `CLOSED_ERROR`, `DUPLICATE_PERIOD_ERROR`
  - `schemas.ts`: `firstZodError`, `ymdSchema`, `vehicleInputSchema`/`VehicleInput`, `coverageFieldsSchema`/`CoverageFields`, `coverageCreateSchema`/`CoverageCreateInput`, `bulkRenewSchema`/`BulkRenewInput`, `bulkStatusSchema`/`BulkStatusInput`, `insurerCreateSchema`, `insurerUpdateSchema`, `sanitizeCoverageFields(type, fields)`
  - `serialize.ts`: `COVERAGE_INCLUDE`, `CoverageWithRelations`, `toCoverageDto`, `toVehicleDto`, `toInsurerDto`, `toAttachmentDto`
  - `components/renewals/api.ts`: `ApiResult<T>`, `getJson<T>(url)`, `sendJson<T>(url, body, method?)`
  - e2e: `cleanupRenewals()` ลบรถ `E2E%`, บริษัท `E2E%`, โฟลเดอร์ไฟล์แนบ local; `createInsurer(page, name): Promise<string>`, `expectJson<T>(res)`

- [ ] **Step 1: เขียน test ที่ fail**

`lib/renewals/__tests__/schemas.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bulkRenewSchema,
  bulkStatusSchema,
  coverageFieldsSchema,
  firstZodError,
  insurerCreateSchema,
  sanitizeCoverageFields,
  vehicleInputSchema,
} from '../schemas'

function errorOf(result: { success: boolean; error?: Parameters<typeof firstZodError>[0] }): string {
  assert.equal(result.success, false)
  return firstZodError(result.error!)
}

test('vehicleInputSchema: normalize ทะเบียน, ค่าว่างเป็น null, สถานะเริ่มต้นใช้งาน', () => {
  const r = vehicleInputSchema.parse({ plate: ' 64-5598  กท. ', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', brand: '' })
  assert.equal(r.plate, '64-5598 กท')
  assert.equal(r.brand, null)
  assert.equal(r.weightKg, null)
  assert.equal(r.status, 'ACTIVE')
})

test('vehicleInputSchema: ทะเบียนว่าง (มีแต่จุด) → error ไทย', () => {
  assert.equal(errorOf(vehicleInputSchema.safeParse({ plate: ' . ', ownerName: 'a', vehicleType: 'b' })), 'กรุณากรอกทะเบียน')
})

test('coverageFieldsSchema: วันที่ไม่มีจริง / วันเริ่มหลังวันสิ้นสุด / เงินเกิน Decimal(10,2)', () => {
  assert.equal(errorOf(coverageFieldsSchema.safeParse({ endDate: '2027-02-29' })), 'วันที่ไม่ถูกต้อง')
  assert.equal(
    errorOf(coverageFieldsSchema.safeParse({ startDate: '2027-04-01', endDate: '2027-03-31' })),
    'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม',
  )
  assert.equal(
    errorOf(coverageFieldsSchema.safeParse({ endDate: '2027-03-31', amount: 100_000_000 })),
    'จำนวนเงินต้องไม่เกิน 99,999,999.99',
  )
  const ok = coverageFieldsSchema.parse({ endDate: '2027-03-31', policyNumber: '  ' })
  assert.equal(ok.policyNumber, null)
  assert.equal(ok.startDate, null)
})

test('bulkStatusSchema: ไม่ต่อต้องมีเหตุผล, อื่นๆ ต้องมีหมายเหตุ', () => {
  assert.equal(errorOf(bulkStatusSchema.safeParse({ ids: ['a'], status: 'NOT_RENEWED' })), 'กรุณาเลือกเหตุผลที่ไม่ต่อ')
  assert.equal(
    errorOf(bulkStatusSchema.safeParse({ ids: ['a'], status: 'NOT_RENEWED', reason: 'OTHER', note: ' ' })),
    'เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ',
  )
  assert.equal(bulkStatusSchema.safeParse({ ids: ['a'], status: 'IN_PROGRESS' }).success, true)
})

test('bulkRenewSchema: เกิน 500 รายการ / ไม่เลือกเลย → error', () => {
  const ids = Array.from({ length: 501 }, (_, i) => `id${i}`)
  assert.equal(errorOf(bulkRenewSchema.safeParse({ ids, endDate: '2027-03-31' })), 'เลือกได้ไม่เกิน 500 รายการ')
  assert.equal(errorOf(bulkRenewSchema.safeParse({ ids: [], endDate: '2027-03-31' })), 'กรุณาเลือกรายการ')
})

test('insurerCreateSchema: ชื่อว่าง → error ไทย, รับ names[]', () => {
  assert.equal(errorOf(insurerCreateSchema.safeParse({ name: ' ' })), 'กรุณากรอกชื่อบริษัทประกัน')
  assert.equal(errorOf(insurerCreateSchema.safeParse({})), 'กรุณากรอกชื่อบริษัทประกัน')
  assert.deepEqual(insurerCreateSchema.parse({ names: [' ก ', 'ข'] }).names, ['ก', 'ข'])
})

test('sanitizeCoverageFields: ล้างฟิลด์ที่ไม่ใช้กับประเภทนั้น', () => {
  const f = { insurerId: 'ins', coverageClass: 'ป.3', pairedVehicleId: 'v2', endDate: '2027-01-01' }
  assert.deepEqual(sanitizeCoverageFields('TAX', f), { ...f, insurerId: null, coverageClass: null, pairedVehicleId: null })
  assert.deepEqual(sanitizeCoverageFields('CARGO_INSURANCE', f), { ...f, coverageClass: null, pairedVehicleId: null })
  assert.deepEqual(sanitizeCoverageFields('PRB', f), { ...f, coverageClass: null, pairedVehicleId: null })
  assert.deepEqual(sanitizeCoverageFields('MOTOR_INSURANCE', f), f)
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/renewals/__tests__/schemas.test.ts`
Expected: FAIL — `Cannot find module '../schemas'`

- [ ] **Step 3: สร้าง `lib/renewals/schemas.ts`**

```ts
import { z } from 'zod'
import {
  BULK_LIMIT,
  COVERAGE_CLASSES,
  COVERAGE_TYPES,
  MAX_MONEY,
  NOT_RENEWED_REASONS,
  VEHICLE_STATUSES,
  type CoverageTypeKey,
} from './constants'
import { isValidYmd } from './dateOnly'
import { normalizePlate } from './plate'

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง'
}

/** ข้อความว่าง / null / undefined → null */
const optionalText = (max: number) =>
  z.string().trim().max(max, `ข้อความยาวเกิน ${max} ตัวอักษร`).nullish().transform((v) => v || null)

export const ymdSchema = z.string().refine(isValidYmd, 'วันที่ไม่ถูกต้อง')
const optionalYmd = ymdSchema.nullish().transform((v) => v ?? null)
const optionalId = z.string().min(1).nullish().transform((v) => v ?? null)
const money = z
  .number()
  .min(0, 'จำนวนเงินต้องไม่ติดลบ')
  .max(MAX_MONEY, 'จำนวนเงินต้องไม่เกิน 99,999,999.99')
  .nullish()
  .transform((v) => v ?? null)

export const vehicleInputSchema = z.object({
  plate: z
    .string()
    .transform(normalizePlate)
    .pipe(z.string().min(1, 'กรุณากรอกทะเบียน').max(30, 'ทะเบียนยาวเกิน 30 ตัวอักษร')),
  fleetNumber: optionalText(50),
  ownerName: z.string().trim().min(1, 'กรุณากรอกบริษัท').max(100, 'ชื่อบริษัทยาวเกิน 100 ตัวอักษร'),
  vehicleType: z.string().trim().min(1, 'กรุณากรอกลักษณะรถ').max(50, 'ลักษณะรถยาวเกิน 50 ตัวอักษร'),
  brand: optionalText(100),
  chassisNumber: optionalText(100),
  fuelType: optionalText(50),
  weightKg: z
    .number()
    .int('น้ำหนักต้องเป็นจำนวนเต็ม')
    .min(0, 'น้ำหนักต้องไม่ติดลบ')
    .max(100_000, 'น้ำหนักมากเกินไป')
    .nullish()
    .transform((v) => v ?? null),
  status: z.enum(VEHICLE_STATUSES).default('ACTIVE'),
  statusDate: optionalYmd,
  note: optionalText(500),
})
export type VehicleInput = z.infer<typeof vehicleInputSchema>

const coverageFieldsObject = z.object({
  insurerId: optionalId,
  coverageClass: z.enum(COVERAGE_CLASSES).nullish().transform((v) => v ?? null),
  policyNumber: optionalText(100),
  startDate: optionalYmd,
  endDate: ymdSchema,
  amount: money,
  serviceFee: money,
  pairedVehicleId: optionalId,
  renewalNote: optionalText(500),
})

const startNotAfterEnd = (v: { startDate: string | null; endDate: string }) => !v.startDate || v.startDate <= v.endDate
const START_AFTER_END = { message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', path: ['endDate'] }

export const coverageFieldsSchema = coverageFieldsObject.refine(startNotAfterEnd, START_AFTER_END)
export type CoverageFields = z.infer<typeof coverageFieldsSchema>

export const coverageCreateSchema = coverageFieldsObject
  .extend({ vehicleId: z.string().min(1, 'กรุณาเลือกรถ'), type: z.enum(COVERAGE_TYPES) })
  .refine(startNotAfterEnd, START_AFTER_END)
export type CoverageCreateInput = z.infer<typeof coverageCreateSchema>

const idsSchema = z
  .array(z.string().min(1))
  .min(1, 'กรุณาเลือกรายการ')
  .max(BULK_LIMIT, `เลือกได้ไม่เกิน ${BULK_LIMIT} รายการ`)

export const bulkRenewSchema = z
  .object({ ids: idsSchema, insurerId: optionalId, startDate: optionalYmd, endDate: ymdSchema })
  .refine(startNotAfterEnd, START_AFTER_END)
export type BulkRenewInput = z.infer<typeof bulkRenewSchema>

export const bulkStatusSchema = z
  .object({
    ids: idsSchema,
    status: z.enum(['PENDING', 'IN_PROGRESS', 'NOT_RENEWED']),
    reason: z.enum(NOT_RENEWED_REASONS).nullish().transform((v) => v ?? null),
    note: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'NOT_RENEWED') return
    if (!v.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'กรุณาเลือกเหตุผลที่ไม่ต่อ', path: ['reason'] })
    } else if (v.reason === 'OTHER' && !v.note) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ', path: ['note'] })
    }
  })
export type BulkStatusInput = z.infer<typeof bulkStatusSchema>

const insurerName = z.string().trim().min(1, 'กรุณากรอกชื่อบริษัทประกัน').max(100, 'ชื่อบริษัทประกันยาวเกิน 100 ตัวอักษร')

/** { name } เพิ่มทีละราย หรือ { names } จากปุ่ม "เพิ่มบริษัทประกันที่ยังไม่มี" ในหน้า import */
export const insurerCreateSchema = z
  .object({ name: insurerName.optional(), names: z.array(insurerName).min(1).max(100).optional() })
  .refine((v) => v.name !== undefined || v.names !== undefined, 'กรุณากรอกชื่อบริษัทประกัน')

export const insurerUpdateSchema = z.object({ name: insurerName.optional(), isActive: z.boolean().optional() })

/** ฟิลด์ที่ไม่ใช้กับประเภทนั้นล้างเป็น null — ภาษีไม่มีบริษัทประกัน, ชั้น/หางคู่มีเฉพาะประกันรถยนต์ */
export function sanitizeCoverageFields<
  T extends { insurerId: string | null; coverageClass: string | null; pairedVehicleId: string | null },
>(type: CoverageTypeKey, fields: T): T {
  const isMotor = type === 'MOTOR_INSURANCE'
  return {
    ...fields,
    insurerId: type === 'TAX' ? null : fields.insurerId,
    coverageClass: isMotor ? fields.coverageClass : null,
    pairedVehicleId: isMotor ? fields.pairedVehicleId : null,
  }
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx tsx --test lib/renewals/__tests__/schemas.test.ts`
Expected: PASS 7 tests

- [ ] **Step 5: สร้าง `lib/renewals/http.ts`, `access.ts`, `serialize.ts`**

`lib/renewals/http.ts`:

```ts
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { firstZodError } from './schemas'

export const CLOSED_ERROR = 'งวดนี้ถูกปิดไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง'
export const DUPLICATE_PERIOD_ERROR = 'มีงวดประเภทนี้ที่หมดวันเดียวกันอยู่แล้ว'

/** error ที่ตั้งใจให้ผู้ใช้เห็น (ข้อความไทย + status) — route แปลงเป็น response ด้วย renewalErrorResponse */
export class RenewalError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (message: string) => new RenewalError(400, message)
export const notFound = (message: string) => new RenewalError(404, message)
export const conflict = (message: string) => new RenewalError(409, message)

export const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'
export const isPrismaNotFound = (error: unknown) => (error as { code?: string } | null)?.code === 'P2025'

/** อ่าน JSON body แล้ว validate — JSON เสียหรือไม่ผ่าน schema → 400 ข้อความไทย */
export async function parseJsonBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  const body: unknown = await req.json().catch(() => undefined)
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw badRequest(firstZodError(parsed.error))
  return parsed.data
}

export function renewalErrorResponse(error: unknown): NextResponse {
  if (error instanceof RenewalError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('[renewals]', error)
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
}
```

`lib/renewals/access.ts`:

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isRenewalRole } from './constants'

export interface RenewalUser {
  id: string
  role: string
}

/** ทุก route ใต้ /api/renewals เรียกก่อนทำงาน — คืน response 401/403 หรือ user */
export async function requireRenewalAccess(): Promise<{ user: RenewalUser } | { response: NextResponse }> {
  const session = await auth()
  if (!session?.user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isRenewalRole(session.user.role)) {
    return { response: NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' }, { status: 403 }) }
  }
  return { user: { id: session.user.id, role: session.user.role } }
}
```

`lib/renewals/serialize.ts`:

```ts
import type { CoverageAttachment, Insurer, Prisma, Vehicle } from '@/app/generated/prisma/client'
import type { AttachmentDto, CoverageDto, InsurerDto, VehicleDto } from '@/types/renewals'
import { dateToYmd } from './dateOnly'

export const COVERAGE_INCLUDE = {
  vehicle: { select: { id: true, plate: true, fleetNumber: true, ownerName: true, vehicleType: true, status: true } },
  insurer: { select: { id: true, name: true } },
  pairedVehicle: { select: { id: true, plate: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.VehicleCoverageInclude

export type CoverageWithRelations = Prisma.VehicleCoverageGetPayload<{ include: typeof COVERAGE_INCLUDE }>

const toNumber = (v: Prisma.Decimal | null) => (v === null ? null : Number(v))

export function toCoverageDto(r: CoverageWithRelations): CoverageDto {
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    type: r.type,
    insurerId: r.insurerId,
    insurerName: r.insurer?.name ?? null,
    coverageClass: r.coverageClass,
    policyNumber: r.policyNumber,
    startDate: r.startDate ? dateToYmd(r.startDate) : null,
    endDate: dateToYmd(r.endDate),
    amount: toNumber(r.amount),
    serviceFee: toNumber(r.serviceFee),
    pairedVehicleId: r.pairedVehicleId,
    pairedPlate: r.pairedVehicle?.plate ?? null,
    renewalStatus: r.renewalStatus,
    notRenewedReason: r.notRenewedReason,
    renewalNote: r.renewalNote,
    renewedToId: r.renewedToId,
    attachmentCount: r._count.attachments,
    vehicle: r.vehicle,
  }
}

export function toVehicleDto(v: Vehicle): VehicleDto {
  return {
    id: v.id,
    plate: v.plate,
    fleetNumber: v.fleetNumber,
    ownerName: v.ownerName,
    vehicleType: v.vehicleType,
    status: v.status,
    brand: v.brand,
    chassisNumber: v.chassisNumber,
    fuelType: v.fuelType,
    weightKg: v.weightKg,
    statusDate: v.statusDate ? dateToYmd(v.statusDate) : null,
    note: v.note,
  }
}

export function toInsurerDto(i: Insurer): InsurerDto {
  return { id: i.id, name: i.name, isActive: i.isActive }
}

export function toAttachmentDto(a: CoverageAttachment): AttachmentDto {
  return {
    id: a.id,
    coverageId: a.coverageId,
    fileName: a.fileName,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
  }
}
```

- [ ] **Step 6: API บริษัทประกัน**

`app/api/renewals/insurers/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { conflict, isUniqueViolation, parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { insurerCreateSchema } from '@/lib/renewals/schemas'
import { toInsurerDto } from '@/lib/renewals/serialize'

const DUPLICATE_INSURER_ERROR = 'มีบริษัทประกันชื่อนี้อยู่แล้ว'

export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const rows = await prisma.insurer.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] })
  return NextResponse.json(rows.map(toInsurerDto))
}

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const input = await parseJsonBody(req, insurerCreateSchema)
    if (input.names) {
      // ชื่อที่มีอยู่แล้วข้ามไป (ใช้จากหน้า import)
      const result = await prisma.insurer.createMany({
        data: [...new Set(input.names)].map((name) => ({ name })),
        skipDuplicates: true,
      })
      return NextResponse.json({ created: result.count }, { status: 201 })
    }
    const row = await prisma.insurer.create({ data: { name: input.name! } })
    return NextResponse.json(toInsurerDto(row), { status: 201 })
  } catch (error) {
    if (isUniqueViolation(error)) return renewalErrorResponse(conflict(DUPLICATE_INSURER_ERROR))
    return renewalErrorResponse(error)
  }
}
```

`app/api/renewals/insurers/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import {
  conflict,
  isPrismaNotFound,
  isUniqueViolation,
  notFound,
  parseJsonBody,
  renewalErrorResponse,
} from '@/lib/renewals/http'
import { insurerUpdateSchema } from '@/lib/renewals/schemas'
import { toInsurerDto } from '@/lib/renewals/serialize'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const data = await parseJsonBody(req, insurerUpdateSchema)
    const row = await prisma.insurer.update({ where: { id }, data })
    return NextResponse.json(toInsurerDto(row))
  } catch (error) {
    if (isUniqueViolation(error)) return renewalErrorResponse(conflict('มีบริษัทประกันชื่อนี้อยู่แล้ว'))
    if (isPrismaNotFound(error)) return renewalErrorResponse(notFound('ไม่พบบริษัทประกัน'))
    return renewalErrorResponse(error)
  }
}
```

- [ ] **Step 7: client helper + หน้าจัดการบริษัทประกัน**

`components/renewals/api.ts`:

```ts
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  const json: unknown = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: json as T }
  return { ok: false, error: (json as { error?: string }).error || 'เกิดข้อผิดพลาด' }
}

export async function getJson<T>(url: string): Promise<ApiResult<T>> {
  try {
    return await toResult<T>(await fetch(url))
  } catch {
    return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }
  }
}

export async function sendJson<T = unknown>(
  url: string,
  body?: unknown,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return await toResult<T>(res)
  } catch {
    return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }
  }
}
```

`components/renewals/InsurerManager.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { App, Button, Form, Input, Modal, Space, Table, Tag } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import type { InsurerDto } from '@/types/renewals'
import { getJson, sendJson } from './api'

export default function InsurerManager() {
  const { message, modal } = App.useApp()
  const [rows, setRows] = useState<InsurerDto[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<InsurerDto | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string }>()

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await getJson<InsurerDto[]>('/api/renewals/insurers')
    if (res.ok) setRows(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [message])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const handleSave = async () => {
    const { name } = await form.validateFields()
    setSaving(true)
    const res =
      editing === 'new'
        ? await sendJson('/api/renewals/insurers', { name })
        : await sendJson(`/api/renewals/insurers/${(editing as InsurerDto).id}`, { name }, 'PATCH')
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกสำเร็จ')
    setEditing(null)
    fetchRows()
  }

  const toggleActive = (row: InsurerDto) => {
    modal.confirm({
      title: row.isActive ? 'ปิดใช้งานบริษัทประกัน' : 'เปิดใช้งานบริษัทประกัน',
      content: row.isActive ? `${row.name} จะไม่แสดงในตัวเลือก (งวดเดิมยังอ้างถึงได้)` : row.name,
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: async () => {
        const res = await sendJson(`/api/renewals/insurers/${row.id}`, { isActive: !row.isActive }, 'PATCH')
        if (res.ok) {
          message.success('บันทึกสำเร็จ')
          fetchRows()
        } else {
          message.error(res.error)
        }
      },
    })
  }

  const columns = [
    { title: 'ชื่อบริษัทประกัน', dataIndex: 'name', key: 'name' },
    {
      title: 'สถานะ',
      key: 'isActive',
      width: 120,
      render: (_: unknown, r: InsurerDto) =>
        r.isActive ? <Tag color="green">ใช้งาน</Tag> : <Tag>ปิดใช้งาน</Tag>,
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 180,
      render: (_: unknown, r: InsurerDto) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(r)
              form.setFieldsValue({ name: r.name })
            }}
            data-testid={`insurer-edit-btn-${r.id}`}
          />
          <Button type="link" size="small" danger={r.isActive} onClick={() => toggleActive(r)}>
            {r.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>บริษัทประกัน</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing('new')
            form.setFieldsValue({ name: '' })
          }}
          data-testid="insurer-add-btn"
        >
          เพิ่ม
        </Button>
      </div>
      <Table size="small" rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={false} />
      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'เพิ่มบริษัทประกัน' : 'แก้ไขบริษัทประกัน'}
        okText="บันทึก"
        cancelText="ยกเลิก"
        confirmLoading={saving}
        onOk={handleSave}
        onCancel={() => setEditing(null)}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="ชื่อ" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อ' }]}>
            <Input data-testid="insurer-name-input" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
```

`app/(protected)/renewals/insurers/page.tsx`:

```tsx
import InsurerManager from '@/components/renewals/InsurerManager'

export default function InsurersPage() {
  return <InsurerManager />
}
```

- [ ] **Step 8: cleanup script + helper + e2e**

`e2e/scripts/cleanup-renewals.ts`:

```ts
import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// local Postgres (docker) ไม่รองรับ SSL — เปิดเฉพาะตอนต่อ DB บนคลาวด์
const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const vehicles = await prisma.vehicle.findMany({ where: { plate: { startsWith: 'E2E' } }, select: { id: true } })
  const ids = vehicles.map((v) => v.id)
  // ไฟล์แนบลบตาม cascade ของงวด
  await prisma.vehicleCoverage.deleteMany({
    where: { OR: [{ vehicleId: { in: ids } }, { pairedVehicleId: { in: ids } }] },
  })
  await prisma.vehicle.deleteMany({ where: { id: { in: ids } } })
  await prisma.insurer.deleteMany({ where: { name: { startsWith: 'E2E' } } })
  fs.rmSync(path.resolve(__dirname, '../../.tmp/renewal-attachments'), { recursive: true, force: true })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

`e2e/renewals/helpers.ts` — แทนที่ทั้งไฟล์ด้วย:

```ts
import { expect, type APIResponse, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'

export async function login(page: Page, username: string, landing: RegExp) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(landing, { timeout: 10_000 })
}

export function cleanupRenewals() {
  execSync('npx tsx e2e/scripts/cleanup-renewals.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

export async function expectJson<T>(res: APIResponse): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`)
  return (await res.json()) as T
}

export async function createInsurer(page: Page, name: string): Promise<string> {
  return (await expectJson<{ id: string }>(await page.request.post('/api/renewals/insurers', { data: { name } }))).id
}
```

`e2e/renewals/insurers.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { cleanupRenewals, expectJson, login } from './helpers'

test.describe.serial('บริษัทประกัน', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())

  test('เพิ่มผ่านหน้าจอ → แสดงในตาราง; ชื่อซ้ำ → 409; ปิดใช้งาน → tag ปิดใช้งาน', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    await page.goto('/renewals/insurers')

    await page.getByTestId('insurer-add-btn').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('insurer-name-input').fill('E2E ประกันภัย A')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    const row = page.getByRole('row', { name: /E2E ประกันภัย A/ })
    await expect(row.locator('.ant-tag')).toHaveText('ใช้งาน')

    const dup = await page.request.post('/api/renewals/insurers', { data: { name: ' E2E ประกันภัย A ' } })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('มีบริษัทประกันชื่อนี้อยู่แล้ว')

    await row.getByRole('button', { name: 'ปิดใช้งาน' }).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(row.locator('.ant-tag')).toHaveText('ปิดใช้งาน')
  })

  test('เพิ่มหลายชื่อ (names) ข้ามชื่อที่มีอยู่แล้ว', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const res = await page.request.post('/api/renewals/insurers', {
      data: { names: ['E2E ประกันภัย A', 'E2E ประกันภัย B', 'E2E ประกันภัย B'] },
    })
    expect(await expectJson<{ created: number }>(res)).toEqual({ created: 1 })
  })
})
```

- [ ] **Step 9: รันทดสอบ**

Run: `npx tsx --test lib/renewals/__tests__/*.test.ts` → PASS
Run: `npx playwright test e2e/renewals/insurers.spec.ts --workers=1` → PASS 2 tests
Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

- [ ] **Step 10: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/renewals/access.ts lib/renewals/http.ts lib/renewals/schemas.ts lib/renewals/serialize.ts lib/renewals/__tests__/schemas.test.ts app/api/renewals/insurers components/renewals/api.ts components/renewals/InsurerManager.tsx "app/(protected)/renewals/insurers" e2e/scripts/cleanup-renewals.ts e2e/renewals/helpers.ts e2e/renewals/insurers.spec.ts
git commit -m "$(cat <<'EOF'
feat(renewals): พื้นฐาน API (สิทธิ์/schema/DTO) และหน้าจัดการบริษัทประกัน

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: ที่เก็บไฟล์แนบ (S3 private / local) + กติกาไฟล์

**Files:**
- Create: `lib/renewals/attachmentRules.ts`, `lib/renewals/storage.ts`
- Test: `lib/renewals/__tests__/attachmentRules.test.ts`, `lib/renewals/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `todayInBangkok` (Task 2), `spacesClient`/`SPACES_BUCKET` จาก `lib/spaces.ts` (โหลดแบบ lazy)
- Produces:
  - `MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024`, `MAX_FILES_PER_UPLOAD = 10`, `type AttachmentExt = 'pdf' | 'jpg' | 'png'`
  - `validateAttachment(fileName: string, mime: string, size: number): { ext: AttachmentExt } | { error: string }`
  - `buildAttachmentKey(now: Date, uuid: string, ext: AttachmentExt): string` → `vehicle-coverages/YYYY-MM/<uuid>.<ext>`
  - `inlineContentDisposition(fileName: string): string`
  - `interface AttachmentStorage { put(key, body: Uint8Array, contentType): Promise<void>; get(key): Promise<Uint8Array | null>; remove(key): Promise<void> }`
  - `createLocalStorage(rootDir: string): AttachmentStorage`, `getAttachmentStorage(): AttachmentStorage`, `removeObjectsBestEffort(keys: string[]): Promise<void>`

- [ ] **Step 1: เขียน test ที่ fail**

`lib/renewals/__tests__/attachmentRules.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ATTACHMENT_BYTES, buildAttachmentKey, inlineContentDisposition, validateAttachment } from '../attachmentRules'

test('validateAttachment: รับ PDF/JPG/PNG (นามสกุลตัวใหญ่ได้, jpeg → jpg)', () => {
  assert.deepEqual(validateAttachment('policy.pdf', 'application/pdf', 1000), { ext: 'pdf' })
  assert.deepEqual(validateAttachment('ป้ายภาษี.JPEG', 'image/jpeg', 1000), { ext: 'jpg' })
  assert.deepEqual(validateAttachment('scan.png', 'image/png', MAX_ATTACHMENT_BYTES), { ext: 'png' })
})

test('validateAttachment: ปฏิเสธนามสกุลอื่น / MIME ไม่ตรง / ไฟล์ว่าง / เกิน 10 MB', () => {
  assert.deepEqual(validateAttachment('virus.exe', 'application/octet-stream', 10), {
    error: 'virus.exe: รองรับเฉพาะไฟล์ PDF, JPG, PNG',
  })
  assert.deepEqual(validateAttachment('fake.png', 'image/jpeg', 10), { error: 'fake.png: ชนิดไฟล์ไม่ตรงกับนามสกุล' })
  assert.deepEqual(validateAttachment('empty.pdf', 'application/pdf', 0), { error: 'empty.pdf: ไฟล์ว่าง' })
  assert.deepEqual(validateAttachment('big.pdf', 'application/pdf', MAX_ATTACHMENT_BYTES + 1), {
    error: 'big.pdf: ไฟล์ต้องไม่เกิน 10 MB',
  })
})

test('buildAttachmentKey ใช้เดือนตามเวลาไทย', () => {
  // 31 ต.ค. 18:00 UTC = 1 พ.ย. 01:00 เวลาไทย
  assert.equal(
    buildAttachmentKey(new Date('2026-10-31T18:00:00Z'), 'abc', 'pdf'),
    'vehicle-coverages/2026-11/abc.pdf',
  )
})

test('inlineContentDisposition: ชื่อไทยไม่ทำ header พัง (ASCII ล้วน + filename*)', () => {
  const header = inlineContentDisposition("กรมธรรม์ (2569)'s.pdf")
  assert.match(header, /^[\x20-\x7e]+$/)
  assert.ok(header.startsWith('inline; filename="'))
  assert.ok(header.includes("filename*=UTF-8''%E0%B8%81"))
  assert.ok(header.includes('%28') && header.includes('%27'))
})
```

`lib/renewals/__tests__/storage.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { createLocalStorage } from '../storage'

test('local storage: put → get → remove → get คืน null', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'renewal-att-'))
  try {
    const storage = createLocalStorage(dir)
    const key = 'vehicle-coverages/2026-10/a.png'
    await storage.put(key, new Uint8Array([1, 2, 3]), 'image/png')
    assert.deepEqual(await storage.get(key), new Uint8Array([1, 2, 3]))
    await storage.remove(key)
    assert.equal(await storage.get(key), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('local storage: key ที่หลุดออกนอกโฟลเดอร์ → throw', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'renewal-att-'))
  try {
    await assert.rejects(createLocalStorage(dir).put('../evil.png', new Uint8Array([1]), 'image/png'), /invalid key/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/renewals/__tests__/attachmentRules.test.ts lib/renewals/__tests__/storage.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: สร้างไฟล์**

`lib/renewals/attachmentRules.ts`:

```ts
import { todayInBangkok } from './dateOnly'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_FILES_PER_UPLOAD = 10

export type AttachmentExt = 'pdf' | 'jpg' | 'png'

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** ตรวจทั้งนามสกุลและ MIME — ข้อความ error ขึ้นต้นด้วยชื่อไฟล์เพื่อให้รู้ว่าไฟล์ไหน */
export function validateAttachment(
  fileName: string,
  mime: string,
  size: number,
): { ext: AttachmentExt } | { error: string } {
  const dot = fileName.lastIndexOf('.')
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  const expected = EXT_TO_MIME[ext]
  if (!expected) return { error: `${fileName}: รองรับเฉพาะไฟล์ PDF, JPG, PNG` }
  if (mime !== expected) return { error: `${fileName}: ชนิดไฟล์ไม่ตรงกับนามสกุล` }
  if (size <= 0) return { error: `${fileName}: ไฟล์ว่าง` }
  if (size > MAX_ATTACHMENT_BYTES) return { error: `${fileName}: ไฟล์ต้องไม่เกิน 10 MB` }
  return { ext: ext === 'jpeg' ? 'jpg' : (ext as AttachmentExt) }
}

export function buildAttachmentKey(now: Date, uuid: string, ext: AttachmentExt): string {
  return `vehicle-coverages/${todayInBangkok(now).slice(0, 7)}/${uuid}.${ext}`
}

/** RFC 5987: encodeURIComponent ไม่ encode ' ( ) * ซึ่งใช้ใน filename* ไม่ได้ */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** header แบบ inline ที่ชื่อไฟล์ภาษาไทยไม่ทำ header พัง — filename= เป็น ASCII ล้วน, ชื่อจริงอยู่ใน filename* */
export function inlineContentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(fileName)}`
}
```

`lib/renewals/storage.ts`:

```ts
import { promises as fs } from 'fs'
import path from 'path'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

export interface AttachmentStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  remove(key: string): Promise<void>
}

/** เก็บไฟล์ในโฟลเดอร์บนเครื่อง — ใช้ตอน E2E (ATTACHMENT_STORAGE=local) ไม่ให้เทสต์เขียนลง bucket จริง */
export function createLocalStorage(rootDir: string): AttachmentStorage {
  const root = path.resolve(rootDir)
  const fileOf = (key: string) => {
    const file = path.resolve(root, key)
    if (!file.startsWith(root + path.sep)) throw new Error(`invalid key: ${key}`)
    return file
  }
  return {
    async put(key, body) {
      const file = fileOf(key)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, body)
    },
    async get(key) {
      try {
        return new Uint8Array(await fs.readFile(fileOf(key)))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    async remove(key) {
      await fs.rm(fileOf(key), { force: true })
    },
  }
}

// โหลด lib/spaces แบบ lazy — ไม่ต้องมี env ของ Spaces ตอนรัน unit test / local storage
async function spaces() {
  return import('@/lib/spaces')
}

/** DigitalOcean Spaces แบบ private — ไม่ใส่ ACL (ต่างจากรูป LINE ที่เป็น public-read) */
const s3Storage: AttachmentStorage = {
  async put(key, body, contentType) {
    const { spacesClient, SPACES_BUCKET } = await spaces()
    await spacesClient.send(new PutObjectCommand({ Bucket: SPACES_BUCKET, Key: key, Body: body, ContentType: contentType }))
  },
  async get(key) {
    const { spacesClient, SPACES_BUCKET } = await spaces()
    try {
      const res = await spacesClient.send(new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: key }))
      return res.Body ? await res.Body.transformToByteArray() : null
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null
      throw error
    }
  },
  async remove(key) {
    const { spacesClient, SPACES_BUCKET } = await spaces()
    await spacesClient.send(new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: key }))
  },
}

export function getAttachmentStorage(): AttachmentStorage {
  if (process.env.ATTACHMENT_STORAGE === 'local') {
    return createLocalStorage(path.join(process.cwd(), '.tmp', 'renewal-attachments'))
  }
  return s3Storage
}

/** ลบไฟล์แบบ best-effort — ไฟล์ค้างใน bucket ไม่ทำให้ระบบพัง จึงแค่ log */
export async function removeObjectsBestEffort(keys: string[]): Promise<void> {
  const storage = getAttachmentStorage()
  for (const key of keys) {
    try {
      await storage.remove(key)
    } catch (error) {
      console.error('[renewals] ลบไฟล์แนบไม่สำเร็จ', key, error)
    }
  }
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx tsx --test lib/renewals/__tests__/attachmentRules.test.ts lib/renewals/__tests__/storage.test.ts`
Expected: PASS 6 tests

- [ ] **Step 5: เช็ก type + Commit**

Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/renewals/attachmentRules.ts lib/renewals/storage.ts lib/renewals/__tests__/attachmentRules.test.ts lib/renewals/__tests__/storage.test.ts
git commit -m "$(cat <<'EOF'
feat(renewals): ที่เก็บไฟล์แนบแบบ private (Spaces/local) และกติกาชนิด/ขนาดไฟล์

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: API รถ + เพิ่ม/แก้/ลบงวด + กติกาปิดงวดอัตโนมัติ

**Files:**
- Create: `lib/renewals/autoClose.ts`, `lib/renewals/__tests__/autoClose.test.ts`
- Create: `lib/renewals/coverageService.ts`, `lib/renewals/vehicleService.ts`
- Create: `app/api/renewals/vehicles/route.ts`, `app/api/renewals/vehicles/[id]/route.ts`
- Create: `app/api/renewals/coverages/route.ts`, `app/api/renewals/coverages/[id]/route.ts`
- Modify: `e2e/renewals/helpers.ts`
- Create: `e2e/renewals/vehicles-api.spec.ts`

**Interfaces:**
- Consumes: Task 1–5
- Produces:
  - `planAutoClose(rows: AutoCloseRow[]): AutoCloseAction[]` โดย `AutoCloseRow = { id: string; endDate: string; renewalStatus: RenewalStatusKey; renewedToId: string | null }`, `AutoCloseAction = { id: string; linkToId: string | null }`
  - `coverageService.ts`: `type Tx = Prisma.TransactionClient`, `type PeriodData`, `enforceCoverageRules(tx, vehicleIds: string[], userId: string): Promise<number>`, `createCoverage(input: CoverageCreateInput, userId): Promise<string>`, `updateCoverage(id, input: CoverageFields, userId): Promise<void>`, `deleteCoverage(id, userId): Promise<string[]>` (คืน fileKey)
  - `vehicleService.ts`: `createVehicle(input: VehicleInput): Promise<Vehicle>`, `updateVehicle(id, input, userId): Promise<Vehicle>`, `deleteVehicle(id): Promise<void>`
  - API: `GET/POST /api/renewals/vehicles`, `GET/PATCH/DELETE /api/renewals/vehicles/[id]`, `POST /api/renewals/coverages` (→ `{ id }`), `PATCH/DELETE /api/renewals/coverages/[id]`
  - e2e helpers: `createVehicle(page, plate, extra?)`, `createCoverage(page, vehicleId, type, endDate, extra?)`, `getVehicleDetail(page, vehicleId)`

- [ ] **Step 1: เขียน test ที่ fail**

`lib/renewals/__tests__/autoClose.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planAutoClose, type AutoCloseRow } from '../autoClose'

const row = (id: string, endDate: string, renewalStatus: AutoCloseRow['renewalStatus'] = 'PENDING', renewedToId: string | null = null): AutoCloseRow => ({
  id,
  endDate,
  renewalStatus,
  renewedToId,
})

test('งวดเดียว → ไม่ปิดอะไร', () => {
  assert.deepEqual(planAutoClose([row('a', '2026-03-31')]), [])
})

test('งวดเปิดที่เก่ากว่า → ปิดและผูกกับงวดถัดไป (ไม่ขึ้นกับลำดับ input)', () => {
  assert.deepEqual(planAutoClose([row('new', '2027-03-31'), row('old', '2026-03-31', 'IN_PROGRESS')]), [
    { id: 'old', linkToId: 'new' },
  ])
})

test('สามงวดเปิด → ผูกเป็นสาย a→b→c', () => {
  assert.deepEqual(planAutoClose([row('a', '2025-03-31'), row('b', '2026-03-31'), row('c', '2027-03-31')]), [
    { id: 'a', linkToId: 'b' },
    { id: 'b', linkToId: 'c' },
  ])
})

test('งวดถัดไปมีงวดก่อนหน้าชี้อยู่แล้ว → ปิดโดยไม่ผูก (renewedToId ต้อง unique)', () => {
  const rows = [row('x', '2025-03-31', 'RENEWED', 'new'), row('old', '2026-03-31'), row('new', '2027-03-31')]
  assert.deepEqual(planAutoClose(rows), [{ id: 'old', linkToId: null }])
})

test('งวดที่ปิดแล้ว (ไม่ต่อ/ต่อแล้ว) ไม่แตะ', () => {
  assert.deepEqual(planAutoClose([row('old', '2026-03-31', 'NOT_RENEWED'), row('new', '2027-03-31')]), [])
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/renewals/__tests__/autoClose.test.ts`
Expected: FAIL — `Cannot find module '../autoClose'`

- [ ] **Step 3: สร้าง `lib/renewals/autoClose.ts`**

```ts
import { isOpenStatus, type RenewalStatusKey } from './constants'

export interface AutoCloseRow {
  id: string
  endDate: string
  renewalStatus: RenewalStatusKey
  renewedToId: string | null
}

export interface AutoCloseAction {
  id: string
  linkToId: string | null
}

/**
 * รถ 1 คัน 1 ประเภท (rows ต้องเป็นกลุ่มเดียวกัน): งวดเปิดได้เฉพาะงวดที่ endDate มากที่สุด
 * งวดเปิดที่เก่ากว่า → ปิดเป็น RENEWED และผูกกับงวดถัดไป ถ้างวดนั้นยังไม่มีงวดก่อนหน้าชี้อยู่
 */
export function planAutoClose(rows: AutoCloseRow[]): AutoCloseAction[] {
  const sorted = [...rows].sort((a, b) => a.endDate.localeCompare(b.endDate))
  const taken = new Set(rows.map((r) => r.renewedToId).filter((id): id is string => id !== null))
  const actions: AutoCloseAction[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]
    if (!isOpenStatus(current.renewalStatus)) continue
    const next = sorted[i + 1]
    const linkToId = taken.has(next.id) ? null : next.id
    if (linkToId) taken.add(linkToId)
    actions.push({ id: current.id, linkToId })
  }
  return actions
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx tsx --test lib/renewals/__tests__/autoClose.test.ts`
Expected: PASS 5 tests

- [ ] **Step 5: สร้าง `lib/renewals/coverageService.ts`**

```ts
import type { Prisma } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { planAutoClose, type AutoCloseRow } from './autoClose'
import { OPEN_STATUSES } from './constants'
import { dateToYmd, ymdToDate } from './dateOnly'
import { DUPLICATE_PERIOD_ERROR, badRequest, conflict, isUniqueViolation, notFound } from './http'
import { sanitizeCoverageFields, type CoverageCreateInput, type CoverageFields } from './schemas'

export type Tx = Prisma.TransactionClient

/** ข้อมูลงวดที่บันทึกลง DB (CoverageFields ใช้ได้ตรงๆ; coverageClass จาก DB เป็น string) */
export type PeriodData = {
  insurerId: string | null
  coverageClass: string | null
  policyNumber: string | null
  startDate: string | null
  endDate: string
  amount: number | null
  serviceFee: number | null
  pairedVehicleId: string | null
  renewalNote: string | null
}

export const OPEN_FILTER = { in: [...OPEN_STATUSES] }

export function coverageData(f: PeriodData) {
  return {
    insurerId: f.insurerId,
    coverageClass: f.coverageClass,
    policyNumber: f.policyNumber,
    startDate: f.startDate ? ymdToDate(f.startDate) : null,
    endDate: ymdToDate(f.endDate),
    amount: f.amount,
    serviceFee: f.serviceFee,
    pairedVehicleId: f.pairedVehicleId,
    renewalNote: f.renewalNote,
  }
}

export async function assertReferences(tx: Tx, f: PeriodData, vehicleId: string): Promise<void> {
  if (f.insurerId && !(await tx.insurer.findUnique({ where: { id: f.insurerId }, select: { id: true } }))) {
    throw badRequest('ไม่พบบริษัทประกัน')
  }
  if (f.pairedVehicleId) {
    if (f.pairedVehicleId === vehicleId) throw badRequest('หางคู่ต้องเป็นรถคนละคัน')
    if (!(await tx.vehicle.findUnique({ where: { id: f.pairedVehicleId }, select: { id: true } }))) {
      throw badRequest('ไม่พบรถหางคู่')
    }
  }
}

/** P2002 จาก unique (vehicleId, type, endDate) → 409 ข้อความไทย */
export async function withDuplicateGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_PERIOD_ERROR)
    throw error
  }
}

/**
 * บังคับกติกางวดของรถที่ระบุ — เรียกทุกครั้งหลังแก้รถ/งวด (รวม import)
 * - รถสถานะขาย: ไม่มีงวดเปิด → ปิดเป็น ไม่ต่อ/ขายรถ
 * - รถอื่น: 1 คัน 1 ประเภท เปิดได้เฉพาะงวดที่หมดช้าสุด (planAutoClose)
 * คืนจำนวนงวดที่ถูกปิด
 */
export async function enforceCoverageRules(tx: Tx, vehicleIds: string[], userId: string): Promise<number> {
  const ids = [...new Set(vehicleIds)]
  if (ids.length === 0) return 0
  const now = new Date()
  let closed = 0

  const soldIds = (
    await tx.vehicle.findMany({ where: { id: { in: ids }, status: 'SOLD' }, select: { id: true } })
  ).map((v) => v.id)
  if (soldIds.length > 0) {
    const res = await tx.vehicleCoverage.updateMany({
      where: { vehicleId: { in: soldIds }, renewalStatus: OPEN_FILTER },
      data: { renewalStatus: 'NOT_RENEWED', notRenewedReason: 'SOLD', statusUpdatedAt: now, statusUpdatedById: userId },
    })
    closed += res.count
  }

  const otherIds = ids.filter((id) => !soldIds.includes(id))
  if (otherIds.length === 0) return closed
  const rows = await tx.vehicleCoverage.findMany({
    where: { vehicleId: { in: otherIds } },
    select: { id: true, vehicleId: true, type: true, endDate: true, renewalStatus: true, renewedToId: true },
  })
  const groups = new Map<string, AutoCloseRow[]>()
  for (const r of rows) {
    const key = `${r.vehicleId}|${r.type}`
    const item = { id: r.id, endDate: dateToYmd(r.endDate), renewalStatus: r.renewalStatus, renewedToId: r.renewedToId }
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  for (const group of groups.values()) {
    for (const action of planAutoClose(group)) {
      await tx.vehicleCoverage.update({
        where: { id: action.id },
        data: {
          renewalStatus: 'RENEWED',
          notRenewedReason: null,
          renewedToId: action.linkToId,
          statusUpdatedAt: now,
          statusUpdatedById: userId,
        },
      })
      closed++
    }
  }
  return closed
}

export async function createCoverage(input: CoverageCreateInput, userId: string): Promise<string> {
  const { vehicleId, type, ...rest } = input
  const fields = sanitizeCoverageFields(type, rest)
  return withDuplicateGuard(() =>
    prisma.$transaction(async (tx) => {
      if (!(await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } }))) throw notFound('ไม่พบรถ')
      await assertReferences(tx, fields, vehicleId)
      const created = await tx.vehicleCoverage.create({
        data: { vehicleId, type, ...coverageData(fields), createdById: userId },
      })
      await enforceCoverageRules(tx, [vehicleId], userId)
      return created.id
    }),
  )
}

/** แก้ข้อมูลงวด (ไม่รวมสถานะการต่อ — ใช้ endpoint เฉพาะ) */
export async function updateCoverage(id: string, input: CoverageFields, userId: string): Promise<void> {
  await withDuplicateGuard(() =>
    prisma.$transaction(async (tx) => {
      const row = await tx.vehicleCoverage.findUnique({ where: { id }, select: { vehicleId: true, type: true } })
      if (!row) throw notFound('ไม่พบงวด')
      const fields = sanitizeCoverageFields(row.type, input)
      await assertReferences(tx, fields, row.vehicleId)
      await tx.vehicleCoverage.update({ where: { id }, data: coverageData(fields) })
      await enforceCoverageRules(tx, [row.vehicleId], userId)
    }),
  )
}

/**
 * ลบงวด — งวดก่อนหน้าที่ต่อมาเป็นงวดนี้กลับเป็นรอต่อ (กรณีกด "ต่อแล้ว" ผิด)
 * คืน fileKey ของไฟล์แนบ ให้ caller ลบใน storage หลัง transaction สำเร็จ
 */
export async function deleteCoverage(id: string, userId: string): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.vehicleCoverage.findUnique({
      where: { id },
      select: { vehicleId: true, attachments: { select: { fileKey: true } } },
    })
    if (!row) throw notFound('ไม่พบงวด')
    await tx.vehicleCoverage.updateMany({
      where: { renewedToId: id },
      data: {
        renewalStatus: 'PENDING',
        renewedToId: null,
        notRenewedReason: null,
        statusUpdatedAt: new Date(),
        statusUpdatedById: userId,
      },
    })
    await tx.vehicleCoverage.delete({ where: { id } })
    await enforceCoverageRules(tx, [row.vehicleId], userId)
    return row.attachments.map((a) => a.fileKey)
  })
}
```

- [ ] **Step 6: สร้าง `lib/renewals/vehicleService.ts`**

```ts
import type { Vehicle } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { enforceCoverageRules } from './coverageService'
import { ymdToDate } from './dateOnly'
import { conflict, isPrismaNotFound, isUniqueViolation, notFound } from './http'
import type { VehicleInput } from './schemas'

const DUPLICATE_PLATE_ERROR = 'ทะเบียนนี้มีอยู่แล้ว'

function vehicleData(input: VehicleInput) {
  return { ...input, statusDate: input.statusDate ? ymdToDate(input.statusDate) : null }
}

async function withPlateGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_PLATE_ERROR)
    throw error
  }
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  return withPlateGuard(() => prisma.vehicle.create({ data: vehicleData(input) }))
}

/** เปลี่ยนเป็น "ขาย" → enforceCoverageRules ปิดงวดเปิดเป็น ไม่ต่อ/ขายรถ ใน transaction เดียวกัน */
export async function updateVehicle(id: string, input: VehicleInput, userId: string): Promise<Vehicle> {
  return withPlateGuard(() =>
    prisma.$transaction(async (tx) => {
      if (!(await tx.vehicle.findUnique({ where: { id }, select: { id: true } }))) throw notFound('ไม่พบรถ')
      const updated = await tx.vehicle.update({ where: { id }, data: vehicleData(input) })
      await enforceCoverageRules(tx, [id], userId)
      return updated
    }),
  )
}

export async function deleteVehicle(id: string): Promise<void> {
  const used = await prisma.vehicleCoverage.count({ where: { OR: [{ vehicleId: id }, { pairedVehicleId: id }] } })
  if (used > 0) throw conflict('ลบไม่ได้ เพราะรถคันนี้มีงวดอยู่ — เปลี่ยนสถานะรถแทน')
  try {
    await prisma.vehicle.delete({ where: { id } })
  } catch (error) {
    if (isPrismaNotFound(error)) throw notFound('ไม่พบรถ')
    throw error
  }
}
```

- [ ] **Step 7: API รถ**

`app/api/renewals/vehicles/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import type { CoverageTypeKey } from '@/lib/renewals/constants'
import { dateToYmd } from '@/lib/renewals/dateOnly'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { vehicleInputSchema } from '@/lib/renewals/schemas'
import { toVehicleDto } from '@/lib/renewals/serialize'
import { createVehicle } from '@/lib/renewals/vehicleService'
import type { VehicleListItemDto } from '@/types/renewals'

export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const [vehicles, latest] = await Promise.all([
    prisma.vehicle.findMany({ orderBy: [{ ownerName: 'asc' }, { plate: 'asc' }] }),
    prisma.vehicleCoverage.groupBy({ by: ['vehicleId', 'type'], _max: { endDate: true } }),
  ])
  const latestByVehicle = new Map<string, Partial<Record<CoverageTypeKey, string>>>()
  for (const g of latest) {
    if (!g._max.endDate) continue
    latestByVehicle.set(g.vehicleId, { ...latestByVehicle.get(g.vehicleId), [g.type]: dateToYmd(g._max.endDate) })
  }
  const body: VehicleListItemDto[] = vehicles.map((v) => ({
    ...toVehicleDto(v),
    latestEndDates: latestByVehicle.get(v.id) ?? {},
  }))
  return NextResponse.json(body)
}

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const vehicle = await createVehicle(await parseJsonBody(req, vehicleInputSchema))
    return NextResponse.json(toVehicleDto(vehicle), { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

`app/api/renewals/vehicles/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { vehicleInputSchema } from '@/lib/renewals/schemas'
import { COVERAGE_INCLUDE, toCoverageDto, toVehicleDto } from '@/lib/renewals/serialize'
import { deleteVehicle, updateVehicle } from '@/lib/renewals/vehicleService'
import type { VehicleDetailResponse } from '@/types/renewals'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { coverages: { include: COVERAGE_INCLUDE, orderBy: [{ type: 'asc' }, { endDate: 'desc' }] } },
  })
  if (!vehicle) return NextResponse.json({ error: 'ไม่พบรถ' }, { status: 404 })
  const { coverages, ...rest } = vehicle
  const body: VehicleDetailResponse = { vehicle: toVehicleDto(rest), coverages: coverages.map(toCoverageDto) }
  return NextResponse.json(body)
}

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const vehicle = await updateVehicle(id, await parseJsonBody(req, vehicleInputSchema), access.user.id)
    return NextResponse.json(toVehicleDto(vehicle))
  } catch (error) {
    return renewalErrorResponse(error)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    await deleteVehicle(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

- [ ] **Step 8: API งวด**

`app/api/renewals/coverages/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { createCoverage } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { coverageCreateSchema } from '@/lib/renewals/schemas'

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const id = await createCoverage(await parseJsonBody(req, coverageCreateSchema), access.user.id)
    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

`app/api/renewals/coverages/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { deleteCoverage, updateCoverage } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { coverageFieldsSchema } from '@/lib/renewals/schemas'
import { removeObjectsBestEffort } from '@/lib/renewals/storage'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    await updateCoverage(id, await parseJsonBody(req, coverageFieldsSchema), access.user.id)
    return NextResponse.json({ id })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const fileKeys = await deleteCoverage(id, access.user.id)
    await removeObjectsBestEffort(fileKeys)
    return NextResponse.json({ success: true })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

- [ ] **Step 9: e2e helper + spec**

`e2e/renewals/helpers.ts` — เพิ่ม 2 บรรทัดนี้ต่อจาก import เดิมด้านบนไฟล์:

```ts
import type { CoverageTypeKey } from '../../lib/renewals/constants'
import type { VehicleDetailResponse } from '../../types/renewals'
```

และต่อท้ายไฟล์:

```ts
export async function createVehicle(page: Page, plate: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await page.request.post('/api/renewals/vehicles', {
    data: { plate, ownerName: 'E2E บริษัท', vehicleType: 'ลากจูง', ...extra },
  })
  return (await expectJson<{ id: string }>(res)).id
}

export async function createCoverage(
  page: Page,
  vehicleId: string,
  type: CoverageTypeKey,
  endDate: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await page.request.post('/api/renewals/coverages', { data: { vehicleId, type, endDate, ...extra } })
  return (await expectJson<{ id: string }>(res)).id
}

export async function getVehicleDetail(page: Page, vehicleId: string): Promise<VehicleDetailResponse> {
  return expectJson<VehicleDetailResponse>(await page.request.get(`/api/renewals/vehicles/${vehicleId}`))
}
```

`e2e/renewals/vehicles-api.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { cleanupRenewals, createCoverage, createInsurer, createVehicle, getVehicleDetail, login } from './helpers'

test.describe.serial('API รถและงวด', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('ทะเบียน normalize และกันซ้ำแม้พิมพ์ต่างรูปแบบ', async ({ page }) => {
    const res = await page.request.post('/api/renewals/vehicles', {
      data: { plate: ' E2E-1001  กท. ', ownerName: 'E2E บริษัท', vehicleType: 'ลากจูง' },
    })
    expect(res.status()).toBe(201)
    expect((await res.json()).plate).toBe('E2E-1001 กท')

    const dup = await page.request.post('/api/renewals/vehicles', {
      data: { plate: 'E2E-1001 กท', ownerName: 'E2E บริษัท', vehicleType: 'หาง' },
    })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('ทะเบียนนี้มีอยู่แล้ว')
  })

  test('เพิ่มงวดที่หมดช้ากว่า → งวดเก่าปิดเป็นต่อแล้วและผูกกัน; ลบงวดใหม่ → งวดเก่ากลับเป็นรอต่อ', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-1002 กท')
    const oldId = await createCoverage(page, vid, 'PRB', '2026-03-31')
    const newId = await createCoverage(page, vid, 'PRB', '2027-03-31')

    let detail = await getVehicleDetail(page, vid)
    expect(detail.coverages.find((c) => c.id === oldId)).toMatchObject({ renewalStatus: 'RENEWED', renewedToId: newId })
    expect(detail.coverages.find((c) => c.id === newId)).toMatchObject({ renewalStatus: 'PENDING' })

    expect((await page.request.delete(`/api/renewals/coverages/${newId}`)).status()).toBe(200)
    detail = await getVehicleDetail(page, vid)
    expect(detail.coverages).toHaveLength(1)
    expect(detail.coverages[0]).toMatchObject({ id: oldId, renewalStatus: 'PENDING', renewedToId: null })
  })

  test('งวดซ้ำ (รถ + ประเภท + วันสิ้นสุด) → 409', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-1003 กท')
    await createCoverage(page, vid, 'TAX', '2027-06-30')
    const dup = await page.request.post('/api/renewals/coverages', {
      data: { vehicleId: vid, type: 'TAX', endDate: '2027-06-30' },
    })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('มีงวดประเภทนี้ที่หมดวันเดียวกันอยู่แล้ว')
  })

  test('ภาษีล้างบริษัทประกัน; ประกันสินค้าล้างชั้น; หางคู่ต้องเป็นคนละคัน', async ({ page }) => {
    const insurerId = await createInsurer(page, 'E2E ประกันภัย V')
    const vid = await createVehicle(page, 'E2E-1004 กท')
    await createCoverage(page, vid, 'TAX', '2027-06-30', { insurerId, amount: 4350, serviceFee: 1300 })
    await createCoverage(page, vid, 'CARGO_INSURANCE', '2027-01-11', { insurerId, coverageClass: 'ป.3' })
    const detail = await getVehicleDetail(page, vid)
    expect(detail.coverages.find((c) => c.type === 'TAX')).toMatchObject({ insurerId: null, amount: 4350, serviceFee: 1300 })
    expect(detail.coverages.find((c) => c.type === 'CARGO_INSURANCE')).toMatchObject({ insurerId, coverageClass: null })

    const self = await page.request.post('/api/renewals/coverages', {
      data: { vehicleId: vid, type: 'MOTOR_INSURANCE', endDate: '2027-01-09', pairedVehicleId: vid },
    })
    expect(self.status()).toBe(400)
    expect((await self.json()).error).toBe('หางคู่ต้องเป็นรถคนละคัน')
  })

  test('เปลี่ยนรถเป็นขาย → งวดเปิดเป็นไม่ต่อ/ขายรถ; ลบรถที่มีงวด → 409', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-1005 กท')
    const cid = await createCoverage(page, vid, 'MOTOR_INSURANCE', '2027-01-09')
    const res = await page.request.patch(`/api/renewals/vehicles/${vid}`, {
      data: { plate: 'E2E-1005 กท', ownerName: 'E2E บริษัท', vehicleType: 'ลากจูง', status: 'SOLD', statusDate: '2026-07-06' },
    })
    expect(res.status()).toBe(200)
    expect((await getVehicleDetail(page, vid)).coverages[0]).toMatchObject({
      id: cid,
      renewalStatus: 'NOT_RENEWED',
      notRenewedReason: 'SOLD',
    })

    const del = await page.request.delete(`/api/renewals/vehicles/${vid}`)
    expect(del.status()).toBe(409)
  })
})
```

- [ ] **Step 10: รันทดสอบ**

Run: `npx tsx --test lib/renewals/__tests__/*.test.ts` → PASS
Run: `npx playwright test e2e/renewals/vehicles-api.spec.ts --workers=1` → PASS 5 tests
Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

- [ ] **Step 11: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/renewals/autoClose.ts lib/renewals/__tests__/autoClose.test.ts lib/renewals/coverageService.ts lib/renewals/vehicleService.ts app/api/renewals/vehicles app/api/renewals/coverages e2e/renewals/helpers.ts e2e/renewals/vehicles-api.spec.ts
git commit -m "$(cat <<'EOF'
feat(renewals): API รถและงวด พร้อมกติกาปิดงวดเก่าอัตโนมัติและรถที่ขายแล้ว

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: เปลี่ยนสถานะการต่อ (ต่อแล้ว / bulk / ไม่ต่อ / เปิดใหม่)

**Files:**
- Modify: `lib/renewals/coverageService.ts` (เพิ่มฟังก์ชันท้ายไฟล์ + import)
- Create: `app/api/renewals/coverages/[id]/renew/route.ts`, `app/api/renewals/coverages/[id]/reopen/route.ts`, `app/api/renewals/coverages/bulk-renew/route.ts`, `app/api/renewals/coverages/bulk-status/route.ts`
- Create: `e2e/renewals/status-api.spec.ts`

**Interfaces:**
- Consumes: `coverageData`, `assertReferences`, `withDuplicateGuard`, `OPEN_FILTER`, `PeriodData`, `Tx` (Task 6); `validateNewPeriod` (Task 2); schemas (Task 4)
- Produces:
  - `renewCoverage(id, input: CoverageFields, userId): Promise<string>` (id งวดใหม่)
  - `bulkRenew(input: BulkRenewInput, userId): Promise<number>`
  - `bulkSetStatus(input: BulkStatusInput, userId): Promise<number>`
  - `reopenCoverage(id, userId): Promise<void>`
  - API: `POST /coverages/[id]/renew` → 201 `{ id }`; `POST /coverages/bulk-renew` → `{ count }`; `POST /coverages/bulk-status` → `{ count }`; `POST /coverages/[id]/reopen` → `{ success: true }`

- [ ] **Step 1: เขียน e2e ที่ fail**

`e2e/renewals/status-api.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { cleanupRenewals, createCoverage, createInsurer, createVehicle, getVehicleDetail, login } from './helpers'

test.describe.serial('API สถานะการต่อ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('ต่อแล้ว: สร้างงวดใหม่ ผูกกับงวดเดิม; วันหมดไม่หลังงวดเดิม → 400', async ({ page }) => {
    const insurerId = await createInsurer(page, 'E2E ประกันภัย S')
    const vid = await createVehicle(page, 'E2E-2001 กท')
    const cid = await createCoverage(page, vid, 'MOTOR_INSURANCE', '2026-12-31')

    const bad = await page.request.post(`/api/renewals/coverages/${cid}/renew`, { data: { endDate: '2026-12-31' } })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).error).toBe('วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม')

    const res = await page.request.post(`/api/renewals/coverages/${cid}/renew`, {
      data: { insurerId, coverageClass: 'ป.3', startDate: '2027-01-01', endDate: '2027-12-31', amount: 19900 },
    })
    expect(res.status()).toBe(201)
    const { id: newId } = await res.json()
    const detail = await getVehicleDetail(page, vid)
    expect(detail.coverages.find((c) => c.id === cid)).toMatchObject({ renewalStatus: 'RENEWED', renewedToId: newId })
    expect(detail.coverages.find((c) => c.id === newId)).toMatchObject({
      renewalStatus: 'PENDING',
      insurerId,
      coverageClass: 'ป.3',
      amount: 19900,
      startDate: '2027-01-01',
    })
  })

  test('กดต่อแล้วพร้อมกัน 2 ครั้ง → สำเร็จ 1 ครั้ง อีกครั้ง 409 และมีงวดใหม่งวดเดียว', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-2002 กท')
    const cid = await createCoverage(page, vid, 'PRB', '2026-12-31')
    const body = { data: { startDate: '2027-01-01', endDate: '2027-12-31' } }
    const [a, b] = await Promise.all([
      page.request.post(`/api/renewals/coverages/${cid}/renew`, body),
      page.request.post(`/api/renewals/coverages/${cid}/renew`, body),
    ])
    expect([a.status(), b.status()].sort()).toEqual([201, 409])
    expect((await getVehicleDetail(page, vid)).coverages).toHaveLength(2)
  })

  test('bulk-status: กำลังดำเนินการ, ไม่ต่อต้องมีเหตุผล, ชนงวดที่ปิดแล้ว → 409 และไม่มีอะไรเปลี่ยน', async ({ page }) => {
    const v1 = await createVehicle(page, 'E2E-2003 กท')
    const v2 = await createVehicle(page, 'E2E-2004 กท')
    const c1 = await createCoverage(page, v1, 'TAX', '2026-12-31')
    const c2 = await createCoverage(page, v2, 'TAX', '2026-12-31')

    const inProgress = await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [c1, c2], status: 'IN_PROGRESS' },
    })
    expect(await inProgress.json()).toEqual({ count: 2 })

    const noReason = await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [c1], status: 'NOT_RENEWED' },
    })
    expect(noReason.status()).toBe(400)

    const repair = await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [c1], status: 'NOT_RENEWED', reason: 'REPAIR', note: 'ซ่อมเครื่อง' },
    })
    expect(repair.status()).toBe(200)

    const mixed = await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [c1, c2], status: 'PENDING' },
    })
    expect(mixed.status()).toBe(409)
    expect((await mixed.json()).error).toContain('E2E-2003 กท')
    expect((await getVehicleDetail(page, v2)).coverages[0].renewalStatus).toBe('IN_PROGRESS')
    expect((await getVehicleDetail(page, v1)).coverages[0]).toMatchObject({
      renewalStatus: 'NOT_RENEWED',
      notRenewedReason: 'REPAIR',
      renewalNote: 'ซ่อมเครื่อง',
    })
  })

  test('bulk-renew: ประเภทปนกัน → 400; ประเภทเดียวกัน → คัดลอกเบี้ย/ค่าบริการจากงวดเดิม', async ({ page }) => {
    const v1 = await createVehicle(page, 'E2E-2005 กท')
    const v2 = await createVehicle(page, 'E2E-2006 กท')
    const p1 = await createCoverage(page, v1, 'PRB', '2027-03-31', { amount: 645.21 })
    const p2 = await createCoverage(page, v2, 'PRB', '2027-03-31', { amount: 1182.35 })
    const t1 = await createCoverage(page, v1, 'TAX', '2027-03-31')

    const mixed = await page.request.post('/api/renewals/coverages/bulk-renew', {
      data: { ids: [p1, t1], endDate: '2028-03-31' },
    })
    expect(mixed.status()).toBe(400)
    expect((await mixed.json()).error).toBe('ต่อแล้วแบบหลายรายการต้องเป็นประเภทเดียวกัน')

    const res = await page.request.post('/api/renewals/coverages/bulk-renew', {
      data: { ids: [p1, p2], startDate: '2027-04-01', endDate: '2028-03-31' },
    })
    expect(await res.json()).toEqual({ count: 2 })
    const renewed = (await getVehicleDetail(page, v2)).coverages.find((c) => c.type === 'PRB' && c.renewalStatus === 'PENDING')
    expect(renewed).toMatchObject({ endDate: '2028-03-31', amount: 1182.35, policyNumber: null })
  })

  test('เปิดใหม่: ไม่ต่อ → รอต่อ; งวดที่มีงวดใหม่กว่าแล้ว → 409; งวดที่ยังเปิด → 409', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-2007 กท')
    const cid = await createCoverage(page, vid, 'CARGO_INSURANCE', '2026-12-31')
    await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [cid], status: 'NOT_RENEWED', reason: 'SUSPENDED' },
    })
    expect((await page.request.post(`/api/renewals/coverages/${cid}/reopen`)).status()).toBe(200)
    expect((await getVehicleDetail(page, vid)).coverages[0].renewalStatus).toBe('PENDING')

    const again = await page.request.post(`/api/renewals/coverages/${cid}/reopen`)
    expect(again.status()).toBe(409)

    await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [cid], status: 'NOT_RENEWED', reason: 'SUSPENDED' },
    })
    await createCoverage(page, vid, 'CARGO_INSURANCE', '2027-12-31')
    const blocked = await page.request.post(`/api/renewals/coverages/${cid}/reopen`)
    expect(blocked.status()).toBe(409)
    expect((await blocked.json()).error).toBe('เปิดใหม่ไม่ได้ เพราะมีงวดที่หมดช้ากว่าแล้ว')
  })
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx playwright test e2e/renewals/status-api.spec.ts --workers=1`
Expected: FAIL — route ยังไม่มี (404)

- [ ] **Step 3: เพิ่มฟังก์ชันใน `lib/renewals/coverageService.ts`**

แก้ import ด้านบน:

```ts
import { OPEN_STATUSES, isOpenStatus, type CoverageTypeKey } from './constants'
import { CLOSED_ERROR, DUPLICATE_PERIOD_ERROR, badRequest, conflict, isUniqueViolation, notFound } from './http'
import { validateNewPeriod } from './renewalDefaults'
import {
  sanitizeCoverageFields,
  type BulkRenewInput,
  type BulkStatusInput,
  type CoverageCreateInput,
  type CoverageFields,
} from './schemas'
```

ต่อท้ายไฟล์:

```ts
/** ปิดงวดเดิมแบบมีเงื่อนไข (กันกดซ้ำ/พร้อมกัน) แล้วสร้างงวดใหม่และผูก renewedToId */
async function createNextPeriod(
  tx: Tx,
  old: { id: string; vehicleId: string; type: CoverageTypeKey },
  fields: PeriodData,
  userId: string,
): Promise<string> {
  const claimed = await tx.vehicleCoverage.updateMany({
    where: { id: old.id, renewalStatus: OPEN_FILTER },
    data: { renewalStatus: 'RENEWED', notRenewedReason: null, statusUpdatedAt: new Date(), statusUpdatedById: userId },
  })
  if (claimed.count !== 1) throw conflict(CLOSED_ERROR)
  const created = await tx.vehicleCoverage.create({
    data: { vehicleId: old.vehicleId, type: old.type, ...coverageData(fields), createdById: userId },
  })
  await tx.vehicleCoverage.update({ where: { id: old.id }, data: { renewedToId: created.id } })
  return created.id
}

export async function renewCoverage(id: string, input: CoverageFields, userId: string): Promise<string> {
  return withDuplicateGuard(() =>
    prisma.$transaction(async (tx) => {
      const old = await tx.vehicleCoverage.findUnique({
        where: { id },
        select: { id: true, vehicleId: true, type: true, endDate: true, renewalStatus: true },
      })
      if (!old) throw notFound('ไม่พบงวด')
      if (!isOpenStatus(old.renewalStatus)) throw conflict(CLOSED_ERROR)
      const periodError = validateNewPeriod(dateToYmd(old.endDate), input.startDate, input.endDate)
      if (periodError) throw badRequest(periodError)
      const fields = sanitizeCoverageFields(old.type, input)
      await assertReferences(tx, fields, old.vehicleId)
      return createNextPeriod(tx, old, fields, userId)
    }),
  )
}

/** ต่อแล้วหลายรายการ (ประเภทเดียวกัน) — ทั้งชุดสำเร็จหรือไม่สำเร็จพร้อมกัน; เบี้ย/ค่าบริการคัดลอกจากงวดเดิมรายคัน */
export async function bulkRenew(input: BulkRenewInput, userId: string): Promise<number> {
  const ids = [...new Set(input.ids)]
  return withDuplicateGuard(() =>
    prisma.$transaction(
      async (tx) => {
        const olds = await tx.vehicleCoverage.findMany({
          where: { id: { in: ids } },
          include: { vehicle: { select: { plate: true } } },
        })
        if (olds.length !== ids.length) throw notFound('ไม่พบบางรายการ — โหลดหน้าใหม่แล้วลองอีกครั้ง')
        if (new Set(olds.map((o) => o.type)).size > 1) throw badRequest('ต่อแล้วแบบหลายรายการต้องเป็นประเภทเดียวกัน')
        const plates = (rows: typeof olds) => rows.map((o) => o.vehicle.plate).join(', ')
        const closed = olds.filter((o) => !isOpenStatus(o.renewalStatus))
        if (closed.length > 0) throw conflict(`งวดถูกปิดไปแล้ว: ${plates(closed)}`)
        const invalid = olds.filter(
          (o) => validateNewPeriod(dateToYmd(o.endDate), input.startDate, input.endDate) !== null,
        )
        if (invalid.length > 0) throw badRequest(`วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม: ${plates(invalid)}`)
        if (input.insurerId && !(await tx.insurer.findUnique({ where: { id: input.insurerId }, select: { id: true } }))) {
          throw badRequest('ไม่พบบริษัทประกัน')
        }
        for (const old of olds) {
          const fields = sanitizeCoverageFields(old.type, {
            insurerId: input.insurerId ?? old.insurerId,
            coverageClass: old.coverageClass,
            policyNumber: null,
            startDate: input.startDate,
            endDate: input.endDate,
            amount: old.amount === null ? null : Number(old.amount),
            serviceFee: old.serviceFee === null ? null : Number(old.serviceFee),
            pairedVehicleId: old.pairedVehicleId,
            renewalNote: null,
          })
          await createNextPeriod(tx, old, fields, userId)
        }
        return olds.length
      },
      { timeout: 30_000 },
    ),
  )
}

/** รอต่อ ↔ กำลังดำเนินการ / ไม่ต่อ (หลายรายการ) — ทั้งชุดสำเร็จหรือไม่สำเร็จพร้อมกัน */
export async function bulkSetStatus(input: BulkStatusInput, userId: string): Promise<number> {
  const ids = [...new Set(input.ids)]
  return prisma.$transaction(async (tx) => {
    const olds = await tx.vehicleCoverage.findMany({
      where: { id: { in: ids } },
      select: { renewalStatus: true, vehicle: { select: { plate: true } } },
    })
    if (olds.length !== ids.length) throw notFound('ไม่พบบางรายการ — โหลดหน้าใหม่แล้วลองอีกครั้ง')
    const closed = olds.filter((o) => !isOpenStatus(o.renewalStatus))
    if (closed.length > 0) throw conflict(`งวดถูกปิดไปแล้ว: ${closed.map((o) => o.vehicle.plate).join(', ')}`)

    const statusData =
      input.status === 'NOT_RENEWED'
        ? { renewalStatus: 'NOT_RENEWED' as const, notRenewedReason: input.reason, ...(input.note ? { renewalNote: input.note } : {}) }
        : { renewalStatus: input.status, notRenewedReason: null }
    const res = await tx.vehicleCoverage.updateMany({
      where: { id: { in: ids }, renewalStatus: OPEN_FILTER },
      data: { ...statusData, statusUpdatedAt: new Date(), statusUpdatedById: userId },
    })
    if (res.count !== ids.length) throw conflict(CLOSED_ERROR)
    return res.count
  })
}

/** ไม่ต่อ → รอต่อ (เช่น รถซ่อมเสร็จกลับมาใช้) */
export async function reopenCoverage(id: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.vehicleCoverage.findUnique({
      where: { id },
      select: { vehicleId: true, type: true, endDate: true, renewalStatus: true, vehicle: { select: { status: true } } },
    })
    if (!row) throw notFound('ไม่พบงวด')
    if (row.renewalStatus !== 'NOT_RENEWED') throw conflict('เปิดใหม่ได้เฉพาะงวดที่ไม่ต่อ')
    if (row.vehicle.status === 'SOLD') throw conflict('รถคันนี้ขายแล้ว เปิดงวดใหม่ไม่ได้')
    const newer = await tx.vehicleCoverage.findFirst({
      where: { vehicleId: row.vehicleId, type: row.type, endDate: { gt: row.endDate } },
      select: { id: true },
    })
    if (newer) throw conflict('เปิดใหม่ไม่ได้ เพราะมีงวดที่หมดช้ากว่าแล้ว')
    const res = await tx.vehicleCoverage.updateMany({
      where: { id, renewalStatus: 'NOT_RENEWED' },
      data: { renewalStatus: 'PENDING', notRenewedReason: null, statusUpdatedAt: new Date(), statusUpdatedById: userId },
    })
    if (res.count !== 1) throw conflict(CLOSED_ERROR)
  })
}
```

- [ ] **Step 4: Routes**

`app/api/renewals/coverages/[id]/renew/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { renewCoverage } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { coverageFieldsSchema } from '@/lib/renewals/schemas'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const newId = await renewCoverage(id, await parseJsonBody(req, coverageFieldsSchema), access.user.id)
    return NextResponse.json({ id: newId }, { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

`app/api/renewals/coverages/[id]/reopen/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { reopenCoverage } from '@/lib/renewals/coverageService'
import { renewalErrorResponse } from '@/lib/renewals/http'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    await reopenCoverage(id, access.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

`app/api/renewals/coverages/bulk-renew/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { bulkRenew } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { bulkRenewSchema } from '@/lib/renewals/schemas'

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const count = await bulkRenew(await parseJsonBody(req, bulkRenewSchema), access.user.id)
    return NextResponse.json({ count })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

`app/api/renewals/coverages/bulk-status/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { bulkSetStatus } from '@/lib/renewals/coverageService'
import { parseJsonBody, renewalErrorResponse } from '@/lib/renewals/http'
import { bulkStatusSchema } from '@/lib/renewals/schemas'

export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const count = await bulkSetStatus(await parseJsonBody(req, bulkStatusSchema), access.user.id)
    return NextResponse.json({ count })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `npx playwright test e2e/renewals/status-api.spec.ts --workers=1`
Expected: PASS 5 tests
Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

- [ ] **Step 6: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/renewals/coverageService.ts app/api/renewals/coverages e2e/renewals/status-api.spec.ts
git commit -m "$(cat <<'EOF'
feat(renewals): API ต่อแล้ว/ไม่ต่อ/เปิดใหม่ ทั้งทีละรายการและหลายรายการ กันกดซ้ำพร้อมกัน

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 8: Dashboard (API + หน้าจอ + modal ต่อแล้ว/ไม่ต่อ/bulk/หมายเหตุ)

**Files:**
- Create: `lib/renewals/dashboardFilter.ts`, `lib/renewals/__tests__/dashboardFilter.test.ts`
- Create: `app/api/renewals/dashboard/route.ts`
- Create: `components/renewals/coverageForm.ts`, `components/renewals/useRenewalLookups.ts`, `components/renewals/CoveragePeriodFields.tsx`
- Create: `components/renewals/RenewModal.tsx`, `NotRenewModal.tsx`, `BulkRenewModal.tsx`, `NoteModal.tsx`, `RenewalDashboard.tsx`
- Modify: `app/(protected)/renewals/page.tsx` (แทนที่หน้าชั่วคราว)
- Modify: `e2e/renewals/helpers.ts`
- Create: `e2e/renewals/dashboard.spec.ts`

**Interfaces:**
- Consumes: API Task 6–7, `nextPeriodDefaults` (Task 2), `DUE_BUCKET_COLORS`/`DUE_BUCKET_LABELS`/`endOfNextMonth` (Task 2), DTO (Task 1), `getJson`/`sendJson` (Task 4)
- Produces:
  - `filterDashboardItems(items, filters: DashboardFilters, options?: { ignoreType?: boolean }): DashboardItemDto[]`, `summarizeDashboard(items): DashboardSummary`
  - `GET /api/renewals/dashboard` → `DashboardResponse`
  - `coverageForm.ts`: `DATE_FORMAT = 'DD/MM/YYYY'`, `CoverageFormValues`, `CoverageFieldsBody`, `formValuesToBody`, `dtoToFormValues`, `dtoToBody`
  - `useRenewalLookups(): { insurers: InsurerDto[]; vehicles: VehicleListItemDto[] }`
  - `<CoveragePeriodFields type insurers vehicles vehicleId currentInsurerId? />` — id ของช่อง: `coverage-insurer`, `coverage-class`, `coverage-start-date`, `coverage-end-date`, `coverage-amount`, `coverage-service-fee`, `coverage-paired`; testid: `coverage-policy-input`, `coverage-note-input`
  - `<RenewModal item insurers vehicles onClose onDone />` (Task 10 เพิ่มช่องแนบไฟล์)
  - testid ของ dashboard: `count-{OVERDUE|THIS_MONTH|NEXT_MONTH|IN_PROGRESS}`, `due-tag-{id}`, `status-tag-{id}`, `renew-btn-{id}`, `not-renew-btn-{id}`, `status-toggle-btn-{id}`, `note-btn-{id}`, `bulk-in-progress-btn`, `bulk-renew-btn`, `bulk-not-renew-btn`, `dashboard-totals`
  - e2e helpers: `toPickerText(ymd): string` (`DD/MM/YYYY`), `fillDate(page, selector, ymd)`

- [ ] **Step 1: เขียน test ที่ fail**

`lib/renewals/__tests__/dashboardFilter.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DashboardItemDto } from '../../../types/renewals'
import { filterDashboardItems, summarizeDashboard } from '../dashboardFilter'

function item(overrides: Partial<DashboardItemDto> & { id: string }): DashboardItemDto {
  return {
    vehicleId: 'v1',
    type: 'PRB',
    insurerId: null,
    insurerName: null,
    coverageClass: null,
    policyNumber: null,
    startDate: null,
    endDate: '2026-10-31',
    amount: null,
    serviceFee: null,
    pairedVehicleId: null,
    pairedPlate: null,
    renewalStatus: 'PENDING',
    notRenewedReason: null,
    renewalNote: null,
    renewedToId: null,
    attachmentCount: 0,
    vehicle: { id: 'v1', plate: '64-5598 กท', fleetNumber: '62', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', status: 'ACTIVE' },
    bucket: 'THIS_MONTH',
    ...overrides,
  }
}

const items = [
  item({ id: 'a', type: 'PRB', bucket: 'OVERDUE', amount: 0.1 }),
  item({ id: 'b', type: 'TAX', bucket: 'NEXT_MONTH', amount: 0.2, serviceFee: 1300, renewalStatus: 'IN_PROGRESS' }),
  item({
    id: 'c',
    type: 'TAX',
    bucket: 'THIS_MONTH',
    vehicle: { id: 'v2', plate: '76-1119 กท', fleetNumber: '18', ownerName: 'ทรงยุทธ โลจิสติคส์', vehicleType: 'ลากจูง', status: 'ACTIVE' },
  }),
]

test('กรองตามประเภท บริษัท สถานะ', () => {
  assert.deepEqual(filterDashboardItems(items, { type: 'TAX' }).map((i) => i.id), ['b', 'c'])
  assert.deepEqual(filterDashboardItems(items, { type: 'ALL', owner: 'ทรงยุทธ โลจิสติคส์' }).map((i) => i.id), ['c'])
  assert.deepEqual(filterDashboardItems(items, { type: 'ALL', status: 'IN_PROGRESS' }).map((i) => i.id), ['b'])
  assert.deepEqual(filterDashboardItems(items, { type: 'TAX' }, { ignoreType: true }).map((i) => i.id), ['a', 'b', 'c'])
})

test('ค้นหาทะเบียนแบบมีจุดท้าย/ช่องว่างซ้อน และค้นด้วยเบอร์รถ', () => {
  assert.deepEqual(filterDashboardItems(items, { type: 'ALL', q: '76-1119  กท.' }).map((i) => i.id), ['c'])
  assert.deepEqual(filterDashboardItems(items, { type: 'ALL', q: '18' }).map((i) => i.id), ['c'])
})

test('สรุปจำนวนตามช่วง/ประเภท และยอดเงินปัดทศนิยม 2 ตำแหน่ง', () => {
  const s = summarizeDashboard(items)
  assert.deepEqual(s.buckets, { OVERDUE: 1, THIS_MONTH: 1, NEXT_MONTH: 1, LATER: 0 })
  assert.equal(s.inProgress, 1)
  assert.deepEqual(s.byType, { ALL: 3, PRB: 1, TAX: 2, MOTOR_INSURANCE: 0, CARGO_INSURANCE: 0 })
  assert.deepEqual(s.totals, { amount: 0.3, serviceFee: 1300 })
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/renewals/__tests__/dashboardFilter.test.ts`
Expected: FAIL — `Cannot find module '../dashboardFilter'`

- [ ] **Step 3: สร้าง `lib/renewals/dashboardFilter.ts`**

```ts
import type { DashboardItemDto } from '@/types/renewals'
import type { CoverageTypeKey, DueBucket } from './constants'
import { normalizePlate } from './plate'

export interface DashboardFilters {
  type: CoverageTypeKey | 'ALL'
  owner?: string
  status?: 'PENDING' | 'IN_PROGRESS'
  q?: string
}

export interface DashboardSummary {
  buckets: Record<DueBucket, number>
  inProgress: number
  byType: Record<CoverageTypeKey | 'ALL', number>
  totals: { amount: number; serviceFee: number }
}

/** ignoreType ใช้นับตัวเลขบนแท็บ (ตัวกรองอื่นยังมีผล) */
export function filterDashboardItems(
  items: DashboardItemDto[],
  filters: DashboardFilters,
  options: { ignoreType?: boolean } = {},
): DashboardItemDto[] {
  const q = filters.q ? normalizePlate(filters.q).toLowerCase() : ''
  return items.filter((item) => {
    if (!options.ignoreType && filters.type !== 'ALL' && item.type !== filters.type) return false
    if (filters.owner && item.vehicle.ownerName !== filters.owner) return false
    if (filters.status && item.renewalStatus !== filters.status) return false
    if (
      q &&
      !item.vehicle.plate.toLowerCase().includes(q) &&
      !(item.vehicle.fleetNumber ?? '').toLowerCase().includes(q)
    ) {
      return false
    }
    return true
  })
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function summarizeDashboard(items: DashboardItemDto[]): DashboardSummary {
  const summary: DashboardSummary = {
    buckets: { OVERDUE: 0, THIS_MONTH: 0, NEXT_MONTH: 0, LATER: 0 },
    inProgress: 0,
    byType: { ALL: 0, PRB: 0, TAX: 0, MOTOR_INSURANCE: 0, CARGO_INSURANCE: 0 },
    totals: { amount: 0, serviceFee: 0 },
  }
  for (const item of items) {
    summary.buckets[item.bucket]++
    if (item.renewalStatus === 'IN_PROGRESS') summary.inProgress++
    summary.byType.ALL++
    summary.byType[item.type]++
    summary.totals.amount = round2(summary.totals.amount + (item.amount ?? 0))
    summary.totals.serviceFee = round2(summary.totals.serviceFee + (item.serviceFee ?? 0))
  }
  return summary
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx tsx --test lib/renewals/__tests__/dashboardFilter.test.ts`
Expected: PASS 3 tests

- [ ] **Step 5: API dashboard**

`app/api/renewals/dashboard/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { OPEN_STATUSES } from '@/lib/renewals/constants'
import { todayInBangkok, ymdToDate } from '@/lib/renewals/dateOnly'
import { dueBucket, endOfNextMonth } from '@/lib/renewals/dueWindow'
import { COVERAGE_INCLUDE, toCoverageDto } from '@/lib/renewals/serialize'
import type { DashboardItemDto, DashboardResponse } from '@/types/renewals'

/** งวดเปิดทั้งหมดที่หมดภายในสิ้นเดือนหน้า (รวมที่เลยกำหนด) — ตัวกรอง/นับ/ยอดรวมทำฝั่ง client */
export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const today = todayInBangkok()
  const rows = await prisma.vehicleCoverage.findMany({
    where: { renewalStatus: { in: [...OPEN_STATUSES] }, endDate: { lte: ymdToDate(endOfNextMonth(today)) } },
    include: COVERAGE_INCLUDE,
  })
  const items: DashboardItemDto[] = rows
    .map((r) => {
      const dto = toCoverageDto(r)
      return { ...dto, bucket: dueBucket(dto.endDate, today) }
    })
    .sort(
      (a, b) =>
        a.endDate.localeCompare(b.endDate) ||
        (a.vehicle.fleetNumber ?? '').localeCompare(b.vehicle.fleetNumber ?? '', 'th', { numeric: true }),
    )
  const body: DashboardResponse = { today, items }
  return NextResponse.json(body)
}
```

- [ ] **Step 6: helper ฝั่ง client สำหรับฟอร์มงวด**

`components/renewals/coverageForm.ts`:

```ts
import dayjs, { type Dayjs } from 'dayjs'
import type { CoverageDto } from '@/types/renewals'

/** DatePicker ใช้ ค.ศ. ให้พิมพ์วันที่ได้แน่นอน — ตารางแสดง พ.ศ. ด้วย toThaiShortDate */
export const DATE_FORMAT = 'DD/MM/YYYY'

export interface CoverageFormValues {
  insurerId?: string | null
  coverageClass?: string | null
  policyNumber?: string | null
  startDate?: Dayjs | null
  endDate?: Dayjs | null
  amount?: number | null
  serviceFee?: number | null
  pairedVehicleId?: string | null
  renewalNote?: string | null
}

export interface CoverageFieldsBody {
  insurerId: string | null
  coverageClass: string | null
  policyNumber: string | null
  startDate: string | null
  endDate: string
  amount: number | null
  serviceFee: number | null
  pairedVehicleId: string | null
  renewalNote: string | null
}

const toYmd = (d: Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : null)

/** endDate เป็นช่องบังคับใน Form (rules) จึงมีค่าเสมอหลัง validateFields */
export function formValuesToBody(v: CoverageFormValues): CoverageFieldsBody {
  return {
    insurerId: v.insurerId ?? null,
    coverageClass: v.coverageClass ?? null,
    policyNumber: v.policyNumber?.trim() || null,
    startDate: toYmd(v.startDate),
    endDate: toYmd(v.endDate) ?? '',
    amount: v.amount ?? null,
    serviceFee: v.serviceFee ?? null,
    pairedVehicleId: v.pairedVehicleId ?? null,
    renewalNote: v.renewalNote?.trim() || null,
  }
}

export function dtoToFormValues(dto: CoverageDto): CoverageFormValues {
  return {
    insurerId: dto.insurerId,
    coverageClass: dto.coverageClass,
    policyNumber: dto.policyNumber,
    startDate: dto.startDate ? dayjs(dto.startDate) : null,
    endDate: dayjs(dto.endDate),
    amount: dto.amount,
    serviceFee: dto.serviceFee,
    pairedVehicleId: dto.pairedVehicleId,
    renewalNote: dto.renewalNote,
  }
}

/** body สำหรับ PATCH งวดจาก DTO เดิม (ใช้ตอนแก้เฉพาะหมายเหตุ) */
export function dtoToBody(dto: CoverageDto): CoverageFieldsBody {
  return {
    insurerId: dto.insurerId,
    coverageClass: dto.coverageClass,
    policyNumber: dto.policyNumber,
    startDate: dto.startDate,
    endDate: dto.endDate,
    amount: dto.amount,
    serviceFee: dto.serviceFee,
    pairedVehicleId: dto.pairedVehicleId,
    renewalNote: dto.renewalNote,
  }
}
```

`components/renewals/useRenewalLookups.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import { App } from 'antd'
import type { InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { getJson } from './api'

/** รายชื่อบริษัทประกันและรถ สำหรับ Select ในฟอร์มงวด */
export function useRenewalLookups() {
  const { message } = App.useApp()
  const [insurers, setInsurers] = useState<InsurerDto[]>([])
  const [vehicles, setVehicles] = useState<VehicleListItemDto[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getJson<InsurerDto[]>('/api/renewals/insurers'),
      getJson<VehicleListItemDto[]>('/api/renewals/vehicles'),
    ]).then(([i, v]) => {
      if (cancelled) return
      if (i.ok) setInsurers(i.data)
      else message.error(i.error)
      if (v.ok) setVehicles(v.data)
      else message.error(v.error)
    })
    return () => {
      cancelled = true
    }
  }, [message])

  return { insurers, vehicles }
}
```

`components/renewals/CoveragePeriodFields.tsx`:

```tsx
'use client'

import { Col, DatePicker, Form, Input, InputNumber, Row, Select } from 'antd'
import { COVERAGE_CLASSES, MAX_MONEY, type CoverageTypeKey } from '@/lib/renewals/constants'
import type { InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { DATE_FORMAT } from './coverageForm'

interface Props {
  type: CoverageTypeKey
  insurers: InsurerDto[]
  vehicles: VehicleListItemDto[]
  vehicleId: string
  /** บริษัทที่ปิดใช้งานแล้วแต่งวดนี้ใช้อยู่ ยังต้องแสดงในตัวเลือก */
  currentInsurerId?: string | null
}

/** ช่องกรอกงวด — ใช้ร่วมกันระหว่าง "ต่อแล้ว" และ เพิ่ม/แก้งวด; ต้องอยู่ใน <Form> */
export default function CoveragePeriodFields({ type, insurers, vehicles, vehicleId, currentInsurerId }: Props) {
  const isMotor = type === 'MOTOR_INSURANCE'
  const insurerOptions = insurers
    .filter((i) => i.isActive || i.id === currentInsurerId)
    .map((i) => ({ value: i.id, label: i.isActive ? i.name : `${i.name} (ปิดใช้งาน)` }))
  const pairedOptions = vehicles
    .filter((v) => v.id !== vehicleId && v.status !== 'SOLD')
    .map((v) => ({ value: v.id, label: v.fleetNumber ? `${v.plate} (${v.fleetNumber})` : v.plate }))

  return (
    <>
      {type !== 'TAX' && (
        <Form.Item name="insurerId" label="บริษัทประกัน">
          <Select id="coverage-insurer" allowClear showSearch optionFilterProp="label" options={insurerOptions} placeholder="เลือกบริษัทประกัน" />
        </Form.Item>
      )}
      {isMotor && (
        <Form.Item name="coverageClass" label="ชั้น">
          <Select id="coverage-class" allowClear options={COVERAGE_CLASSES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
      )}
      <Form.Item name="policyNumber" label={type === 'TAX' ? 'เลขที่อ้างอิง' : 'เลขกรมธรรม์'}>
        <Input data-testid="coverage-policy-input" maxLength={100} />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="startDate" label="วันเริ่ม">
            <DatePicker id="coverage-start-date" format={DATE_FORMAT} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="endDate" label="วันสิ้นสุด" rules={[{ required: true, message: 'กรุณาเลือกวันสิ้นสุด' }]}>
            <DatePicker id="coverage-end-date" format={DATE_FORMAT} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="amount" label={type === 'TAX' ? 'ค่าภาษี (บาท)' : 'เบี้ย (บาท)'}>
            <InputNumber id="coverage-amount" min={0} max={MAX_MONEY} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="serviceFee" label="ค่าบริการ (บาท)">
            <InputNumber id="coverage-service-fee" min={0} max={MAX_MONEY} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      {isMotor && (
        <Form.Item name="pairedVehicleId" label="หางคู่">
          <Select id="coverage-paired" allowClear showSearch optionFilterProp="label" options={pairedOptions} />
        </Form.Item>
      )}
      <Form.Item name="renewalNote" label="หมายเหตุ">
        <Input.TextArea data-testid="coverage-note-input" rows={2} maxLength={500} />
      </Form.Item>
    </>
  )
}
```

- [ ] **Step 7: Modals**

`components/renewals/RenewModal.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { App, Form, Modal } from 'antd'
import { COVERAGE_TYPE_LABELS } from '@/lib/renewals/constants'
import { nextPeriodDefaults } from '@/lib/renewals/renewalDefaults'
import type { CoverageDto, InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { sendJson } from './api'
import CoveragePeriodFields from './CoveragePeriodFields'
import { dtoToFormValues, formValuesToBody, type CoverageFormValues } from './coverageForm'

interface Props {
  item: CoverageDto | null
  insurers: InsurerDto[]
  vehicles: VehicleListItemDto[]
  onClose: () => void
  onDone: () => void
}

/** ต่อแล้ว (ทีละคัน) — ค่าเริ่มต้นมาจากงวดเดิม: วันเริ่ม = วันหมดเดิม + 1 วัน, วันหมด = +1 ปี */
export default function RenewModal({ item, insurers, vehicles, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<CoverageFormValues>()
  const [saving, setSaving] = useState(false)

  const initialValues = useMemo<CoverageFormValues | undefined>(() => {
    if (!item) return undefined
    const next = nextPeriodDefaults(item.endDate)
    return {
      ...dtoToFormValues(item),
      policyNumber: null,
      renewalNote: null,
      startDate: dayjs(next.startDate),
      endDate: dayjs(next.endDate),
    }
  }, [item])

  const handleOk = async () => {
    if (!item) return
    const values = await form.validateFields()
    setSaving(true)
    const res = await sendJson<{ id: string }>(`/api/renewals/coverages/${item.id}/renew`, formValuesToBody(values))
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกการต่ออายุสำเร็จ')
    onDone()
  }

  return (
    <Modal
      open={item !== null}
      title={item ? `ต่ออายุ${COVERAGE_TYPE_LABELS[item.type]} — ${item.vehicle.plate}` : ''}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {item && (
        <Form key={item.id} form={form} layout="vertical" initialValues={initialValues}>
          <CoveragePeriodFields
            type={item.type}
            insurers={insurers}
            vehicles={vehicles}
            vehicleId={item.vehicleId}
            currentInsurerId={item.insurerId}
          />
        </Form>
      )}
    </Modal>
  )
}
```

`components/renewals/NotRenewModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { App, Form, Input, Modal, Select } from 'antd'
import { NOT_RENEWED_REASONS, NOT_RENEWED_REASON_LABELS, type NotRenewedReasonKey } from '@/lib/renewals/constants'
import { sendJson } from './api'

interface Props {
  ids: string[] | null
  onClose: () => void
  onDone: () => void
}

/** ไม่ต่อ — ใช้ทั้งทีละแถวและหลายแถว */
export default function NotRenewModal({ ids, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ reason: NotRenewedReasonKey; note?: string }>()
  const [saving, setSaving] = useState(false)
  const reason = Form.useWatch('reason', form)

  const handleOk = async () => {
    if (!ids) return
    const values = await form.validateFields()
    setSaving(true)
    const res = await sendJson('/api/renewals/coverages/bulk-status', {
      ids,
      status: 'NOT_RENEWED',
      reason: values.reason,
      note: values.note?.trim() || null,
    })
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกสำเร็จ')
    onDone()
  }

  return (
    <Modal
      open={ids !== null}
      title={`ไม่ต่อ (${ids?.length ?? 0} รายการ)`}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {ids && (
        <Form form={form} layout="vertical">
          <Form.Item name="reason" label="เหตุผล" rules={[{ required: true, message: 'กรุณาเลือกเหตุผล' }]}>
            <Select
              id="not-renew-reason"
              options={NOT_RENEWED_REASONS.map((r) => ({ value: r, label: NOT_RENEWED_REASON_LABELS[r] }))}
            />
          </Form.Item>
          <Form.Item
            name="note"
            label="หมายเหตุ"
            rules={[{ required: reason === 'OTHER', whitespace: true, message: 'เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ' }]}
          >
            <Input.TextArea data-testid="not-renew-note" rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
```

`components/renewals/BulkRenewModal.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { Alert, App, Col, DatePicker, Form, Modal, Row, Select } from 'antd'
import { COVERAGE_TYPE_LABELS } from '@/lib/renewals/constants'
import { nextPeriodDefaults } from '@/lib/renewals/renewalDefaults'
import type { DashboardItemDto, InsurerDto } from '@/types/renewals'
import { sendJson } from './api'
import { DATE_FORMAT } from './coverageForm'

interface Props {
  open: boolean
  items: DashboardItemDto[]
  insurers: InsurerDto[]
  onClose: () => void
  onDone: () => void
}

interface Values {
  insurerId?: string | null
  startDate?: Dayjs | null
  endDate?: Dayjs | null
}

/** ต่อแล้วหลายรายการ (ประเภทเดียวกัน) — เบี้ย/ค่าบริการคัดลอกจากงวดเดิมฝั่ง server */
export default function BulkRenewModal({ open, items, insurers, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const type = items[0]?.type

  const initialValues = useMemo<Values>(() => {
    const sameEnd = items.length > 0 && items.every((i) => i.endDate === items[0].endDate)
    if (!sameEnd) return {}
    const next = nextPeriodDefaults(items[0].endDate)
    return { startDate: dayjs(next.startDate), endDate: dayjs(next.endDate) }
  }, [items])

  const handleOk = async () => {
    const values = await form.validateFields()
    setSaving(true)
    const res = await sendJson<{ count: number }>('/api/renewals/coverages/bulk-renew', {
      ids: items.map((i) => i.id),
      insurerId: values.insurerId ?? null,
      startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
      endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : '',
    })
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success(`ต่ออายุ ${res.data.count} รายการสำเร็จ`)
    onDone()
  }

  return (
    <Modal
      open={open}
      title={`ต่อแล้ว ${type ? COVERAGE_TYPE_LABELS[type] : ''} (${items.length} รายการ)`}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {open && (
        <Form form={form} layout="vertical" initialValues={initialValues}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="เบี้ย/ค่าบริการคัดลอกจากงวดเดิมของแต่ละคัน — เลขกรมธรรม์และไฟล์แนบแก้ทีหลังที่หน้ารถ"
          />
          {type !== 'TAX' && (
            <Form.Item name="insurerId" label="บริษัทประกัน">
              <Select
                id="bulk-renew-insurer"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="คงบริษัทเดิมของแต่ละคัน"
                options={insurers.filter((i) => i.isActive).map((i) => ({ value: i.id, label: i.name }))}
              />
            </Form.Item>
          )}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="startDate" label="วันเริ่ม">
                <DatePicker id="bulk-renew-start-date" format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="วันสิ้นสุด" rules={[{ required: true, message: 'กรุณาเลือกวันสิ้นสุด' }]}>
                <DatePicker id="bulk-renew-end-date" format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )}
    </Modal>
  )
}
```

`components/renewals/NoteModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { App, Form, Input, Modal } from 'antd'
import type { CoverageDto } from '@/types/renewals'
import { sendJson } from './api'
import { dtoToBody } from './coverageForm'

interface Props {
  item: CoverageDto | null
  onClose: () => void
  onDone: () => void
}

export default function NoteModal({ item, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ renewalNote?: string }>()
  const [saving, setSaving] = useState(false)

  const handleOk = async () => {
    if (!item) return
    const { renewalNote } = await form.validateFields()
    setSaving(true)
    const res = await sendJson(
      `/api/renewals/coverages/${item.id}`,
      { ...dtoToBody(item), renewalNote: renewalNote?.trim() || null },
      'PATCH',
    )
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกหมายเหตุสำเร็จ')
    onDone()
  }

  return (
    <Modal
      open={item !== null}
      title={item ? `หมายเหตุ — ${item.vehicle.plate}` : ''}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {item && (
        <Form key={item.id} form={form} layout="vertical" initialValues={{ renewalNote: item.renewalNote ?? '' }}>
          <Form.Item name="renewalNote" label="หมายเหตุ">
            <Input.TextArea data-testid="note-input" rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
```

- [ ] **Step 8: หน้า dashboard**

`components/renewals/RenewalDashboard.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  type TableColumnsType,
} from 'antd'
import { CheckOutlined, CloseOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  RENEWAL_STATUS_COLORS,
  RENEWAL_STATUS_LABELS,
  type CoverageTypeKey,
} from '@/lib/renewals/constants'
import { filterDashboardItems, summarizeDashboard, type DashboardFilters } from '@/lib/renewals/dashboardFilter'
import { DUE_BUCKET_COLORS, DUE_BUCKET_LABELS, endOfNextMonth } from '@/lib/renewals/dueWindow'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { DashboardItemDto, DashboardResponse } from '@/types/renewals'
import { getJson, sendJson } from './api'
import BulkRenewModal from './BulkRenewModal'
import NoteModal from './NoteModal'
import NotRenewModal from './NotRenewModal'
import RenewModal from './RenewModal'
import { useRenewalLookups } from './useRenewalLookups'

const money = (v: number | null) =>
  v === null ? '-' : v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CARDS = [
  { key: 'OVERDUE', title: DUE_BUCKET_LABELS.OVERDUE, color: '#cf1322' },
  { key: 'THIS_MONTH', title: DUE_BUCKET_LABELS.THIS_MONTH, color: '#d46b08' },
  { key: 'NEXT_MONTH', title: DUE_BUCKET_LABELS.NEXT_MONTH, color: '#1677ff' },
  { key: 'IN_PROGRESS', title: 'กำลังดำเนินการ', color: '#531dab' },
] as const

export default function RenewalDashboard() {
  const { message, modal } = App.useApp()
  const { insurers, vehicles } = useRenewalLookups()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<DashboardFilters>({ type: 'ALL' })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [renewing, setRenewing] = useState<DashboardItemDto | null>(null)
  const [notRenewIds, setNotRenewIds] = useState<string[] | null>(null)
  const [noteItem, setNoteItem] = useState<DashboardItemDto | null>(null)
  const [bulkRenewOpen, setBulkRenewOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await getJson<DashboardResponse>('/api/renewals/dashboard')
    if (res.ok) setData(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [message])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const items = useMemo(() => data?.items ?? [], [data])
  const tabSummary = useMemo(
    () => summarizeDashboard(filterDashboardItems(items, filters, { ignoreType: true })),
    [items, filters],
  )
  const visible = useMemo(() => filterDashboardItems(items, filters), [items, filters])
  const summary = useMemo(() => summarizeDashboard(visible), [visible])
  const ownerOptions = useMemo(
    () =>
      [...new Set(items.map((i) => i.vehicle.ownerName))]
        .sort((a, b) => a.localeCompare(b, 'th'))
        .map((o) => ({ value: o, label: o })),
    [items],
  )
  const selectedItems = useMemo(() => items.filter((i) => selectedIds.includes(i.id)), [items, selectedIds])
  const canBulkRenew = selectedItems.length > 0 && new Set(selectedItems.map((i) => i.type)).size === 1

  const afterChange = () => {
    setSelectedIds([])
    setRenewing(null)
    setNotRenewIds(null)
    setNoteItem(null)
    setBulkRenewOpen(false)
    fetchData()
  }

  const updateStatus = async (ids: string[], status: 'PENDING' | 'IN_PROGRESS') => {
    const res = await sendJson('/api/renewals/coverages/bulk-status', { ids, status })
    if (res.ok) {
      message.success('บันทึกสำเร็จ')
      afterChange()
    } else {
      message.error(res.error)
    }
  }

  const confirmBulkInProgress = () => {
    modal.confirm({
      title: 'เปลี่ยนเป็น "กำลังดำเนินการ"',
      content: `${selectedIds.length} รายการ`,
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: () => updateStatus(selectedIds, 'IN_PROGRESS'),
    })
  }

  const columns: TableColumnsType<DashboardItemDto> = [
    { title: 'เบอร์รถ', key: 'fleet', width: 90, render: (_, r) => r.vehicle.fleetNumber ?? '-' },
    {
      title: 'ทะเบียน',
      key: 'plate',
      width: 150,
      render: (_, r) => (
        <Space size={4}>
          <Link href={`/renewals/vehicles/${r.vehicleId}`}>{r.vehicle.plate}</Link>
          {r.vehicle.status === 'SUSPENDED' && <Tag color="gold">งดใช้</Tag>}
        </Space>
      ),
    },
    { title: 'ลักษณะ', key: 'vehicleType', width: 100, render: (_, r) => r.vehicle.vehicleType },
    { title: 'บริษัท', key: 'owner', width: 150, render: (_, r) => r.vehicle.ownerName },
    { title: 'ประเภท', key: 'type', width: 110, render: (_, r) => COVERAGE_TYPE_LABELS[r.type] },
    { title: 'บ.ประกัน', key: 'insurer', width: 150, render: (_, r) => r.insurerName ?? '-' },
    { title: 'เลขกรมธรรม์', key: 'policyNumber', width: 160, render: (_, r) => r.policyNumber ?? '-' },
    {
      title: 'วันหมด',
      key: 'endDate',
      width: 100,
      render: (_, r) => (
        <Tag color={DUE_BUCKET_COLORS[r.bucket]} data-testid={`due-tag-${r.id}`}>
          {toThaiShortDate(r.endDate)}
        </Tag>
      ),
    },
    { title: 'เบี้ย/ภาษี', key: 'amount', width: 110, align: 'right', render: (_, r) => money(r.amount) },
    { title: 'ค่าบริการ', key: 'serviceFee', width: 100, align: 'right', render: (_, r) => money(r.serviceFee) },
    {
      title: 'สถานะ',
      key: 'status',
      width: 130,
      render: (_, r) => (
        <Tag color={RENEWAL_STATUS_COLORS[r.renewalStatus]} data-testid={`status-tag-${r.id}`}>
          {RENEWAL_STATUS_LABELS[r.renewalStatus]}
        </Tag>
      ),
    },
    {
      title: 'หมายเหตุ',
      key: 'note',
      width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setNoteItem(r)} data-testid={`note-btn-${r.id}`} />
          <span>{r.renewalNote}</span>
        </Space>
      ),
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setRenewing(r)} data-testid={`renew-btn-${r.id}`}>
            ต่อแล้ว
          </Button>
          <Button size="small" danger icon={<CloseOutlined />} onClick={() => setNotRenewIds([r.id])} data-testid={`not-renew-btn-${r.id}`}>
            ไม่ต่อ
          </Button>
          <Button
            size="small"
            onClick={() => updateStatus([r.id], r.renewalStatus === 'PENDING' ? 'IN_PROGRESS' : 'PENDING')}
            data-testid={`status-toggle-btn-${r.id}`}
          >
            {r.renewalStatus === 'PENDING' ? 'เริ่มดำเนินการ' : 'กลับเป็นรอต่อ'}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>ต่ออายุรถ</h2>
        <Space>
          {data && <span style={{ color: '#888' }}>แสดงงวดที่หมดภายใน {toThaiShortDate(endOfNextMonth(data.today))}</span>}
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            รีเฟรช
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {CARDS.map((c) => (
          <Col key={c.key} xs={12} md={6}>
            <Card size="small" data-testid={`count-${c.key}`}>
              <Statistic
                title={c.title}
                value={c.key === 'IN_PROGRESS' ? summary.inProgress : summary.buckets[c.key]}
                valueStyle={{ color: c.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Tabs
        activeKey={filters.type}
        onChange={(key) => setFilters({ ...filters, type: key as CoverageTypeKey | 'ALL' })}
        items={[
          { key: 'ALL', label: `ทั้งหมด (${tabSummary.byType.ALL})` },
          ...COVERAGE_TYPES.map((t) => ({ key: t, label: `${COVERAGE_TYPE_LABELS[t]} (${tabSummary.byType[t]})` })),
        ]}
      />

      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select
            id="dashboard-owner-filter"
            allowClear
            placeholder="บริษัท"
            style={{ width: 200 }}
            options={ownerOptions}
            value={filters.owner}
            onChange={(owner) => setFilters({ ...filters, owner })}
          />
        </Col>
        <Col>
          <Select
            id="dashboard-status-filter"
            allowClear
            placeholder="สถานะ"
            style={{ width: 160 }}
            options={[
              { value: 'PENDING', label: RENEWAL_STATUS_LABELS.PENDING },
              { value: 'IN_PROGRESS', label: RENEWAL_STATUS_LABELS.IN_PROGRESS },
            ]}
            value={filters.status}
            onChange={(status) => setFilters({ ...filters, status: status as DashboardFilters['status'] })}
          />
        </Col>
        <Col>
          <Input
            allowClear
            placeholder="ค้นหาทะเบียน/เบอร์รถ"
            style={{ width: 220 }}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </Col>
      </Row>

      {selectedIds.length > 0 && (
        <Space style={{ marginBottom: 12 }}>
          <span>เลือก {selectedIds.length} รายการ</span>
          <Button onClick={confirmBulkInProgress} data-testid="bulk-in-progress-btn">
            กำลังดำเนินการ
          </Button>
          <Tooltip title={canBulkRenew ? '' : 'ต่อแล้วหลายรายการได้เฉพาะประเภทเดียวกัน'}>
            <Button type="primary" disabled={!canBulkRenew} onClick={() => setBulkRenewOpen(true)} data-testid="bulk-renew-btn">
              ต่อแล้ว
            </Button>
          </Tooltip>
          <Button danger onClick={() => setNotRenewIds(selectedIds)} data-testid="bulk-not-renew-btn">
            ไม่ต่อ
          </Button>
          <Button type="link" onClick={() => setSelectedIds([])}>
            ล้างที่เลือก
          </Button>
        </Space>
      )}

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={visible}
        columns={columns}
        scroll={{ x: 1700 }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as string[]),
          preserveSelectedRowKeys: true,
        }}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        footer={() => (
          <span data-testid="dashboard-totals">
            รวมเบี้ย/ภาษี {money(summary.totals.amount)} บาท · ค่าบริการ {money(summary.totals.serviceFee)} บาท ({visible.length} รายการ)
          </span>
        )}
      />

      <RenewModal item={renewing} insurers={insurers} vehicles={vehicles} onClose={() => setRenewing(null)} onDone={afterChange} />
      <NotRenewModal ids={notRenewIds} onClose={() => setNotRenewIds(null)} onDone={afterChange} />
      <NoteModal item={noteItem} onClose={() => setNoteItem(null)} onDone={afterChange} />
      <BulkRenewModal
        open={bulkRenewOpen}
        items={selectedItems}
        insurers={insurers}
        onClose={() => setBulkRenewOpen(false)}
        onDone={afterChange}
      />
    </>
  )
}
```

`app/(protected)/renewals/page.tsx` — แทนที่ทั้งไฟล์:

```tsx
import RenewalDashboard from '@/components/renewals/RenewalDashboard'

export default function RenewalsPage() {
  return <RenewalDashboard />
}
```

- [ ] **Step 9: e2e**

`e2e/renewals/helpers.ts` — ต่อท้ายไฟล์:

```ts
/** 'YYYY-MM-DD' → 'DD/MM/YYYY' ตาม format ของ DatePicker */
export function toPickerText(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

export async function fillDate(page: Page, selector: string, ymd: string) {
  await page.locator(selector).fill(toPickerText(ymd))
  await page.locator(selector).press('Tab')
}
```

`e2e/renewals/dashboard.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import { addDays, addYears, todayInBangkok } from '../../lib/renewals/dateOnly'
import { endOfNextMonth } from '../../lib/renewals/dueWindow'
import {
  cleanupRenewals,
  createCoverage,
  createInsurer,
  createVehicle,
  getVehicleDetail,
  login,
  toPickerText,
} from './helpers'

const countOf = (page: Page, key: string) => page.getByTestId(`count-${key}`).locator('.ant-statistic-content-value')
const rowOf = (page: Page, id: string) => page.locator(`tr[data-row-key="${id}"]`)

test.describe.serial('Dashboard ต่ออายุรถ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('แสดงเฉพาะงวดที่หมดภายในสิ้นเดือนหน้า แยกสีตามช่วง (ค้นหาทะเบียนแบบมีจุดท้ายได้)', async ({ page }) => {
    const today = todayInBangkok()
    const vid = await createVehicle(page, 'E2E-3001 กท')
    const overdue = await createCoverage(page, vid, 'PRB', addDays(today, -5))
    const thisMonth = await createCoverage(page, vid, 'TAX', today)
    const nextMonth = await createCoverage(page, vid, 'MOTOR_INSURANCE', endOfNextMonth(today))
    const later = await createCoverage(page, vid, 'CARGO_INSURANCE', addDays(endOfNextMonth(today), 1))

    await page.reload()
    await page.getByPlaceholder('ค้นหาทะเบียน/เบอร์รถ').fill('E2E-3001 กท.')
    await expect(countOf(page, 'OVERDUE')).toHaveText('1')
    await expect(countOf(page, 'THIS_MONTH')).toHaveText('1')
    await expect(countOf(page, 'NEXT_MONTH')).toHaveText('1')
    await expect(page.getByTestId(`due-tag-${overdue}`)).toHaveClass(/ant-tag-red/)
    await expect(page.getByTestId(`due-tag-${thisMonth}`)).toHaveClass(/ant-tag-orange/)
    await expect(page.getByTestId(`due-tag-${nextMonth}`)).toHaveClass(/ant-tag-blue/)
    await expect(rowOf(page, later)).toHaveCount(0)
  })

  test('ต่อแล้วทีละคัน: ค่าเริ่มต้นมาจากงวดเดิม และรายการหายจาก dashboard', async ({ page }) => {
    const today = todayInBangkok()
    const insurerId = await createInsurer(page, 'E2E ประกันภัย D')
    const vid = await createVehicle(page, 'E2E-3002 กท')
    const cid = await createCoverage(page, vid, 'MOTOR_INSURANCE', today, { insurerId, coverageClass: 'ป.3', amount: 19900 })

    await page.reload()
    await page.getByTestId(`renew-btn-${cid}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('#coverage-amount')).toHaveValue('19900.00')
    await expect(dialog.locator('#coverage-end-date')).toHaveValue(toPickerText(addYears(today, 1)))
    await dialog.getByTestId('coverage-policy-input').fill('E2E-POL-1')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    await expect(rowOf(page, cid)).toHaveCount(0)
    const renewed = (await getVehicleDetail(page, vid)).coverages.find((c) => c.id !== cid)
    expect(renewed).toMatchObject({
      policyNumber: 'E2E-POL-1',
      insurerId,
      coverageClass: 'ป.3',
      amount: 19900,
      startDate: addDays(today, 1),
      endDate: addYears(today, 1),
    })
  })

  test('ไม่ต่อพร้อมเหตุผล → รายการหายจาก dashboard', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-3003 กท')
    const cid = await createCoverage(page, vid, 'TAX', todayInBangkok())

    await page.reload()
    await page.getByTestId(`not-renew-btn-${cid}`).click()
    await page.locator('#not-renew-reason').click()
    await page.locator('.ant-select-item-option', { hasText: 'รถซ่อม' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()

    await expect(rowOf(page, cid)).toHaveCount(0)
    expect((await getVehicleDetail(page, vid)).coverages[0]).toMatchObject({
      renewalStatus: 'NOT_RENEWED',
      notRenewedReason: 'REPAIR',
    })
  })

  test('เลือกหลายแถว: กำลังดำเนินการ แล้วต่อแล้วพร้อมกัน', async ({ page }) => {
    const today = todayInBangkok()
    const c1 = await createCoverage(page, await createVehicle(page, 'E2E-3104 กท'), 'PRB', today)
    const c2 = await createCoverage(page, await createVehicle(page, 'E2E-3105 กท'), 'PRB', today)

    await page.reload()
    await page.getByPlaceholder('ค้นหาทะเบียน/เบอร์รถ').fill('E2E-310')
    for (const id of [c1, c2]) await rowOf(page, id).locator('.ant-checkbox-input').check()
    await page.getByTestId('bulk-in-progress-btn').click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    for (const id of [c1, c2]) await expect(page.getByTestId(`status-tag-${id}`)).toHaveText('กำลังดำเนินการ')
    await expect(countOf(page, 'IN_PROGRESS')).toHaveText('2')

    for (const id of [c1, c2]) await rowOf(page, id).locator('.ant-checkbox-input').check()
    await page.getByTestId('bulk-renew-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('#bulk-renew-end-date')).toHaveValue(toPickerText(addYears(today, 1)))
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    for (const id of [c1, c2]) await expect(rowOf(page, id)).toHaveCount(0)
  })
})
```

- [ ] **Step 10: รันทดสอบ**

Run: `npx tsx --test lib/renewals/__tests__/*.test.ts` → PASS
Run: `npx playwright test e2e/renewals/dashboard.spec.ts e2e/renewals/access.spec.ts --workers=1` → PASS
Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

- [ ] **Step 11: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/renewals/dashboardFilter.ts lib/renewals/__tests__/dashboardFilter.test.ts app/api/renewals/dashboard components/renewals "app/(protected)/renewals/page.tsx" e2e/renewals/helpers.ts e2e/renewals/dashboard.spec.ts
git commit -m "$(cat <<'EOF'
feat(renewals): dashboard รายเดือน พร้อมต่อแล้ว/ไม่ต่อ/หมายเหตุ ทีละรายการและหลายรายการ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: หน้าทะเบียนรถ + รายละเอียดรถ/ประวัติงวด

**Files:**
- Create: `components/renewals/VehicleList.tsx`, `VehicleFormModal.tsx`, `VehicleDetail.tsx`, `CoverageFormModal.tsx`
- Create: `app/(protected)/renewals/vehicles/page.tsx`, `app/(protected)/renewals/vehicles/[id]/page.tsx`
- Create: `e2e/renewals/vehicles-ui.spec.ts`

**Interfaces:**
- Consumes: API รถ/งวด (Task 6–7), `CoveragePeriodFields`, `coverageForm`, `useRenewalLookups` (Task 8)
- Produces:
  - `<VehicleFormModal vehicle={VehicleDto | 'new' | null} ownerOptions typeOptions onClose onSaved />` — testid `vehicle-plate-input`, `vehicle-fleet-input`; id `vehicle-owner`, `vehicle-type`, `vehicle-weight`, `vehicle-status`, `vehicle-status-date`
  - `<VehicleDetail id />` — testid `vehicle-detail-edit-btn`, `vehicle-detail-delete-btn`, `coverage-add-btn`, `coverage-status-{id}`, `coverage-edit-btn-{id}`, `coverage-reopen-btn-{id}`, `coverage-delete-btn-{id}`; Task 10 เพิ่มคอลัมน์ไฟล์
  - `<CoverageFormModal open vehicleId type coverage insurers vehicles onClose onSaved />`
  - หน้า list testid `vehicle-add-btn`, `vehicle-link-{id}`, `vehicle-edit-btn-{id}`

- [ ] **Step 1: เขียน e2e ที่ fail**

`e2e/renewals/vehicles-ui.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { cleanupRenewals, createCoverage, createVehicle, fillDate, getVehicleDetail, login } from './helpers'

test.describe.serial('หน้าทะเบียนรถ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('เพิ่มรถผ่านหน้าจอ: ทะเบียน normalize และกดเข้าไปดูรายละเอียดได้', async ({ page }) => {
    await page.goto('/renewals/vehicles')
    await page.getByTestId('vehicle-add-btn').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('vehicle-plate-input').fill(' E2E-5001  กท. ')
    await page.locator('#vehicle-owner').fill('E2E บริษัท')
    await page.locator('#vehicle-type').fill('ลากจูง')
    await dialog.locator('.ant-modal-title').click() // ปิด dropdown ของ AutoComplete
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    const link = page.getByRole('link', { name: 'E2E-5001 กท', exact: true })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page.getByRole('heading', { name: 'E2E-5001 กท' })).toBeVisible()
  })

  test('เพิ่มงวดจากหน้ารถ → งวดใหม่กว่าทำให้งวดเก่าเป็นต่อแล้ว → ลบงวดใหม่ → กลับเป็นรอต่อ', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5002 กท')
    await page.goto(`/renewals/vehicles/${vid}`)

    await page.getByTestId('coverage-add-btn').click() // แท็บเริ่มต้น = พรบ.
    await fillDate(page, '#coverage-end-date', '2026-03-31')
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
    await expect.poll(async () => (await getVehicleDetail(page, vid)).coverages.length).toBe(1)
    const oldId = (await getVehicleDetail(page, vid)).coverages[0].id
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('รอต่อ')

    await page.getByTestId('coverage-add-btn').click()
    await fillDate(page, '#coverage-end-date', '2027-03-31')
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('ต่อแล้ว')

    const newId = (await getVehicleDetail(page, vid)).coverages.find((c) => c.id !== oldId)!.id
    await page.getByTestId(`coverage-delete-btn-${newId}`).click()
    await page.getByRole('button', { name: 'ลบ', exact: true }).click()
    await expect(page.getByTestId(`coverage-status-${oldId}`)).toHaveText('รอต่อ')
  })

  test('เปลี่ยนรถเป็นขาย (ยืนยัน) → งวดเปิดเป็นไม่ต่อ (ขายรถ)', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5003 กท')
    const cid = await createCoverage(page, vid, 'PRB', '2027-03-31')
    await page.goto(`/renewals/vehicles/${vid}`)

    await page.getByTestId('vehicle-detail-edit-btn').click()
    await page.locator('#vehicle-status').click()
    await page.locator('.ant-select-item-option', { hasText: 'ขาย' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(page.getByTestId(`coverage-status-${cid}`)).toHaveText('ไม่ต่อ (ขายรถ)')
  })

  test('งวดไม่ต่อของรถที่ใช้งาน → เปิดใหม่ได้', async ({ page }) => {
    const vid = await createVehicle(page, 'E2E-5004 กท')
    const cid = await createCoverage(page, vid, 'TAX', '2027-06-30')
    await page.request.post('/api/renewals/coverages/bulk-status', {
      data: { ids: [cid], status: 'NOT_RENEWED', reason: 'REPAIR' },
    })
    await page.goto(`/renewals/vehicles/${vid}`)
    await page.getByRole('tab', { name: /ภาษี/ }).click()
    await page.getByTestId(`coverage-reopen-btn-${cid}`).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(page.getByTestId(`coverage-status-${cid}`)).toHaveText('รอต่อ')
  })
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx playwright test e2e/renewals/vehicles-ui.spec.ts --workers=1`
Expected: FAIL — หน้า `/renewals/vehicles` ยังไม่มี (404)

- [ ] **Step 3: `components/renewals/VehicleFormModal.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { App, AutoComplete, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd'
import { VEHICLE_STATUSES, VEHICLE_STATUS_LABELS, type VehicleStatusKey } from '@/lib/renewals/constants'
import type { VehicleDto } from '@/types/renewals'
import { sendJson } from './api'
import { DATE_FORMAT } from './coverageForm'

interface Props {
  vehicle: VehicleDto | 'new' | null
  ownerOptions: string[]
  typeOptions: string[]
  onClose: () => void
  onSaved: (vehicle: VehicleDto) => void
}

interface Values {
  plate: string
  fleetNumber?: string
  ownerName: string
  vehicleType: string
  brand?: string
  chassisNumber?: string
  fuelType?: string
  weightKg?: number | null
  status: VehicleStatusKey
  statusDate?: Dayjs | null
  note?: string
}

const orUndefined = (v: string | null) => v ?? undefined
const autoOptions = (values: string[]) => values.map((value) => ({ value }))
const containsFilter = (input: string, option?: { value?: unknown }) => String(option?.value ?? '').includes(input)

export default function VehicleFormModal({ vehicle, ownerOptions, typeOptions, onClose, onSaved }: Props) {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const isNew = vehicle === 'new'

  const initialValues = useMemo<Partial<Values>>(() => {
    if (vehicle === null || vehicle === 'new') return { status: 'ACTIVE' }
    return {
      plate: vehicle.plate,
      fleetNumber: orUndefined(vehicle.fleetNumber),
      ownerName: vehicle.ownerName,
      vehicleType: vehicle.vehicleType,
      brand: orUndefined(vehicle.brand),
      chassisNumber: orUndefined(vehicle.chassisNumber),
      fuelType: orUndefined(vehicle.fuelType),
      weightKg: vehicle.weightKg,
      status: vehicle.status,
      statusDate: vehicle.statusDate ? dayjs(vehicle.statusDate) : null,
      note: orUndefined(vehicle.note),
    }
  }, [vehicle])

  const save = async (values: Values) => {
    const body = {
      ...values,
      weightKg: values.weightKg ?? null,
      statusDate: values.statusDate ? values.statusDate.format('YYYY-MM-DD') : null,
    }
    setSaving(true)
    const res =
      vehicle === 'new' || vehicle === null
        ? await sendJson<VehicleDto>('/api/renewals/vehicles', body)
        : await sendJson<VehicleDto>(`/api/renewals/vehicles/${vehicle.id}`, body, 'PATCH')
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกสำเร็จ')
    onSaved(res.data)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    const becomesSold = vehicle !== null && vehicle !== 'new' && values.status === 'SOLD' && vehicle.status !== 'SOLD'
    if (!becomesSold) {
      await save(values)
      return
    }
    modal.confirm({
      title: 'เปลี่ยนสถานะเป็น "ขาย"',
      content: 'งวดที่ยังเปิดอยู่ของรถคันนี้จะถูกปิดเป็น "ไม่ต่อ (ขายรถ)"',
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: () => save(values),
    })
  }

  return (
    <Modal
      open={vehicle !== null}
      title={isNew ? 'เพิ่มรถ' : 'แก้ไขรถ'}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      width={640}
      destroyOnHidden
    >
      {vehicle !== null && (
        <Form key={isNew ? 'new' : (vehicle as VehicleDto).id} form={form} layout="vertical" initialValues={initialValues}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="plate" label="ทะเบียน" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกทะเบียน' }]}>
                <Input data-testid="vehicle-plate-input" maxLength={30} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fleetNumber" label="เบอร์รถ">
                <Input data-testid="vehicle-fleet-input" maxLength={50} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ownerName" label="บริษัท" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกบริษัท' }]}>
                <AutoComplete id="vehicle-owner" options={autoOptions(ownerOptions)} filterOption={containsFilter} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="vehicleType" label="ลักษณะ" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกลักษณะรถ' }]}>
                <AutoComplete id="vehicle-type" options={autoOptions(typeOptions)} filterOption={containsFilter} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="brand" label="ยี่ห้อ">
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fuelType" label="เชื้อเพลิง">
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="weightKg" label="น้ำหนัก (กก.)">
                <InputNumber id="vehicle-weight" min={0} max={100000} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="chassisNumber" label="เลขตัวถัง">
            <Input maxLength={100} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="status" label="สถานะ">
                <Select id="vehicle-status" options={VEHICLE_STATUSES.map((s) => ({ value: s, label: VEHICLE_STATUS_LABELS[s] }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="statusDate" label="วันที่สถานะ (แจ้ง ม.79 / ม.89)">
                <DatePicker id="vehicle-status-date" format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="หมายเหตุ">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
```

- [ ] **Step 4: `components/renewals/VehicleList.tsx` + หน้า**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { App, Button, Col, Input, Row, Select, Table, Tag, type TableColumnsType } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_COLORS,
  VEHICLE_STATUS_LABELS,
  type VehicleStatusKey,
} from '@/lib/renewals/constants'
import { normalizePlate } from '@/lib/renewals/plate'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { VehicleDto, VehicleListItemDto } from '@/types/renewals'
import { getJson } from './api'
import VehicleFormModal from './VehicleFormModal'

const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'th'))

export default function VehicleList() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<VehicleListItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [owner, setOwner] = useState<string>()
  const [status, setStatus] = useState<VehicleStatusKey>()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<VehicleDto | 'new' | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await getJson<VehicleListItemDto[]>('/api/renewals/vehicles')
    if (res.ok) setRows(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [message])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const ownerOptions = useMemo(() => uniqueSorted(rows.map((r) => r.ownerName)), [rows])
  const typeOptions = useMemo(() => uniqueSorted(rows.map((r) => r.vehicleType)), [rows])
  const filtered = useMemo(() => {
    const query = normalizePlate(q).toLowerCase()
    return rows.filter(
      (r) =>
        (!owner || r.ownerName === owner) &&
        (!status || r.status === status) &&
        (!query || r.plate.toLowerCase().includes(query) || (r.fleetNumber ?? '').toLowerCase().includes(query)),
    )
  }, [rows, owner, status, q])

  const columns: TableColumnsType<VehicleListItemDto> = [
    { title: 'เบอร์รถ', key: 'fleetNumber', width: 100, render: (_, r) => r.fleetNumber ?? '-' },
    {
      title: 'ทะเบียน',
      key: 'plate',
      width: 140,
      render: (_, r) => (
        <Link href={`/renewals/vehicles/${r.id}`} data-testid={`vehicle-link-${r.id}`}>
          {r.plate}
        </Link>
      ),
    },
    { title: 'บริษัท', dataIndex: 'ownerName', key: 'ownerName', width: 160 },
    { title: 'ลักษณะ', dataIndex: 'vehicleType', key: 'vehicleType', width: 120 },
    { title: 'ยี่ห้อ', key: 'brand', width: 100, render: (_, r) => r.brand ?? '-' },
    {
      title: 'สถานะ',
      key: 'status',
      width: 90,
      render: (_, r) => <Tag color={VEHICLE_STATUS_COLORS[r.status]}>{VEHICLE_STATUS_LABELS[r.status]}</Tag>,
    },
    ...COVERAGE_TYPES.map((t) => ({
      title: COVERAGE_TYPE_LABELS[t],
      key: t,
      width: 110,
      render: (_: unknown, r: VehicleListItemDto) => toThaiShortDate(r.latestEndDates[t]) || '-',
    })),
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, r) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} data-testid={`vehicle-edit-btn-${r.id}`} />
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>ทะเบียนรถ</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} data-testid="vehicle-add-btn">
          เพิ่มรถ
        </Button>
      </div>
      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select
            id="vehicle-owner-filter"
            allowClear
            placeholder="บริษัท"
            style={{ width: 200 }}
            options={ownerOptions.map((o) => ({ value: o, label: o }))}
            value={owner}
            onChange={(v) => setOwner(v as string | undefined)}
          />
        </Col>
        <Col>
          <Select
            id="vehicle-status-filter"
            allowClear
            placeholder="สถานะ"
            style={{ width: 140 }}
            options={VEHICLE_STATUSES.map((s) => ({ value: s, label: VEHICLE_STATUS_LABELS[s] }))}
            value={status}
            onChange={(v) => setStatus(v as VehicleStatusKey | undefined)}
          />
        </Col>
        <Col>
          <Input allowClear placeholder="ค้นหาทะเบียน/เบอร์รถ" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} />
        </Col>
      </Row>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        columns={columns}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />
      <VehicleFormModal
        vehicle={editing}
        ownerOptions={ownerOptions}
        typeOptions={typeOptions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          fetchRows()
        }}
      />
    </>
  )
}
```

`app/(protected)/renewals/vehicles/page.tsx`:

```tsx
import VehicleList from '@/components/renewals/VehicleList'

export default function VehiclesPage() {
  return <VehicleList />
}
```

- [ ] **Step 5: `components/renewals/CoverageFormModal.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { App, Form, Modal } from 'antd'
import { COVERAGE_TYPE_LABELS, type CoverageTypeKey } from '@/lib/renewals/constants'
import type { CoverageDto, InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { sendJson } from './api'
import CoveragePeriodFields from './CoveragePeriodFields'
import { dtoToFormValues, formValuesToBody, type CoverageFormValues } from './coverageForm'

interface Props {
  open: boolean
  vehicleId: string
  /** ประเภทของงวดใหม่ (ตอนแก้ใช้ประเภทของงวดเดิม) */
  type: CoverageTypeKey
  coverage: CoverageDto | null
  insurers: InsurerDto[]
  vehicles: VehicleListItemDto[]
  onClose: () => void
  onSaved: () => void
}

export default function CoverageFormModal({ open, vehicleId, type, coverage, insurers, vehicles, onClose, onSaved }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<CoverageFormValues>()
  const [saving, setSaving] = useState(false)
  const effectiveType = coverage?.type ?? type

  const handleOk = async () => {
    const body = formValuesToBody(await form.validateFields())
    setSaving(true)
    const res = coverage
      ? await sendJson(`/api/renewals/coverages/${coverage.id}`, body, 'PATCH')
      : await sendJson('/api/renewals/coverages', { ...body, vehicleId, type: effectiveType })
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกสำเร็จ')
    onSaved()
  }

  return (
    <Modal
      open={open}
      title={`${coverage ? 'แก้ไข' : 'เพิ่ม'}งวด${COVERAGE_TYPE_LABELS[effectiveType]}`}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {open && (
        <Form
          key={coverage?.id ?? `new-${effectiveType}`}
          form={form}
          layout="vertical"
          initialValues={coverage ? dtoToFormValues(coverage) : {}}
        >
          <CoveragePeriodFields
            type={effectiveType}
            insurers={insurers}
            vehicles={vehicles}
            vehicleId={vehicleId}
            currentInsurerId={coverage?.insurerId}
          />
        </Form>
      )}
    </Modal>
  )
}
```

- [ ] **Step 6: `components/renewals/VehicleDetail.tsx` + หน้า**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { App, Button, Descriptions, Space, Spin, Table, Tabs, Tag, type TableColumnsType } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons'
import {
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  NOT_RENEWED_REASON_LABELS,
  RENEWAL_STATUS_COLORS,
  RENEWAL_STATUS_LABELS,
  VEHICLE_STATUS_COLORS,
  VEHICLE_STATUS_LABELS,
  type CoverageTypeKey,
} from '@/lib/renewals/constants'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { CoverageDto, VehicleDetailResponse } from '@/types/renewals'
import { getJson, sendJson } from './api'
import CoverageFormModal from './CoverageFormModal'
import { useRenewalLookups } from './useRenewalLookups'
import VehicleFormModal from './VehicleFormModal'

const money = (v: number | null) =>
  v === null ? '-' : v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function VehicleDetail({ id }: { id: string }) {
  const { message, modal } = App.useApp()
  const router = useRouter()
  const { insurers, vehicles } = useRenewalLookups()
  const [detail, setDetail] = useState<VehicleDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeType, setActiveType] = useState<CoverageTypeKey>('PRB')
  const [editingVehicle, setEditingVehicle] = useState(false)
  const [coverageForm, setCoverageForm] = useState<{ coverage: CoverageDto | null } | null>(null)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    const res = await getJson<VehicleDetailResponse>(`/api/renewals/vehicles/${id}`)
    if (res.ok) setDetail(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [id, message])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  const ownerOptions = useMemo(() => [...new Set(vehicles.map((v) => v.ownerName))], [vehicles])
  const typeOptions = useMemo(() => [...new Set(vehicles.map((v) => v.vehicleType))], [vehicles])

  const confirmAction = (title: string, content: string, okText: string, run: () => Promise<{ ok: boolean; error?: string }>, after: () => void) => {
    modal.confirm({
      title,
      content,
      okText,
      cancelText: 'ยกเลิก',
      okButtonProps: { danger: okText === 'ลบ' },
      onOk: async () => {
        const res = await run()
        if (res.ok) {
          message.success('บันทึกสำเร็จ')
          after()
        } else {
          message.error(res.error)
        }
      },
    })
  }

  const handleDeleteVehicle = () =>
    confirmAction('ลบรถ', detail?.vehicle.plate ?? '', 'ลบ', () => sendJson(`/api/renewals/vehicles/${id}`, undefined, 'DELETE'), () =>
      router.push('/renewals/vehicles'),
    )

  const handleDeleteCoverage = (c: CoverageDto) =>
    confirmAction(
      'ลบงวด',
      `${COVERAGE_TYPE_LABELS[c.type]} หมด ${toThaiShortDate(c.endDate)} — ถ้างวดนี้ต่อมาจากงวดก่อนหน้า งวดก่อนหน้าจะกลับเป็น "รอต่อ"`,
      'ลบ',
      () => sendJson(`/api/renewals/coverages/${c.id}`, undefined, 'DELETE'),
      fetchDetail,
    )

  const handleReopen = (c: CoverageDto) =>
    confirmAction('เปิดงวดนี้ใหม่', 'สถานะจะกลับเป็น "รอต่อ"', 'ยืนยัน', () => sendJson(`/api/renewals/coverages/${c.id}/reopen`), fetchDetail)

  const columns: TableColumnsType<CoverageDto> = [
    { title: 'วันเริ่ม', key: 'startDate', width: 90, render: (_, c) => toThaiShortDate(c.startDate) || '-' },
    { title: 'วันสิ้นสุด', key: 'endDate', width: 90, render: (_, c) => toThaiShortDate(c.endDate) },
    ...(activeType === 'TAX'
      ? []
      : [{ title: 'บ.ประกัน', key: 'insurer', render: (_: unknown, c: CoverageDto) => c.insurerName ?? '-' }]),
    ...(activeType === 'MOTOR_INSURANCE'
      ? [
          { title: 'ชั้น', key: 'class', width: 70, render: (_: unknown, c: CoverageDto) => c.coverageClass ?? '-' },
          { title: 'หางคู่', key: 'paired', width: 120, render: (_: unknown, c: CoverageDto) => c.pairedPlate ?? '-' },
        ]
      : []),
    { title: 'เลขกรมธรรม์', key: 'policy', render: (_, c) => c.policyNumber ?? '-' },
    { title: 'เบี้ย/ภาษี', key: 'amount', width: 110, align: 'right', render: (_, c) => money(c.amount) },
    { title: 'ค่าบริการ', key: 'fee', width: 100, align: 'right', render: (_, c) => money(c.serviceFee) },
    {
      title: 'สถานะ',
      key: 'status',
      width: 170,
      render: (_, c) => (
        <Tag color={RENEWAL_STATUS_COLORS[c.renewalStatus]} data-testid={`coverage-status-${c.id}`}>
          {RENEWAL_STATUS_LABELS[c.renewalStatus]}
          {c.notRenewedReason ? ` (${NOT_RENEWED_REASON_LABELS[c.notRenewedReason]})` : ''}
        </Tag>
      ),
    },
    { title: 'หมายเหตุ', key: 'note', ellipsis: true, render: (_, c) => c.renewalNote },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 120,
      render: (_, c) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setCoverageForm({ coverage: c })} data-testid={`coverage-edit-btn-${c.id}`} />
          {c.renewalStatus === 'NOT_RENEWED' && (
            <Button type="link" size="small" icon={<RollbackOutlined />} onClick={() => handleReopen(c)} data-testid={`coverage-reopen-btn-${c.id}`} />
          )}
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteCoverage(c)} data-testid={`coverage-delete-btn-${c.id}`} />
        </Space>
      ),
    },
  ]

  if (!detail) return <Spin spinning={loading} />

  const { vehicle, coverages } = detail
  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Link href="/renewals/vehicles">← ทะเบียนรถ</Link>
          <h2 style={{ margin: 0 }}>{vehicle.plate}</h2>
          <Tag color={VEHICLE_STATUS_COLORS[vehicle.status]}>{VEHICLE_STATUS_LABELS[vehicle.status]}</Tag>
        </Space>
        <Space>
          <Button icon={<EditOutlined />} onClick={() => setEditingVehicle(true)} data-testid="vehicle-detail-edit-btn">
            แก้ไขรถ
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleDeleteVehicle} data-testid="vehicle-detail-delete-btn">
            ลบรถ
          </Button>
        </Space>
      </div>

      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, md: 3 }}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'fleet', label: 'เบอร์รถ', children: vehicle.fleetNumber ?? '-' },
          { key: 'owner', label: 'บริษัท', children: vehicle.ownerName },
          { key: 'type', label: 'ลักษณะ', children: vehicle.vehicleType },
          { key: 'brand', label: 'ยี่ห้อ', children: vehicle.brand ?? '-' },
          { key: 'chassis', label: 'เลขตัวถัง', children: vehicle.chassisNumber ?? '-' },
          { key: 'fuel', label: 'เชื้อเพลิง', children: vehicle.fuelType ?? '-' },
          { key: 'weight', label: 'น้ำหนัก (กก.)', children: vehicle.weightKg?.toLocaleString('th-TH') ?? '-' },
          { key: 'statusDate', label: 'วันที่สถานะ', children: toThaiShortDate(vehicle.statusDate) || '-' },
          { key: 'note', label: 'หมายเหตุ', children: vehicle.note ?? '-' },
        ]}
      />

      <Tabs
        activeKey={activeType}
        onChange={(key) => setActiveType(key as CoverageTypeKey)}
        tabBarExtraContent={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCoverageForm({ coverage: null })} data-testid="coverage-add-btn">
            เพิ่มงวด
          </Button>
        }
        items={COVERAGE_TYPES.map((t) => ({
          key: t,
          label: `${COVERAGE_TYPE_LABELS[t]} (${coverages.filter((c) => c.type === t).length})`,
        }))}
      />
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={coverages.filter((c) => c.type === activeType)}
        pagination={false}
      />

      <VehicleFormModal
        vehicle={editingVehicle ? vehicle : null}
        ownerOptions={ownerOptions}
        typeOptions={typeOptions}
        onClose={() => setEditingVehicle(false)}
        onSaved={() => {
          setEditingVehicle(false)
          fetchDetail()
        }}
      />
      <CoverageFormModal
        open={coverageForm !== null}
        vehicleId={vehicle.id}
        type={activeType}
        coverage={coverageForm?.coverage ?? null}
        insurers={insurers}
        vehicles={vehicles}
        onClose={() => setCoverageForm(null)}
        onSaved={() => {
          setCoverageForm(null)
          fetchDetail()
        }}
      />
    </>
  )
}
```

`app/(protected)/renewals/vehicles/[id]/page.tsx`:

```tsx
import VehicleDetail from '@/components/renewals/VehicleDetail'

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <VehicleDetail id={id} />
}
```

- [ ] **Step 7: รันให้ผ่าน**

Run: `npx playwright test e2e/renewals/vehicles-ui.spec.ts --workers=1` → PASS 4 tests
Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

- [ ] **Step 8: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add components/renewals/VehicleList.tsx components/renewals/VehicleFormModal.tsx components/renewals/VehicleDetail.tsx components/renewals/CoverageFormModal.tsx "app/(protected)/renewals/vehicles" e2e/renewals/vehicles-ui.spec.ts
git commit -m "$(cat <<'EOF'
feat(renewals): หน้าทะเบียนรถและรายละเอียดรถพร้อมประวัติงวด

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: ไฟล์แนบ (API + หน้าจอ)

**Files:**
- Create: `app/api/renewals/coverages/[id]/attachments/route.ts`, `app/api/renewals/attachments/[id]/route.ts`
- Create: `components/renewals/uploadAttachments.ts`, `components/renewals/AttachmentsModal.tsx`
- Modify: `components/renewals/RenewModal.tsx` (แทนที่ทั้งไฟล์), `components/renewals/VehicleDetail.tsx`
- Modify: `next.config.js`, `playwright.config.ts`, `.gitignore`
- Create: `e2e/renewals/attachments.spec.ts`

**Interfaces:**
- Consumes: `validateAttachment`, `buildAttachmentKey`, `inlineContentDisposition`, `MAX_FILES_PER_UPLOAD`, `getAttachmentStorage`, `removeObjectsBestEffort` (Task 5); `toAttachmentDto` (Task 4)
- Produces:
  - `GET /api/renewals/coverages/[id]/attachments` → `AttachmentDto[]`; `POST` multipart field `files` → 201 `AttachmentDto[]`
  - `GET /api/renewals/attachments/[id]` → ไฟล์ (inline); `DELETE` → `{ success: true }`
  - `uploadAttachments(coverageId: string, files: File[]): Promise<{ ok: true } | { ok: false; error: string }>`
  - `<AttachmentsModal coverage onClose onChanged />` — testid `attachment-upload-btn`, `attachment-delete-btn-{id}`; VehicleDetail testid `attachments-btn-{coverageId}`; RenewModal testid `renew-attach-btn`

- [ ] **Step 1: ตั้งค่า**

`playwright.config.ts` — ใน `webServer.env` เพิ่มบรรทัดสุดท้าย:

```ts
      // ไฟล์แนบต่ออายุรถเก็บในโฟลเดอร์ .tmp แทน Spaces จริง
      ATTACHMENT_STORAGE:        'local',
```

`next.config.js` — ใน object `nextConfig` ต่อจาก `reactStrictMode: false,` เพิ่ม:

```js
  experimental: {
    // ไฟล์แนบต่ออายุรถ (≤ 10 MB) ผ่าน middleware — ค่าเริ่มต้น 10mb ไม่พอเมื่อรวม multipart overhead
    middlewareClientMaxBodySize: '12mb',
  },
```

`.gitignore` — ต่อท้ายไฟล์:

```
# ไฟล์แนบต่ออายุรถตอนรัน E2E (ATTACHMENT_STORAGE=local)
/.tmp
```

- [ ] **Step 2: เขียน e2e ที่ fail**

`e2e/renewals/attachments.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { todayInBangkok } from '../../lib/renewals/dateOnly'
import type { AttachmentDto } from '../../types/renewals'
import { cleanupRenewals, createCoverage, createVehicle, expectJson, getVehicleDetail, login } from './helpers'

// PNG 1x1
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

test.describe.serial('ไฟล์แนบ', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())

  test('แนบไฟล์ชื่อภาษาไทยจากหน้ารถ → เปิดดูได้ → STAFF ได้ 403 → ลบได้', async ({ page, browser }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const vid = await createVehicle(page, 'E2E-7001 กท')
    const cid = await createCoverage(page, vid, 'PRB', '2027-03-31')

    await page.goto(`/renewals/vehicles/${vid}`)
    await page.getByTestId(`attachments-btn-${cid}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles({ name: 'กรมธรรม์ 2569.png', mimeType: 'image/png', buffer: PNG })
    await expect(dialog.getByRole('link', { name: 'กรมธรรม์ 2569.png' })).toBeVisible()

    const [attachment] = await expectJson<AttachmentDto[]>(await page.request.get(`/api/renewals/coverages/${cid}/attachments`))
    const file = await page.request.get(`/api/renewals/attachments/${attachment.id}`)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toBe('image/png')
    expect(file.headers()['content-disposition']).toContain("filename*=UTF-8''")
    expect(Buffer.from(await file.body()).equals(PNG)).toBe(true)

    const staffContext = await browser.newContext()
    const staff = await staffContext.newPage()
    await login(staff, 'teststaff', /\/jobs/)
    expect((await staff.request.get(`/api/renewals/attachments/${attachment.id}`)).status()).toBe(403)
    await staffContext.close()

    await dialog.getByTestId(`attachment-delete-btn-${attachment.id}`).click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(dialog.getByRole('link', { name: 'กรมธรรม์ 2569.png' })).toHaveCount(0)
    expect(await expectJson<AttachmentDto[]>(await page.request.get(`/api/renewals/coverages/${cid}/attachments`))).toEqual([])
  })

  test('แนบไฟล์ตอนกดต่อแล้วจาก dashboard → ไฟล์ผูกกับงวดใหม่', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const vid = await createVehicle(page, 'E2E-7002 กท')
    const cid = await createCoverage(page, vid, 'TAX', todayInBangkok())

    await page.reload()
    await page.getByTestId(`renew-btn-${cid}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'ป้ายภาษี.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e'),
    })
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.locator(`tr[data-row-key="${cid}"]`)).toHaveCount(0)

    await expect
      .poll(async () => (await getVehicleDetail(page, vid)).coverages.find((c) => c.id !== cid)?.attachmentCount)
      .toBe(1)
  })

  test('ไฟล์นามสกุลไม่รองรับ → 400 ข้อความไทย', async ({ page }) => {
    await login(page, 'testinsurance', /\/renewals$/)
    const cid = await createCoverage(page, await createVehicle(page, 'E2E-7003 กท'), 'PRB', '2027-03-31')
    const res = await page.request.post(`/api/renewals/coverages/${cid}/attachments`, {
      multipart: { files: { name: 'x.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') } },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('x.exe: รองรับเฉพาะไฟล์ PDF, JPG, PNG')
  })
})
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `npx playwright test e2e/renewals/attachments.spec.ts --workers=1`
Expected: FAIL — ไม่พบปุ่ม `attachments-btn-...` / route 404

- [ ] **Step 4: API ไฟล์แนบ**

`app/api/renewals/coverages/[id]/attachments/route.ts`:

```ts
import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import type { CoverageAttachment } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { MAX_FILES_PER_UPLOAD, buildAttachmentKey, validateAttachment } from '@/lib/renewals/attachmentRules'
import { badRequest, notFound, renewalErrorResponse } from '@/lib/renewals/http'
import { toAttachmentDto } from '@/lib/renewals/serialize'
import { getAttachmentStorage, removeObjectsBestEffort } from '@/lib/renewals/storage'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  const rows = await prisma.coverageAttachment.findMany({ where: { coverageId: id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json(rows.map(toAttachmentDto))
}

/** ตรวจทุกไฟล์ก่อน แล้ว put object ก่อนสร้างแถว — สร้างแถวไม่สำเร็จ → ลบ object ทิ้ง */
export async function POST(req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const form = await req.formData().catch(() => null)
    const files = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File)
    if (files.length === 0) throw badRequest('กรุณาเลือกไฟล์')
    if (files.length > MAX_FILES_PER_UPLOAD) throw badRequest(`อัปโหลดได้ครั้งละไม่เกิน ${MAX_FILES_PER_UPLOAD} ไฟล์`)

    const checked = files.map((file) => ({ file, result: validateAttachment(file.name, file.type, file.size) }))
    const errors = checked.flatMap(({ result }) => ('error' in result ? [result.error] : []))
    if (errors.length > 0) throw badRequest(errors.join('\n'))
    if (!(await prisma.vehicleCoverage.findUnique({ where: { id }, select: { id: true } }))) throw notFound('ไม่พบงวด')

    const storage = getAttachmentStorage()
    const created: CoverageAttachment[] = []
    for (const { file, result } of checked) {
      if ('error' in result) continue
      const key = buildAttachmentKey(new Date(), randomUUID(), result.ext)
      await storage.put(key, new Uint8Array(await file.arrayBuffer()), file.type)
      try {
        created.push(
          await prisma.coverageAttachment.create({
            data: {
              coverageId: id,
              fileKey: key,
              fileName: file.name,
              contentType: file.type,
              sizeBytes: file.size,
              uploadedById: access.user.id,
            },
          }),
        )
      } catch (error) {
        await removeObjectsBestEffort([key])
        throw error
      }
    }
    return NextResponse.json(created.map(toAttachmentDto), { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

`app/api/renewals/attachments/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { inlineContentDisposition } from '@/lib/renewals/attachmentRules'
import { isPrismaNotFound, notFound, renewalErrorResponse } from '@/lib/renewals/http'
import { getAttachmentStorage, removeObjectsBestEffort } from '@/lib/renewals/storage'

type Params = { params: Promise<{ id: string }> }

/** ไฟล์เป็น private — เปิดได้ผ่าน route นี้ที่เช็กสิทธิ์เท่านั้น */
export async function GET(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const { id } = await params
  const row = await prisma.coverageAttachment.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  const body = await getAttachmentStorage().get(row.fileKey)
  if (!body) return NextResponse.json({ error: 'ไม่พบไฟล์ในที่เก็บ' }, { status: 404 })

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': row.contentType,
      'Content-Disposition': inlineContentDisposition(row.fileName),
      'Cache-Control': 'private, no-store',
    },
  })
}

/** ลบแถวก่อน แล้วลบ object แบบ best-effort */
export async function DELETE(_req: Request, { params }: Params) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const { id } = await params
    const row = await prisma.coverageAttachment.delete({ where: { id } }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) throw notFound('ไม่พบไฟล์')
      throw error
    })
    await removeObjectsBestEffort([row.fileKey])
    return NextResponse.json({ success: true })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

- [ ] **Step 5: UI ไฟล์แนบ**

`components/renewals/uploadAttachments.ts`:

```ts
/** อัปโหลดทีละไฟล์ — middleware จำกัด body ต่อ request (ตั้งไว้ 12mb ใน next.config.js) */
export async function uploadAttachments(
  coverageId: string,
  files: File[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const file of files) {
    const form = new FormData()
    form.append('files', file)
    try {
      const res = await fetch(`/api/renewals/coverages/${coverageId}/attachments`, { method: 'POST', body: form })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        return { ok: false, error: json.error || `อัปโหลด ${file.name} ไม่สำเร็จ` }
      }
    } catch {
      return { ok: false, error: `อัปโหลด ${file.name} ไม่สำเร็จ` }
    }
  }
  return { ok: true }
}
```

`components/renewals/AttachmentsModal.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { App, Button, Image, Modal, Space, Table, Upload, type TableColumnsType } from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { todayInBangkok } from '@/lib/renewals/dateOnly'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { AttachmentDto, CoverageDto } from '@/types/renewals'
import { getJson, sendJson } from './api'
import { uploadAttachments } from './uploadAttachments'

const urlOf = (a: AttachmentDto) => `/api/renewals/attachments/${a.id}`

interface Props {
  coverage: CoverageDto | null
  onClose: () => void
  /** จำนวนไฟล์เปลี่ยน — ให้หน้าแม่โหลดตัวเลขใหม่ */
  onChanged: () => void
}

export default function AttachmentsModal({ coverage, onClose, onChanged }: Props) {
  const { message, modal } = App.useApp()
  const [rows, setRows] = useState<AttachmentDto[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const fetchRows = useCallback(async () => {
    if (!coverage) return
    setLoading(true)
    const res = await getJson<AttachmentDto[]>(`/api/renewals/coverages/${coverage.id}/attachments`)
    if (res.ok) setRows(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [coverage, message])

  useEffect(() => {
    setRows([])
    fetchRows()
  }, [fetchRows])

  const handleUpload = async (file: File) => {
    if (!coverage) return
    setUploading(true)
    const res = await uploadAttachments(coverage.id, [file])
    setUploading(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success(`แนบ ${file.name} สำเร็จ`)
    fetchRows()
    onChanged()
  }

  const handleDelete = (a: AttachmentDto) => {
    modal.confirm({
      title: 'ลบไฟล์แนบ',
      content: a.fileName,
      okText: 'ยืนยัน',
      okButtonProps: { danger: true },
      cancelText: 'ยกเลิก',
      onOk: async () => {
        const res = await sendJson(urlOf(a), undefined, 'DELETE')
        if (!res.ok) {
          message.error(res.error)
          return
        }
        message.success('ลบสำเร็จ')
        fetchRows()
        onChanged()
      },
    })
  }

  const columns: TableColumnsType<AttachmentDto> = [
    {
      title: 'ไฟล์',
      key: 'file',
      render: (_, a) => (
        <Space>
          {a.contentType.startsWith('image/') && (
            <Image src={urlOf(a)} width={40} height={40} style={{ objectFit: 'cover' }} alt={a.fileName} />
          )}
          <a href={urlOf(a)} target="_blank" rel="noreferrer">
            {a.fileName}
          </a>
        </Space>
      ),
    },
    {
      title: 'ขนาด',
      key: 'size',
      width: 90,
      align: 'right',
      render: (_, a) => `${Math.max(1, Math.round(a.sizeBytes / 1024)).toLocaleString('th-TH')} KB`,
    },
    {
      title: 'วันที่แนบ',
      key: 'createdAt',
      width: 90,
      render: (_, a) => toThaiShortDate(todayInBangkok(new Date(a.createdAt))),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, a) => (
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(a)} data-testid={`attachment-delete-btn-${a.id}`} />
      ),
    },
  ]

  return (
    <Modal
      open={coverage !== null}
      title="ไฟล์แนบ"
      footer={<Button onClick={onClose}>ปิด</Button>}
      onCancel={onClose}
      width={640}
      destroyOnHidden
    >
      <Upload
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        showUploadList={false}
        beforeUpload={(file) => {
          handleUpload(file)
          return Upload.LIST_IGNORE
        }}
      >
        <Button icon={<UploadOutlined />} loading={uploading} data-testid="attachment-upload-btn">
          เลือกไฟล์ (PDF/JPG/PNG ไม่เกิน 10 MB)
        </Button>
      </Upload>
      <Table size="small" rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={false} style={{ marginTop: 12 }} />
    </Modal>
  )
}
```

`components/renewals/RenewModal.tsx` — แทนที่ทั้งไฟล์ (เพิ่มช่องแนบไฟล์ — อัปโหลดหลังต่ออายุสำเร็จ; อัปโหลดไม่สำเร็จไม่ย้อนการต่ออายุ แต่เตือนให้แนบใหม่ที่หน้ารถ):

```tsx
'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { App, Button, Form, Modal, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { COVERAGE_TYPE_LABELS } from '@/lib/renewals/constants'
import { nextPeriodDefaults } from '@/lib/renewals/renewalDefaults'
import type { CoverageDto, InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { sendJson } from './api'
import CoveragePeriodFields from './CoveragePeriodFields'
import { dtoToFormValues, formValuesToBody, type CoverageFormValues } from './coverageForm'
import { uploadAttachments } from './uploadAttachments'

interface Props {
  item: CoverageDto | null
  insurers: InsurerDto[]
  vehicles: VehicleListItemDto[]
  onClose: () => void
  onDone: () => void
}

/** ต่อแล้ว (ทีละคัน) — ค่าเริ่มต้นมาจากงวดเดิม: วันเริ่ม = วันหมดเดิม + 1 วัน, วันหมด = +1 ปี */
export default function RenewModal({ item, insurers, vehicles, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<CoverageFormValues>()
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  const initialValues = useMemo<CoverageFormValues | undefined>(() => {
    if (!item) return undefined
    const next = nextPeriodDefaults(item.endDate)
    return {
      ...dtoToFormValues(item),
      policyNumber: null,
      renewalNote: null,
      startDate: dayjs(next.startDate),
      endDate: dayjs(next.endDate),
    }
  }, [item])

  const close = () => {
    setFiles([])
    onClose()
  }

  const handleOk = async () => {
    if (!item) return
    const values = await form.validateFields()
    setSaving(true)
    const res = await sendJson<{ id: string }>(`/api/renewals/coverages/${item.id}/renew`, formValuesToBody(values))
    if (!res.ok) {
      setSaving(false)
      message.error(res.error)
      return
    }
    if (files.length > 0) {
      const uploaded = await uploadAttachments(res.data.id, files)
      if (!uploaded.ok) message.warning(`ต่ออายุสำเร็จ แต่แนบไฟล์ไม่สำเร็จ (แนบใหม่ที่หน้ารถ): ${uploaded.error}`)
    }
    setSaving(false)
    setFiles([])
    message.success('บันทึกการต่ออายุสำเร็จ')
    onDone()
  }

  return (
    <Modal
      open={item !== null}
      title={item ? `ต่ออายุ${COVERAGE_TYPE_LABELS[item.type]} — ${item.vehicle.plate}` : ''}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={close}
      destroyOnHidden
    >
      {item && (
        <Form key={item.id} form={form} layout="vertical" initialValues={initialValues}>
          <CoveragePeriodFields
            type={item.type}
            insurers={insurers}
            vehicles={vehicles}
            vehicleId={item.vehicleId}
            currentInsurerId={item.insurerId}
          />
          <Form.Item label="แนบไฟล์ (กรมธรรม์ / ป้ายภาษี)">
            <Upload
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              fileList={files.map((f, i) => ({ uid: String(i), name: f.name, status: 'done' as const }))}
              beforeUpload={(file) => {
                setFiles((prev) => [...prev, file])
                return false
              }}
              onRemove={(removed) => setFiles((prev) => prev.filter((_, i) => String(i) !== removed.uid))}
            >
              <Button icon={<UploadOutlined />} data-testid="renew-attach-btn">
                เลือกไฟล์
              </Button>
            </Upload>
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
```

`components/renewals/VehicleDetail.tsx` — แก้ 4 จุด:

1. import: เพิ่ม `PaperClipOutlined` ในรายการ icon และเพิ่มบรรทัด `import AttachmentsModal from './AttachmentsModal'`
2. state: ต่อจาก `const [coverageForm, ...]` เพิ่ม `const [attachmentsFor, setAttachmentsFor] = useState<CoverageDto | null>(null)`
3. `columns`: แทรกก่อนคอลัมน์ `{ title: 'จัดการ', ... }`:

```tsx
    {
      title: 'ไฟล์',
      key: 'files',
      width: 70,
      render: (_, c) => (
        <Button size="small" icon={<PaperClipOutlined />} onClick={() => setAttachmentsFor(c)} data-testid={`attachments-btn-${c.id}`}>
          {c.attachmentCount}
        </Button>
      ),
    },
```

4. ท้าย JSX ต่อจาก `<CoverageFormModal ... />`:

```tsx
      <AttachmentsModal coverage={attachmentsFor} onClose={() => setAttachmentsFor(null)} onChanged={fetchDetail} />
```

- [ ] **Step 6: รันให้ผ่าน**

Run: `npx playwright test e2e/renewals/attachments.spec.ts e2e/renewals/dashboard.spec.ts e2e/renewals/vehicles-ui.spec.ts --workers=1`
Expected: PASS ทั้งหมด (webServer ต้อง restart เพื่อรับ `ATTACHMENT_STORAGE` และ `next.config.js` ใหม่ — ถ้า `reuseExistingServer` ใช้ dev server เดิมที่เปิดค้างอยู่ ให้ปิด server นั้นก่อน)
Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

- [ ] **Step 7: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add app/api/renewals/coverages app/api/renewals/attachments components/renewals/uploadAttachments.ts components/renewals/AttachmentsModal.tsx components/renewals/RenewModal.tsx components/renewals/VehicleDetail.tsx next.config.js playwright.config.ts .gitignore e2e/renewals/attachments.spec.ts
git commit -m "$(cat <<'EOF'
feat(renewals): แนบไฟล์กรมธรรม์/ป้ายภาษีต่องวด เก็บแบบ private และเปิดผ่าน route ที่เช็กสิทธิ์

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 11: อ่านและตรวจไฟล์ import (pure) + template

**Files:**
- Modify: `lib/utils/excel.ts` (export `normalizeCellValue`)
- Create: `lib/renewals/import/columns.ts`, `lib/renewals/import/cells.ts`, `lib/renewals/import/validate.ts`, `lib/renewals/import/workbook.ts`
- Test: `lib/renewals/import/__tests__/cells.test.ts`, `validate.test.ts`, `workbook.test.ts`

**Interfaces:**
- Consumes: constants / plate / dateOnly / autoClose (Task 1–2, 6), `ImportErrorDto` / `ImportSummaryDto` (Task 1)
- Produces:
  - `columns.ts`: `VEHICLE_SHEET = 'รถ'`, `COVERAGE_SHEET = 'งวด'`, `GUIDE_SHEET = 'วิธีกรอก'`, `VEHICLE_COLUMNS`, `COVERAGE_COLUMNS`, `VehicleColumnKey`, `CoverageColumnKey`, `ImportStatusKey`, `IMPORT_STATUS_LABELS`, `RawRow<K>`, `GUIDE_ROWS`
  - `cells.ts`: `CellResult<T>`, `cellText`, `isBlank`, `parseImportDate`, `parseImportMoney`, `parseImportInt`, `lookupLabel`
  - `validate.ts`: `ExistingSnapshot`, `VehicleUpsert`, `CoverageUpsert`, `ImportPlan`, `ImportValidation`, `validateRenewalImport(input, existing): ImportValidation`
  - `workbook.ts`: `buildRenewalTemplate(): Promise<Buffer>`, `readRenewalWorkbook(buffer: ArrayBuffer): Promise<{ vehicles; coverages } | { error: string }>`

- [ ] **Step 1: export `normalizeCellValue`**

รัน impact ก่อน: `node .gitnexus/run.cjs impact "normalizeCellValue" --direction upstream --repo .` (คาดว่า caller มีแค่ `readSheetAsRows` — เพิ่ม export ไม่เปลี่ยนพฤติกรรม)

`lib/utils/excel.ts` บรรทัด `function normalizeCellValue(value: ExcelJS.CellValue): unknown {` → `export function normalizeCellValue(value: ExcelJS.CellValue): unknown {`

- [ ] **Step 2: เขียน test ที่ fail (3 ไฟล์)**

`lib/renewals/import/__tests__/cells.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COVERAGE_TYPE_LABELS } from '../../constants'
import { lookupLabel, parseImportDate, parseImportInt, parseImportMoney } from '../cells'

test('parseImportDate: date cell, พ.ศ./ค.ศ. 4 หลัก, คั่นด้วย - ได้, YYYY-MM-DD, ว่าง', () => {
  assert.deepEqual(parseImportDate(new Date(Date.UTC(2027, 2, 31))), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate('31/03/2570'), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate('9-1-2569'), { value: '2026-01-09' })
  assert.deepEqual(parseImportDate('31/03/2027'), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate('2027-03-31'), { value: '2027-03-31' })
  assert.deepEqual(parseImportDate(''), { value: null })
  assert.deepEqual(parseImportDate(null), { value: null })
})

test('parseImportDate: ปี 2 หลักไม่เดาศตวรรษ, วันที่ไม่มีจริง', () => {
  assert.deepEqual(parseImportDate('31/03/70'), {
    error: 'วันที่ "31/03/70" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570',
  })
  assert.deepEqual(parseImportDate('29/02/2570'), { error: 'วันที่ "29/02/2570" ไม่มีอยู่จริง' })
})

test('parseImportMoney: คอมมา, ตัวเลข, ว่าง, ติดลบ, เกิน, ไม่ใช่ตัวเลข', () => {
  assert.deepEqual(parseImportMoney('13,449.50'), { value: 13449.5 })
  assert.deepEqual(parseImportMoney(19900), { value: 19900 })
  assert.deepEqual(parseImportMoney(''), { value: null })
  assert.deepEqual(parseImportMoney('-1'), { error: 'จำนวนเงินต้องไม่ติดลบ' })
  assert.deepEqual(parseImportMoney(100_000_000), { error: 'จำนวนเงินต้องไม่เกิน 99,999,999.99' })
  assert.deepEqual(parseImportMoney('ไม่ต่อ'), { error: '"ไม่ต่อ" ไม่ใช่ตัวเลข' })
})

test('parseImportInt: คอมมาได้ ทศนิยมไม่ได้', () => {
  assert.deepEqual(parseImportInt('7,900'), { value: 7900 })
  assert.deepEqual(parseImportInt('7.5'), { error: 'ต้องเป็นจำนวนเต็ม' })
  assert.deepEqual(parseImportInt(null), { value: null })
})

test('lookupLabel: ไม่สนจุด/ช่องว่าง; ว่าง = null; ไม่ตรงตัวเลือก = undefined', () => {
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, 'พรบ'), 'PRB')
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, ' ประกัน รถยนต์ '), 'MOTOR_INSURANCE')
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, ''), null)
  assert.equal(lookupLabel(COVERAGE_TYPE_LABELS, 'ประกันภัย'), undefined)
})
```

`lib/renewals/import/__tests__/validate.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CoverageColumnKey, RawRow, VehicleColumnKey } from '../columns'
import { validateRenewalImport, type ExistingSnapshot } from '../validate'

const v = (row: number, values: Partial<Record<VehicleColumnKey, unknown>>): RawRow<VehicleColumnKey> => ({ row, values })
const c = (row: number, values: Partial<Record<CoverageColumnKey, unknown>>): RawRow<CoverageColumnKey> => ({ row, values })

const BASE: ExistingSnapshot = {
  vehicles: [{ id: 'veh-1', plate: '61-8550 กท', status: 'ACTIVE' }],
  insurers: [
    { id: 'ins-1', name: 'วิริยะประกันภัย', isActive: true },
    { id: 'ins-2', name: 'ปิดแล้วประกันภัย', isActive: false },
  ],
  coverages: [],
}

const messages = (r: ReturnType<typeof validateRenewalImport>) =>
  r.errors.map((e) => `${e.sheet}:${e.row}:${e.field}:${e.message}`)

test('รถใหม่ + งวดใหม่ (ทะเบียนต่างรูปแบบระหว่างชีต, เงินมีคอมมา) → ผ่าน และนับถูก', () => {
  const r = validateRenewalImport(
    {
      vehicles: [v(2, { plate: '64-5598 กท.', ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', weightKg: '7,900' })],
      coverages: [
        c(2, {
          plate: '64-5598  กท',
          type: 'ประกันรถยนต์',
          insurer: 'วิริยะประกันภัย',
          coverageClass: 'ป.3',
          endDate: '09/01/2570',
          amount: '19,900',
          pairedPlate: '61-8550 กท',
        }),
      ],
    },
    BASE,
  )
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.plan.vehicles[0], {
    plate: '64-5598 กท',
    existingId: null,
    data: { ownerName: 'แวลู ทรานสปอร์ต', vehicleType: 'ลากจูง', weightKg: 7900 },
  })
  assert.deepEqual(r.plan.coverages[0], {
    plate: '64-5598 กท',
    type: 'MOTOR_INSURANCE',
    endDate: '2027-01-09',
    existingId: null,
    data: { insurerId: 'ins-1', coverageClass: 'ป.3', pairedPlate: '61-8550 กท', amount: 19900 },
  })
  assert.deepEqual(r.summary, {
    vehiclesCreated: 1,
    vehiclesUpdated: 0,
    coveragesCreated: 1,
    coveragesUpdated: 0,
    coveragesAutoClosed: 0,
  })
})

test('รถใหม่ต้องมีบริษัท/ลักษณะ; รถเดิมเว้นว่างได้ (คงค่าเดิม)', () => {
  const r = validateRenewalImport({ vehicles: [v(2, { plate: '70-0001 กท' }), v(3, { plate: '61-8550 กท', brand: 'ISUZU' })], coverages: [] }, BASE)
  assert.deepEqual(messages(r), ['รถ:2:บริษัท:รถใหม่ต้องกรอกบริษัท', 'รถ:2:ลักษณะ:รถใหม่ต้องกรอกลักษณะ'])
  assert.deepEqual(r.plan.vehicles[1], { plate: '61-8550 กท', existingId: 'veh-1', data: { brand: 'ISUZU' } })
})

test('ทะเบียนซ้ำในไฟล์ (ต่างแค่จุดท้าย) → error ทุกแถวที่ซ้ำ', () => {
  const r = validateRenewalImport({ vehicles: [v(2, { plate: '61-8550 กท' }), v(5, { plate: '61-8550 กท.' })], coverages: [] }, BASE)
  assert.deepEqual(messages(r), [
    'รถ:2:ทะเบียน:ทะเบียน 61-8550 กท ซ้ำในไฟล์ (แถว 2, 5)',
    'รถ:5:ทะเบียน:ทะเบียน 61-8550 กท ซ้ำในไฟล์ (แถว 2, 5)',
  ])
})

test('งวด: ไม่พบรถ / ประเภทผิด / ปี 2 หลัก → ไม่เข้าแผน', () => {
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { plate: '99-9999 กท', type: 'พรบ.', endDate: '31/03/2570' }),
        c(3, { plate: '61-8550 กท', type: 'ประกันภัย', endDate: '31/03/2570' }),
        c(4, { plate: '61-8550 กท', type: 'พรบ', endDate: '31/03/70' }),
      ],
    },
    BASE,
  )
  assert.deepEqual(messages(r), [
    'งวด:2:ทะเบียน:ไม่พบรถทะเบียน 99-9999 กท — เพิ่มในชีต "รถ" ก่อน',
    'งวด:3:ประเภท:ต้องเป็น พรบ. / ภาษี / ประกันรถยนต์ / ประกันสินค้า',
    'งวด:4:วันสิ้นสุด:วันที่ "31/03/70" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570',
  ])
  assert.deepEqual(r.plan.coverages, [])
})

test('บริษัทประกัน: ไม่รู้จัก → unknownInsurers; ปิดใช้งาน → error; ภาษีห้ามกรอก; ชั้นเฉพาะประกันรถยนต์', () => {
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { plate: '61-8550 กท', type: 'พรบ.', insurer: 'นวกิจประกันภัย', endDate: '31/03/2570' }),
        c(3, { plate: '61-8550 กท', type: 'ประกันสินค้า', insurer: 'ปิดแล้วประกันภัย', coverageClass: 'ป.3', endDate: '11/01/2570' }),
        c(4, { plate: '61-8550 กท', type: 'ภาษี', insurer: 'วิริยะประกันภัย', endDate: '30/06/2570' }),
      ],
    },
    BASE,
  )
  assert.deepEqual(r.unknownInsurers, ['นวกิจประกันภัย'])
  assert.deepEqual(messages(r), [
    'งวด:2:บริษัทประกัน:ไม่พบบริษัทประกัน "นวกิจประกันภัย" ในระบบ',
    'งวด:3:บริษัทประกัน:บริษัทประกัน "ปิดแล้วประกันภัย" ถูกปิดใช้งาน',
    'งวด:3:ชั้น:กรอกชั้นได้เฉพาะประกันรถยนต์',
    'งวด:4:บริษัทประกัน:ภาษีไม่ต้องกรอกบริษัทประกัน',
  ])
})

test('สถานะการต่อ: ไม่รับ "ต่อแล้ว"; ไม่ต่อต้องมีเหตุผล; อื่นๆ ต้องมีหมายเหตุ; เหตุผลต้องคู่กับไม่ต่อ', () => {
  const base = { plate: '61-8550 กท', type: 'พรบ.' }
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { ...base, endDate: '31/03/2567', renewalStatus: 'ต่อแล้ว' }),
        c(3, { ...base, endDate: '31/03/2568', renewalStatus: 'ไม่ต่อ' }),
        c(4, { ...base, endDate: '31/03/2569', renewalStatus: 'ไม่ต่อ', notRenewedReason: 'อื่นๆ' }),
        c(5, { ...base, endDate: '31/03/2570', notRenewedReason: 'รถซ่อม' }),
      ],
    },
    BASE,
  )
  assert.deepEqual(messages(r), [
    'งวด:2:สถานะการต่อ:ไม่รับสถานะ "ต่อแล้ว" — ระบบปิดงวดเก่าให้เองเมื่อมีงวดใหม่',
    'งวด:3:เหตุผลไม่ต่อ:สถานะ "ไม่ต่อ" ต้องกรอกเหตุผล',
    'งวด:4:หมายเหตุ:เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ',
    'งวด:5:เหตุผลไม่ต่อ:กรอกเหตุผลได้เฉพาะสถานะ "ไม่ต่อ"',
  ])
})

test('งวดที่ตรง key เดิม → อัปเดต; งวดใหม่กว่าทำให้งวดเปิดเดิมปิดอัตโนมัติ', () => {
  const existing: ExistingSnapshot = {
    ...BASE,
    coverages: [{ id: 'cov-1', vehicleId: 'veh-1', type: 'PRB', endDate: '2026-03-31', renewalStatus: 'PENDING', renewedToId: null }],
  }
  const r = validateRenewalImport(
    {
      vehicles: [],
      coverages: [
        c(2, { plate: '61-8550 กท', type: 'พรบ.', endDate: '31/03/2569', policyNumber: 'P-1' }),
        c(3, { plate: '61-8550 กท', type: 'พรบ.', endDate: '31/03/2570' }),
      ],
    },
    existing,
  )
  assert.deepEqual(r.errors, [])
  assert.equal(r.plan.coverages[0].existingId, 'cov-1')
  assert.deepEqual(r.summary, {
    vehiclesCreated: 0,
    vehiclesUpdated: 0,
    coveragesCreated: 1,
    coveragesUpdated: 1,
    coveragesAutoClosed: 1,
  })
})

test('รถถูกตั้งเป็น "ขาย" พร้อมงวดรอต่อในไฟล์เดียวกัน → นับเป็นปิดอัตโนมัติ', () => {
  const r = validateRenewalImport(
    {
      vehicles: [v(2, { plate: '61-8550 กท', status: 'ขาย', statusDate: '06/07/2569' })],
      coverages: [c(2, { plate: '61-8550 กท', type: 'ประกันรถยนต์', endDate: '09/01/2570', renewalStatus: 'รอต่อ' })],
    },
    BASE,
  )
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.plan.vehicles[0].data, { status: 'SOLD', statusDate: '2026-07-06' })
  assert.equal(r.summary.coveragesAutoClosed, 1)
})

test('งวดที่ปิดแล้วเปลี่ยนสถานะผ่าน import ไม่ได้ (ยกเว้นค่าเดิม)', () => {
  const existing: ExistingSnapshot = {
    ...BASE,
    coverages: [{ id: 'cov-1', vehicleId: 'veh-1', type: 'PRB', endDate: '2026-03-31', renewalStatus: 'NOT_RENEWED', renewedToId: null }],
  }
  const row = { plate: '61-8550 กท', type: 'พรบ.', endDate: '31/03/2569' }
  const same = validateRenewalImport({ vehicles: [], coverages: [c(2, { ...row, renewalStatus: 'ไม่ต่อ', notRenewedReason: 'งดใช้' })] }, existing)
  assert.deepEqual(same.errors, [])
  const reopen = validateRenewalImport({ vehicles: [], coverages: [c(2, { ...row, renewalStatus: 'รอต่อ' })] }, existing)
  assert.deepEqual(messages(reopen), ['งวด:2:สถานะการต่อ:งวดนี้ปิดแล้ว — เปลี่ยนสถานะผ่านหน้าจอ'])
})
```

`lib/renewals/import/__tests__/workbook.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { COVERAGE_COLUMNS } from '../columns'
import { buildRenewalTemplate, readRenewalWorkbook } from '../workbook'

const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

async function loadTemplate() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(toArrayBuffer(await buildRenewalTemplate()))
  return wb
}

async function toBuffer(wb: ExcelJS.Workbook) {
  return toArrayBuffer(Buffer.from(await wb.xlsx.writeBuffer()))
}

test('template เปล่า → อ่านได้ 0 แถว (แถวที่มีแค่ dropdown ถูกข้าม) และมีชีตวิธีกรอก', async () => {
  const wb = await loadTemplate()
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['รถ', 'งวด', 'วิธีกรอก'])
  assert.deepEqual(await readRenewalWorkbook(await toBuffer(wb)), { vehicles: [], coverages: [] })
})

test('ข้ามแถวที่มีแค่สี และเก็บเลขแถวจริง; date cell ได้ Date', async () => {
  const wb = await loadTemplate()
  const ws = wb.getWorksheet('งวด')!
  ws.getCell('A2').value = '64-5598 กท'
  ws.getCell('B2').value = 'พรบ.'
  ws.getCell('G2').value = new Date(Date.UTC(2027, 2, 31))
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
  ws.getCell('A4').value = '61-8550 กท'
  ws.getCell('B4').value = 'ภาษี'
  ws.getCell('G4').value = '30/06/2570'

  const result = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok(!('error' in result))
  assert.deepEqual(result.coverages.map((r) => r.row), [2, 4])
  assert.ok(result.coverages[0].values.endDate instanceof Date)
  assert.equal(result.coverages[1].values.endDate, '30/06/2570')
})

test('จับคู่ด้วยชื่อหัวคอลัมน์ — สลับลำดับได้', async () => {
  const wb = new ExcelJS.Workbook()
  const vehicles = wb.addWorksheet('รถ')
  vehicles.addRow(['หมายเหตุ', 'วันที่สถานะ', 'สถานะ', 'น้ำหนัก(กก.)', 'เชื้อเพลิง', 'เลขตัวถัง', 'ยี่ห้อ', 'ลักษณะ', 'บริษัท', 'เบอร์รถ', 'ทะเบียน'])
  vehicles.addRow(['', '', '', '', '', '', '', 'หาง', 'แวลู ทรานสปอร์ต', '17', '73-4940 กท'])
  wb.addWorksheet('งวด').addRow(Object.values(COVERAGE_COLUMNS))

  const result = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok(!('error' in result))
  assert.equal(result.vehicles[0].values.plate, '73-4940 กท')
  assert.equal(result.vehicles[0].values.vehicleType, 'หาง')
})

test('ขาดคอลัมน์ / ขาดชีต / ไม่ใช่ xlsx → error ภาษาไทย', async () => {
  const wb = await loadTemplate()
  wb.removeWorksheet(wb.getWorksheet('งวด')!.id)
  wb.addWorksheet('งวด').addRow(['ทะเบียน', 'ประเภท'])
  const missingColumns = await readRenewalWorkbook(await toBuffer(wb))
  assert.ok('error' in missingColumns)
  assert.match(missingColumns.error, /^ชีต "งวด" ไม่มีคอลัมน์: บริษัทประกัน, ชั้น, เลขกรมธรรม์/)

  const onlyVehicles = new ExcelJS.Workbook()
  onlyVehicles.addWorksheet('รถ')
  assert.deepEqual(await readRenewalWorkbook(await toBuffer(onlyVehicles)), {
    error: 'ไฟล์ต้องมีชีต "รถ" และ "งวด" — ดาวน์โหลด template',
  })

  assert.deepEqual(await readRenewalWorkbook(toArrayBuffer(Buffer.from('not excel'))), {
    error: 'อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .xlsx',
  })
})
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `npx tsx --test lib/renewals/import/__tests__/*.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 4: `lib/renewals/import/columns.ts`**

```ts
import { RENEWAL_STATUS_LABELS } from '../constants'

export const VEHICLE_SHEET = 'รถ'
export const COVERAGE_SHEET = 'งวด'
export const GUIDE_SHEET = 'วิธีกรอก'

/** ลำดับ key = ลำดับคอลัมน์ใน template; ตอนอ่านจับคู่ด้วยชื่อหัวคอลัมน์ จึงสลับลำดับได้ */
export const VEHICLE_COLUMNS = {
  plate: 'ทะเบียน',
  fleetNumber: 'เบอร์รถ',
  ownerName: 'บริษัท',
  vehicleType: 'ลักษณะ',
  brand: 'ยี่ห้อ',
  chassisNumber: 'เลขตัวถัง',
  fuelType: 'เชื้อเพลิง',
  weightKg: 'น้ำหนัก(กก.)',
  status: 'สถานะ',
  statusDate: 'วันที่สถานะ',
  note: 'หมายเหตุ',
} as const

export const COVERAGE_COLUMNS = {
  plate: 'ทะเบียน',
  type: 'ประเภท',
  insurer: 'บริษัทประกัน',
  coverageClass: 'ชั้น',
  policyNumber: 'เลขกรมธรรม์',
  startDate: 'วันเริ่ม',
  endDate: 'วันสิ้นสุด',
  amount: 'เบี้ย/ภาษี',
  serviceFee: 'ค่าบริการ',
  pairedPlate: 'ทะเบียนหางคู่',
  renewalStatus: 'สถานะการต่อ',
  notRenewedReason: 'เหตุผลไม่ต่อ',
  renewalNote: 'หมายเหตุ',
} as const

export type VehicleColumnKey = keyof typeof VEHICLE_COLUMNS
export type CoverageColumnKey = keyof typeof COVERAGE_COLUMNS

export type ImportStatusKey = 'PENDING' | 'IN_PROGRESS' | 'NOT_RENEWED'

/** "ต่อแล้ว" ไม่รับใน import — ระบบปิดงวดเก่าให้เองเมื่อมีงวดใหม่ */
export const IMPORT_STATUS_LABELS: Record<ImportStatusKey, string> = {
  PENDING: RENEWAL_STATUS_LABELS.PENDING,
  IN_PROGRESS: RENEWAL_STATUS_LABELS.IN_PROGRESS,
  NOT_RENEWED: RENEWAL_STATUS_LABELS.NOT_RENEWED,
}

export interface RawRow<K extends string> {
  /** เลขแถวใน Excel (สำหรับแจ้ง error) */
  row: number
  values: Partial<Record<K, unknown>>
}

export const GUIDE_ROWS: [string, string][] = [
  ['ชีต / คอลัมน์', 'วิธีกรอก'],
  ['ชีต "รถ"', '1 แถว = รถ 1 คัน — ทะเบียนใช้จับคู่กับรถที่มีอยู่แล้ว'],
  ['ทะเบียน *', 'เช่น 64-5598 กท (จุดท้าย / ช่องว่างซ้อน ระบบจัดให้เอง)'],
  ['บริษัท, ลักษณะ', 'บังคับเฉพาะรถใหม่ — รถที่มีอยู่แล้วเว้นว่าง = คงค่าเดิม'],
  ['สถานะ', 'ใช้งาน / งดใช้ / ขาย — "ขาย" จะปิดงวดที่ยังเปิดอยู่ของรถคันนั้นเป็น "ไม่ต่อ (ขายรถ)"'],
  ['ชีต "งวด"', '1 แถว = 1 งวด — ทะเบียน + ประเภท + วันสิ้นสุด ใช้จับคู่กับงวดที่มีอยู่แล้ว'],
  ['ประเภท *', 'พรบ. / ภาษี / ประกันรถยนต์ / ประกันสินค้า'],
  ['บริษัทประกัน', 'ต้องตรงกับชื่อในเมนู "บริษัทประกัน" — ภาษีไม่ต้องกรอก'],
  ['ชั้น, ทะเบียนหางคู่', 'เฉพาะประกันรถยนต์ — ชั้น: ป.1 / ป.2+ / ป.3 / ป.3+'],
  ['วันเริ่ม, วันสิ้นสุด *', 'วว/ดด/ปปปป เช่น 31/03/2570 (พ.ศ. หรือ ค.ศ. ก็ได้ แต่ปีต้อง 4 หลัก) หรือช่องวันที่ของ Excel'],
  ['เบี้ย/ภาษี, ค่าบริการ', 'ตัวเลข มีคอมมาได้ เช่น 13,449.50'],
  ['สถานะการต่อ', 'รอต่อ / กำลังดำเนินการ / ไม่ต่อ (งวดใหม่เว้นว่าง = รอต่อ) — ไม่ต้องกรอก "ต่อแล้ว"'],
  ['เหตุผลไม่ต่อ', 'ขายรถ / งดใช้ / รถเกิดอุบัติเหตุ / รถซ่อม / อื่นๆ ("อื่นๆ" ต้องกรอกหมายเหตุ)'],
  ['ช่องว่าง', 'ข้อมูลที่มีอยู่แล้วในระบบ ถ้าเว้นว่างจะคงค่าเดิม'],
]
```

- [ ] **Step 5: `lib/renewals/import/cells.ts`**

```ts
import { MAX_MONEY } from '../constants'
import { dateToYmd, isValidYmd } from '../dateOnly'

export type CellResult<T> = { value: T } | { error: string }

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : dateToYmd(value)
  return String(value).trim()
}

export function isBlank(value: unknown): boolean {
  return cellText(value) === ''
}

/** date cell ของ Excel หรือข้อความ วว/ดด/ปปปป (คั่น / หรือ -), ปี > 2400 = พ.ศ.; ปี 2 หลักไม่รับเพราะเดาศตวรรษผิดได้ */
export function parseImportDate(value: unknown): CellResult<string | null> {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { error: 'วันที่ไม่ถูกต้อง' } : { value: dateToYmd(value) }
  }
  const text = cellText(value)
  if (!text) return { value: null }
  if (isValidYmd(text)) return { value: text }
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text)
  if (!match) return { error: `วันที่ "${text}" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570` }
  const year = Number(match[3]) > 2400 ? Number(match[3]) - 543 : Number(match[3])
  const ymd = `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return isValidYmd(ymd) ? { value: ymd } : { error: `วันที่ "${text}" ไม่มีอยู่จริง` }
}

function parseNumber(value: unknown): CellResult<number | null> {
  const text = cellText(value)
  if (!text) return { value: null }
  const n = typeof value === 'number' ? value : Number(text.replace(/,/g, ''))
  if (!Number.isFinite(n)) return { error: `"${text}" ไม่ใช่ตัวเลข` }
  return { value: n }
}

export function parseImportMoney(value: unknown): CellResult<number | null> {
  const parsed = parseNumber(value)
  if ('error' in parsed || parsed.value === null) return parsed
  if (parsed.value < 0) return { error: 'จำนวนเงินต้องไม่ติดลบ' }
  if (parsed.value > MAX_MONEY) return { error: 'จำนวนเงินต้องไม่เกิน 99,999,999.99' }
  return { value: Math.round(parsed.value * 100) / 100 }
}

export function parseImportInt(value: unknown): CellResult<number | null> {
  const parsed = parseNumber(value)
  if ('error' in parsed || parsed.value === null) return parsed
  if (!Number.isInteger(parsed.value)) return { error: 'ต้องเป็นจำนวนเต็ม' }
  if (parsed.value < 0 || parsed.value > 100_000) return { error: 'ต้องอยู่ระหว่าง 0 ถึง 100,000' }
  return parsed
}

const squash = (s: string) => s.replace(/[.\s]/g, '')

/** หา key จาก label ภาษาไทย ไม่สนจุด/ช่องว่าง ("พรบ" = "พรบ.") — null = ช่องว่าง, undefined = ไม่ตรงตัวเลือกไหน */
export function lookupLabel<K extends string>(labels: Record<K, string>, value: unknown): K | null | undefined {
  const text = squash(cellText(value))
  if (!text) return null
  return (Object.keys(labels) as K[]).find((k) => squash(labels[k]) === text)
}
```

- [ ] **Step 6: `lib/renewals/import/validate.ts`**

```ts
import type { ImportErrorDto, ImportSummaryDto } from '@/types/renewals'
import { planAutoClose, type AutoCloseRow } from '../autoClose'
import {
  COVERAGE_CLASSES,
  COVERAGE_TYPE_LABELS,
  NOT_RENEWED_REASON_LABELS,
  VEHICLE_STATUS_LABELS,
  isOpenStatus,
  type CoverageTypeKey,
  type NotRenewedReasonKey,
  type RenewalStatusKey,
  type VehicleStatusKey,
} from '../constants'
import { normalizePlate } from '../plate'
import { cellText, lookupLabel, parseImportDate, parseImportInt, parseImportMoney } from './cells'
import {
  COVERAGE_COLUMNS,
  COVERAGE_SHEET,
  IMPORT_STATUS_LABELS,
  VEHICLE_COLUMNS,
  VEHICLE_SHEET,
  type CoverageColumnKey,
  type ImportStatusKey,
  type RawRow,
  type VehicleColumnKey,
} from './columns'

/** ข้อมูลเดิมใน DB ที่ใช้ตรวจ (โหลดครั้งเดียวโดย loadImportSnapshot) */
export interface ExistingSnapshot {
  vehicles: { id: string; plate: string; status: VehicleStatusKey }[]
  insurers: { id: string; name: string; isActive: boolean }[]
  coverages: {
    id: string
    vehicleId: string
    type: CoverageTypeKey
    endDate: string
    renewalStatus: RenewalStatusKey
    renewedToId: string | null
  }[]
}

export interface VehicleUpsert {
  plate: string
  existingId: string | null
  /** เฉพาะช่องที่กรอก — ช่องว่างไม่อยู่ใน data (คงค่าเดิม) */
  data: {
    fleetNumber?: string
    ownerName?: string
    vehicleType?: string
    brand?: string
    chassisNumber?: string
    fuelType?: string
    note?: string
    weightKg?: number
    status?: VehicleStatusKey
    statusDate?: string
  }
}

export interface CoverageUpsert {
  plate: string
  type: CoverageTypeKey
  endDate: string
  existingId: string | null
  data: {
    insurerId?: string
    coverageClass?: string
    policyNumber?: string
    startDate?: string
    amount?: number
    serviceFee?: number
    pairedPlate?: string
    renewalStatus?: ImportStatusKey
    notRenewedReason?: NotRenewedReasonKey
    renewalNote?: string
  }
}

export interface ImportPlan {
  vehicles: VehicleUpsert[]
  coverages: CoverageUpsert[]
}

export interface ImportValidation {
  errors: ImportErrorDto[]
  unknownInsurers: string[]
  plan: ImportPlan
  summary: ImportSummaryDto
}

const VEHICLE_TEXT_FIELDS = ['fleetNumber', 'ownerName', 'vehicleType', 'brand', 'chassisNumber', 'fuelType', 'note'] as const

const choices = (labels: Record<string, string>) => `ต้องเป็น ${Object.values(labels).join(' / ')}`

function pushDuplicates(
  seen: Map<string, number[]>,
  sheet: string,
  field: string,
  describe: (key: string) => string,
  errors: ImportErrorDto[],
) {
  for (const [key, rows] of seen) {
    if (rows.length < 2) continue
    for (const row of rows) errors.push({ sheet, row, field, message: `${describe(key)} ซ้ำในไฟล์ (แถว ${rows.join(', ')})` })
  }
}

function validateVehicles(
  rows: RawRow<VehicleColumnKey>[],
  vehicleByPlate: Map<string, ExistingSnapshot['vehicles'][number]>,
  errors: ImportErrorDto[],
): VehicleUpsert[] {
  const result: VehicleUpsert[] = []
  const seen = new Map<string, number[]>()
  for (const r of rows) {
    const err = (field: VehicleColumnKey, message: string) =>
      errors.push({ sheet: VEHICLE_SHEET, row: r.row, field: VEHICLE_COLUMNS[field], message })
    const plate = normalizePlate(cellText(r.values.plate))
    if (!plate) {
      err('plate', 'กรุณากรอกทะเบียน')
      continue
    }
    seen.set(plate, [...(seen.get(plate) ?? []), r.row])

    const data: VehicleUpsert['data'] = {}
    for (const field of VEHICLE_TEXT_FIELDS) {
      const text = cellText(r.values[field])
      if (text) data[field] = text
    }
    const weight = parseImportInt(r.values.weightKg)
    if ('error' in weight) err('weightKg', weight.error)
    else if (weight.value !== null) data.weightKg = weight.value
    const status = lookupLabel(VEHICLE_STATUS_LABELS, r.values.status)
    if (status === undefined) err('status', choices(VEHICLE_STATUS_LABELS))
    else if (status) data.status = status
    const statusDate = parseImportDate(r.values.statusDate)
    if ('error' in statusDate) err('statusDate', statusDate.error)
    else if (statusDate.value) data.statusDate = statusDate.value

    const current = vehicleByPlate.get(plate)
    if (!current) {
      if (!data.ownerName) err('ownerName', 'รถใหม่ต้องกรอกบริษัท')
      if (!data.vehicleType) err('vehicleType', 'รถใหม่ต้องกรอกลักษณะ')
    }
    result.push({ plate, existingId: current?.id ?? null, data })
  }
  pushDuplicates(seen, VEHICLE_SHEET, VEHICLE_COLUMNS.plate, (plate) => `ทะเบียน ${plate}`, errors)
  return result
}

function validateCoverages(
  rows: RawRow<CoverageColumnKey>[],
  existing: ExistingSnapshot,
  knownPlates: Set<string>,
  errors: ImportErrorDto[],
  unknownInsurers: Set<string>,
): CoverageUpsert[] {
  const vehicleIdByPlate = new Map(existing.vehicles.map((v) => [v.plate, v.id]))
  const insurerByName = new Map(existing.insurers.map((i) => [i.name, i]))
  const coverageByKey = new Map(existing.coverages.map((c) => [`${c.vehicleId}|${c.type}|${c.endDate}`, c]))
  const result: CoverageUpsert[] = []
  const seen = new Map<string, number[]>()

  for (const r of rows) {
    const err = (field: CoverageColumnKey, message: string) =>
      errors.push({ sheet: COVERAGE_SHEET, row: r.row, field: COVERAGE_COLUMNS[field], message })

    const plate = normalizePlate(cellText(r.values.plate))
    const type = lookupLabel(COVERAGE_TYPE_LABELS, r.values.type)
    const endDate = parseImportDate(r.values.endDate)
    const end = 'error' in endDate ? null : endDate.value
    if (!plate) err('plate', 'กรุณากรอกทะเบียน')
    else if (!knownPlates.has(plate)) err('plate', `ไม่พบรถทะเบียน ${plate} — เพิ่มในชีต "${VEHICLE_SHEET}" ก่อน`)
    if (type === null) err('type', 'กรุณาเลือกประเภท')
    else if (type === undefined) err('type', choices(COVERAGE_TYPE_LABELS))
    if ('error' in endDate) err('endDate', endDate.error)
    else if (end === null) err('endDate', 'กรุณากรอกวันสิ้นสุด')
    // ช่อง key ไม่ครบ → ข้ามการตรวจช่องอื่นของแถวนี้ (แก้ key แล้วตรวจใหม่)
    if (!plate || !knownPlates.has(plate) || !type || !end) continue

    const key = `${plate}|${type}|${end}`
    seen.set(key, [...(seen.get(key) ?? []), r.row])
    const isMotor = type === 'MOTOR_INSURANCE'
    const data: CoverageUpsert['data'] = {}

    const insurerName = cellText(r.values.insurer)
    if (insurerName) {
      const insurer = insurerByName.get(insurerName)
      if (type === 'TAX') err('insurer', 'ภาษีไม่ต้องกรอกบริษัทประกัน')
      else if (!insurer) {
        unknownInsurers.add(insurerName)
        err('insurer', `ไม่พบบริษัทประกัน "${insurerName}" ในระบบ`)
      } else if (!insurer.isActive) err('insurer', `บริษัทประกัน "${insurerName}" ถูกปิดใช้งาน`)
      else data.insurerId = insurer.id
    }

    const coverageClass = cellText(r.values.coverageClass)
    if (coverageClass) {
      if (!isMotor) err('coverageClass', 'กรอกชั้นได้เฉพาะประกันรถยนต์')
      else if (!(COVERAGE_CLASSES as readonly string[]).includes(coverageClass)) {
        err('coverageClass', `ชั้นต้องเป็น ${COVERAGE_CLASSES.join(' / ')}`)
      } else data.coverageClass = coverageClass
    }

    const pairedPlate = normalizePlate(cellText(r.values.pairedPlate))
    if (pairedPlate) {
      if (!isMotor) err('pairedPlate', 'กรอกหางคู่ได้เฉพาะประกันรถยนต์')
      else if (pairedPlate === plate) err('pairedPlate', 'หางคู่ต้องเป็นรถคนละคัน')
      else if (!knownPlates.has(pairedPlate)) err('pairedPlate', `ไม่พบรถทะเบียน ${pairedPlate}`)
      else data.pairedPlate = pairedPlate
    }

    const policyNumber = cellText(r.values.policyNumber)
    if (policyNumber) data.policyNumber = policyNumber
    const startDate = parseImportDate(r.values.startDate)
    if ('error' in startDate) err('startDate', startDate.error)
    else if (startDate.value && startDate.value > end) err('startDate', 'วันเริ่มต้องไม่หลังวันสิ้นสุด')
    else if (startDate.value) data.startDate = startDate.value
    for (const field of ['amount', 'serviceFee'] as const) {
      const money = parseImportMoney(r.values[field])
      if ('error' in money) err(field, money.error)
      else if (money.value !== null) data[field] = money.value
    }
    const note = cellText(r.values.renewalNote)
    if (note) data.renewalNote = note

    const status = lookupLabel(IMPORT_STATUS_LABELS, r.values.renewalStatus)
    if (status === undefined) {
      const isRenewed = cellText(r.values.renewalStatus).replace(/\s/g, '') === 'ต่อแล้ว'
      err('renewalStatus', isRenewed ? 'ไม่รับสถานะ "ต่อแล้ว" — ระบบปิดงวดเก่าให้เองเมื่อมีงวดใหม่' : choices(IMPORT_STATUS_LABELS))
    } else if (status) data.renewalStatus = status

    const reason = lookupLabel(NOT_RENEWED_REASON_LABELS, r.values.notRenewedReason)
    if (reason === undefined) err('notRenewedReason', choices(NOT_RENEWED_REASON_LABELS))
    else if (reason && status !== 'NOT_RENEWED') err('notRenewedReason', 'กรอกเหตุผลได้เฉพาะสถานะ "ไม่ต่อ"')
    else if (reason) data.notRenewedReason = reason
    if (status === 'NOT_RENEWED' && reason === null) err('notRenewedReason', 'สถานะ "ไม่ต่อ" ต้องกรอกเหตุผล')
    if (reason === 'OTHER' && !note) err('renewalNote', 'เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ')

    const vehicleId = vehicleIdByPlate.get(plate)
    const current = vehicleId ? coverageByKey.get(`${vehicleId}|${type}|${end}`) : undefined
    if (current && status && !isOpenStatus(current.renewalStatus) && current.renewalStatus !== status) {
      err('renewalStatus', 'งวดนี้ปิดแล้ว — เปลี่ยนสถานะผ่านหน้าจอ')
    }
    result.push({ plate, type, endDate: end, existingId: current?.id ?? null, data })
  }

  pushDuplicates(seen, COVERAGE_SHEET, COVERAGE_COLUMNS.endDate, (key) => {
    const [plate, type, end] = key.split('|')
    return `งวด ${plate} ${COVERAGE_TYPE_LABELS[type as CoverageTypeKey]} หมด ${end}`
  }, errors)
  return result
}

/** จำลองผลสำหรับ preview — ต้องตรงกับ applyRenewalImport (upsert แล้ว enforceCoverageRules กับรถที่ไฟล์แตะ) */
function simulateSummary(plan: ImportPlan, existing: ExistingSnapshot): ImportSummaryDto {
  const vehicleByPlate = new Map(existing.vehicles.map((v) => [v.plate, v]))
  const idOf = (plate: string) => vehicleByPlate.get(plate)?.id ?? `new:${plate}`
  const finalStatus = new Map<string, VehicleStatusKey>(existing.vehicles.map((v) => [v.id, v.status]))
  for (const v of plan.vehicles) if (v.data.status) finalStatus.set(idOf(v.plate), v.data.status)

  type SimRow = AutoCloseRow & { vehicleId: string; type: CoverageTypeKey }
  const rows = new Map<string, SimRow>(existing.coverages.map((c) => [c.id, { ...c }]))
  plan.coverages.forEach((c, i) => {
    const current = c.existingId ? rows.get(c.existingId) : undefined
    if (current) {
      if (c.data.renewalStatus) current.renewalStatus = c.data.renewalStatus
      return
    }
    const id = `new:${i}`
    rows.set(id, {
      id,
      vehicleId: idOf(c.plate),
      type: c.type,
      endDate: c.endDate,
      renewalStatus: c.data.renewalStatus ?? 'PENDING',
      renewedToId: null,
    })
  })

  const touched = new Set([...plan.vehicles.map((v) => idOf(v.plate)), ...plan.coverages.map((c) => idOf(c.plate))])
  const groups = new Map<string, SimRow[]>()
  for (const row of rows.values()) {
    if (!touched.has(row.vehicleId)) continue
    const key = `${row.vehicleId}|${row.type}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  let autoClosed = 0
  for (const group of groups.values()) {
    const sold = finalStatus.get(group[0].vehicleId) === 'SOLD'
    autoClosed += sold ? group.filter((r) => isOpenStatus(r.renewalStatus)).length : planAutoClose(group).length
  }

  return {
    vehiclesCreated: plan.vehicles.filter((v) => !v.existingId).length,
    vehiclesUpdated: plan.vehicles.filter((v) => v.existingId).length,
    coveragesCreated: plan.coverages.filter((c) => !c.existingId).length,
    coveragesUpdated: plan.coverages.filter((c) => c.existingId).length,
    coveragesAutoClosed: autoClosed,
  }
}

export function validateRenewalImport(
  input: { vehicles: RawRow<VehicleColumnKey>[]; coverages: RawRow<CoverageColumnKey>[] },
  existing: ExistingSnapshot,
): ImportValidation {
  const errors: ImportErrorDto[] = []
  const unknownInsurers = new Set<string>()
  const vehicleByPlate = new Map(existing.vehicles.map((v) => [v.plate, v]))
  const vehicles = validateVehicles(input.vehicles, vehicleByPlate, errors)
  const knownPlates = new Set([...vehicleByPlate.keys(), ...vehicles.map((v) => v.plate)])
  const coverages = validateCoverages(input.coverages, existing, knownPlates, errors, unknownInsurers)
  const plan = { vehicles, coverages }
  // ชีตรถก่อน แล้วเรียงตามแถว (sort เสถียร — ช่องในแถวเดียวกันคงลำดับเดิม)
  errors.sort((a, b) => (a.sheet === b.sheet ? a.row - b.row : a.sheet === VEHICLE_SHEET ? -1 : 1))
  return {
    errors,
    unknownInsurers: [...unknownInsurers].sort((a, b) => a.localeCompare(b, 'th')),
    plan,
    summary: simulateSummary(plan, existing),
  }
}
```

- [ ] **Step 7: `lib/renewals/import/workbook.ts`**

```ts
import ExcelJS from 'exceljs'
import { normalizeCellValue } from '@/lib/utils/excel'
import { COVERAGE_CLASSES, COVERAGE_TYPE_LABELS, NOT_RENEWED_REASON_LABELS, VEHICLE_STATUS_LABELS } from '../constants'
import { cellText, isBlank } from './cells'
import {
  COVERAGE_COLUMNS,
  COVERAGE_SHEET,
  GUIDE_ROWS,
  GUIDE_SHEET,
  IMPORT_STATUS_LABELS,
  VEHICLE_COLUMNS,
  VEHICLE_SHEET,
  type CoverageColumnKey,
  type RawRow,
  type VehicleColumnKey,
} from './columns'

/** จำนวนแถวที่ใส่ dropdown ไว้ให้ */
const TEMPLATE_ROWS = 1000

function addDataSheet<K extends string>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Record<K, string>,
  lists: Partial<Record<K, readonly string[]>>,
) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  const keys = Object.keys(columns) as K[]
  ws.addRow(keys.map((k) => columns[k]))
  ws.getRow(1).font = { bold: true }
  keys.forEach((key, i) => {
    ws.getColumn(i + 1).width = 18
    const list = lists[key]
    if (!list) return
    for (let row = 2; row <= TEMPLATE_ROWS; row++) {
      ws.getCell(row, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${list.join(',')}"`] }
    }
  })
}

export async function buildRenewalTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  addDataSheet(wb, VEHICLE_SHEET, VEHICLE_COLUMNS, { status: Object.values(VEHICLE_STATUS_LABELS) })
  addDataSheet(wb, COVERAGE_SHEET, COVERAGE_COLUMNS, {
    type: Object.values(COVERAGE_TYPE_LABELS),
    coverageClass: COVERAGE_CLASSES,
    renewalStatus: Object.values(IMPORT_STATUS_LABELS),
    notRenewedReason: Object.values(NOT_RENEWED_REASON_LABELS),
  })
  const guide = wb.addWorksheet(GUIDE_SHEET)
  guide.columns = [{ width: 24 }, { width: 100 }]
  for (const row of GUIDE_ROWS) guide.addRow(row)
  guide.getRow(1).font = { bold: true }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

function readSheet<K extends string>(
  ws: ExcelJS.Worksheet,
  columns: Record<K, string>,
): { rows: RawRow<K>[] } | { error: string } {
  const keys = Object.keys(columns) as K[]
  const colOf = new Map<K, number>()
  ws.getRow(1).eachCell((cell, col) => {
    const label = cellText(normalizeCellValue(cell.value))
    const key = keys.find((k) => columns[k] === label)
    if (key && !colOf.has(key)) colOf.set(key, col)
  })
  const missing = keys.filter((k) => !colOf.has(k)).map((k) => columns[k])
  if (missing.length > 0) return { error: `ชีต "${ws.name}" ไม่มีคอลัมน์: ${missing.join(', ')} — ดาวน์โหลด template ใหม่` }

  const rows: RawRow<K>[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const values: Partial<Record<K, unknown>> = {}
    for (const [key, col] of colOf) values[key] = normalizeCellValue(row.getCell(col).value)
    // แถวที่มีแค่ format / dropdown / สี ไม่นับ
    if (Object.values(values).every(isBlank)) return
    rows.push({ row: rowNumber, values })
  })
  return { rows }
}

export async function readRenewalWorkbook(
  buffer: ArrayBuffer,
): Promise<{ vehicles: RawRow<VehicleColumnKey>[]; coverages: RawRow<CoverageColumnKey>[] } | { error: string }> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch {
    return { error: 'อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .xlsx' }
  }
  const vehicleSheet = wb.getWorksheet(VEHICLE_SHEET)
  const coverageSheet = wb.getWorksheet(COVERAGE_SHEET)
  if (!vehicleSheet || !coverageSheet) {
    return { error: `ไฟล์ต้องมีชีต "${VEHICLE_SHEET}" และ "${COVERAGE_SHEET}" — ดาวน์โหลด template` }
  }
  const vehicles = readSheet(vehicleSheet, VEHICLE_COLUMNS)
  if ('error' in vehicles) return vehicles
  const coverages = readSheet(coverageSheet, COVERAGE_COLUMNS)
  if ('error' in coverages) return coverages
  return { vehicles: vehicles.rows, coverages: coverages.rows }
}
```

- [ ] **Step 8: รันให้ผ่าน**

Run: `npx tsx --test lib/renewals/import/__tests__/*.test.ts`
Expected: PASS ทั้งหมด
Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

- [ ] **Step 9: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/utils/excel.ts lib/renewals/import
git commit -m "$(cat <<'EOF'
feat(renewals): template และตัวตรวจไฟล์ import (วันที่ พ.ศ., คอมมา, แถวว่าง, ปิดงวดอัตโนมัติ)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: บันทึก import + API + หน้านำเข้า Excel

**Files:**
- Create: `lib/renewals/import/apply.ts`
- Create: `app/api/renewals/import/route.ts`, `app/api/renewals/import/template/route.ts`
- Create: `components/renewals/RenewalImport.tsx`, `app/(protected)/renewals/import/page.tsx`
- Create: `e2e/renewals/import.spec.ts`

**Interfaces:**
- Consumes: Task 11, `enforceCoverageRules` (Task 6), insurers API `{ names }` (Task 4)
- Produces:
  - `loadImportSnapshot(): Promise<ExistingSnapshot>`, `applyRenewalImport(plan: ImportPlan, userId: string): Promise<ImportSummaryDto>`
  - `POST /api/renewals/import` (multipart `file`, `mode=preview|commit`) → preview 200 `ImportPreviewResponse` / commit 201 `ImportCommitResponse` / ไม่ผ่าน 400
  - `GET /api/renewals/import/template` → xlsx
  - testid: `import-template-btn`, `import-select-btn`, `import-preview-btn`, `import-add-insurers-btn`, `import-commit-btn`, `import-summary-{key}`

- [ ] **Step 1: เขียน e2e ที่ fail**

`e2e/renewals/import.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import type { VehicleListItemDto } from '../../types/renewals'
import { cleanupRenewals, expectJson, getVehicleDetail, login } from './helpers'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** ดาวน์โหลด template จาก API แล้วเติมแถว (เริ่มแถว 2) */
async function buildFile(page: Page, vehicles: unknown[][], coverages: unknown[][]): Promise<Buffer> {
  const template = await page.request.get('/api/renewals/import/template')
  expect(template.status()).toBe(200)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await template.body())
  vehicles.forEach((values, i) => {
    wb.getWorksheet('รถ')!.getRow(i + 2).values = values as ExcelJS.CellValue[]
  })
  coverages.forEach((values, i) => {
    wb.getWorksheet('งวด')!.getRow(i + 2).values = values as ExcelJS.CellValue[]
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function uploadAndPreview(page: Page, buffer: Buffer) {
  await page.goto('/renewals/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'import.xlsx', mimeType: XLSX, buffer })
  await page.getByTestId('import-preview-btn').click()
}

const summaryOf = (page: Page, key: string) => page.getByTestId(`import-summary-${key}`)

test.describe.serial('นำเข้า Excel', () => {
  test.beforeAll(() => cleanupRenewals())
  test.afterAll(() => cleanupRenewals())
  test.beforeEach(async ({ page }) => login(page, 'testinsurance', /\/renewals$/))

  test('preview → เพิ่มบริษัทประกันที่ไม่มี → commit; รถที่ขายในไฟล์ปิดงวดอัตโนมัติ', async ({ page }) => {
    const buffer = await buildFile(
      page,
      [
        ['E2E-6001 กท', '901', 'E2E บริษัท', 'ลากจูง'],
        ['E2E-6002 กท.', '902', 'E2E บริษัท', 'หาง'],
        ['E2E-6003 กท', '903', 'E2E บริษัท', 'ลากจูง', '', '', '', '', 'ขาย', '06/07/2569'],
      ],
      [
        ['E2E-6001 กท', 'ประกันรถยนต์', 'E2E ประกันภัย ใหม่', 'ป.3', 'POL-1', '09/01/2569', '09/01/2570', '19,900', '', 'E2E-6002  กท'],
        ['E2E-6003 กท', 'พรบ.', 'E2E ประกันภัย ใหม่', '', '', '', '31/03/2570', '', '', '', 'รอต่อ'],
      ],
    )
    await uploadAndPreview(page, buffer)
    await expect(page.getByText('ไม่พบบริษัทประกัน "E2E ประกันภัย ใหม่" ในระบบ').first()).toBeVisible()
    await expect(page.getByTestId('import-commit-btn')).toBeDisabled()

    await page.getByTestId('import-add-insurers-btn').click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(page.getByText('ไฟล์ถูกต้อง พร้อมนำเข้า')).toBeVisible()
    await expect(summaryOf(page, 'vehiclesCreated')).toHaveText('3')
    await expect(summaryOf(page, 'coveragesCreated')).toHaveText('2')
    await expect(summaryOf(page, 'coveragesAutoClosed')).toHaveText('1')

    await page.getByTestId('import-commit-btn').click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await expect(page.getByText(/นำเข้าสำเร็จ/)).toBeVisible()

    const vehicles = await expectJson<VehicleListItemDto[]>(await page.request.get('/api/renewals/vehicles'))
    const idOf = (plate: string) => vehicles.find((v) => v.plate === plate)!.id
    expect(vehicles.map((v) => v.plate)).toEqual(expect.arrayContaining(['E2E-6001 กท', 'E2E-6002 กท', 'E2E-6003 กท']))

    expect((await getVehicleDetail(page, idOf('E2E-6001 กท'))).coverages[0]).toMatchObject({
      type: 'MOTOR_INSURANCE',
      coverageClass: 'ป.3',
      policyNumber: 'POL-1',
      startDate: '2026-01-09',
      endDate: '2027-01-09',
      amount: 19900,
      pairedPlate: 'E2E-6002 กท',
      insurerName: 'E2E ประกันภัย ใหม่',
    })
    const sold = await getVehicleDetail(page, idOf('E2E-6003 กท'))
    expect(sold.vehicle).toMatchObject({ status: 'SOLD', statusDate: '2026-07-06' })
    expect(sold.coverages[0]).toMatchObject({ renewalStatus: 'NOT_RENEWED', notRenewedReason: 'SOLD' })
  })

  test('ปีแบบ 2 หลัก → error ชัดเจน และกดนำเข้าไม่ได้', async ({ page }) => {
    const buffer = await buildFile(
      page,
      [['E2E-6101 กท', '', 'E2E บริษัท', 'ลากจูง']],
      [['E2E-6101 กท', 'พรบ.', '', '', '', '', '31/03/70']],
    )
    await uploadAndPreview(page, buffer)
    await expect(page.getByText('วันที่ "31/03/70" ไม่ถูกต้อง — ใช้ วว/ดด/ปปปป เช่น 31/03/2570')).toBeVisible()
    await expect(page.getByTestId('import-commit-btn')).toBeDisabled()
  })
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx playwright test e2e/renewals/import.spec.ts --workers=1`
Expected: FAIL — template route 404

- [ ] **Step 3: `lib/renewals/import/apply.ts`**

```ts
import { prisma } from '@/lib/prisma'
import type { ImportSummaryDto } from '@/types/renewals'
import { enforceCoverageRules } from '../coverageService'
import { dateToYmd, ymdToDate } from '../dateOnly'
import type { ExistingSnapshot, ImportPlan } from './validate'

/** โหลดข้อมูลเดิมครั้งเดียว (นอก transaction) สำหรับ validateRenewalImport */
export async function loadImportSnapshot(): Promise<ExistingSnapshot> {
  const [vehicles, insurers, coverages] = await Promise.all([
    prisma.vehicle.findMany({ select: { id: true, plate: true, status: true } }),
    prisma.insurer.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.vehicleCoverage.findMany({
      select: { id: true, vehicleId: true, type: true, endDate: true, renewalStatus: true, renewedToId: true },
    }),
  ])
  return { vehicles, insurers, coverages: coverages.map((c) => ({ ...c, endDate: dateToYmd(c.endDate) })) }
}

/**
 * บันทึกแผนจาก validateRenewalImport (ต้องไม่มี error) ใน transaction เดียว
 * แล้วบังคับกติกางวด (ปิดงวดเก่า / รถขาย) กับรถที่ไฟล์แตะ
 */
export async function applyRenewalImport(plan: ImportPlan, userId: string): Promise<ImportSummaryDto> {
  return prisma.$transaction(
    async (tx) => {
      const summary: ImportSummaryDto = {
        vehiclesCreated: 0,
        vehiclesUpdated: 0,
        coveragesCreated: 0,
        coveragesUpdated: 0,
        coveragesAutoClosed: 0,
      }
      const plates = [
        ...new Set([
          ...plan.vehicles.map((v) => v.plate),
          ...plan.coverages.map((c) => c.plate),
          ...plan.coverages.flatMap((c) => (c.data.pairedPlate ? [c.data.pairedPlate] : [])),
        ]),
      ]
      const idByPlate = new Map(
        (await tx.vehicle.findMany({ where: { plate: { in: plates } }, select: { id: true, plate: true } })).map((v) => [v.plate, v.id]),
      )

      for (const v of plan.vehicles) {
        const { statusDate, ...rest } = v.data
        const data = { ...rest, ...(statusDate ? { statusDate: ymdToDate(statusDate) } : {}) }
        if (v.existingId) {
          await tx.vehicle.update({ where: { id: v.existingId }, data })
          summary.vehiclesUpdated++
        } else {
          // รถใหม่มี ownerName / vehicleType เสมอ (validate บังคับแล้ว)
          const created = await tx.vehicle.create({
            data: { ...data, plate: v.plate, ownerName: rest.ownerName ?? '', vehicleType: rest.vehicleType ?? '' },
          })
          idByPlate.set(v.plate, created.id)
          summary.vehiclesCreated++
        }
      }

      const now = new Date()
      const touched = new Set(plan.vehicles.map((v) => idByPlate.get(v.plate)).filter((id): id is string => !!id))
      for (const c of plan.coverages) {
        const vehicleId = idByPlate.get(c.plate)
        if (!vehicleId) throw new Error(`[renewals import] ไม่พบรถ ${c.plate}`) // validate รับประกันแล้ว
        touched.add(vehicleId)
        const { pairedPlate, startDate, renewalStatus, notRenewedReason, ...rest } = c.data
        const data = {
          ...rest,
          ...(startDate ? { startDate: ymdToDate(startDate) } : {}),
          ...(pairedPlate ? { pairedVehicleId: idByPlate.get(pairedPlate) } : {}),
          ...(renewalStatus
            ? {
                renewalStatus,
                notRenewedReason: renewalStatus === 'NOT_RENEWED' ? (notRenewedReason ?? null) : null,
                statusUpdatedAt: now,
                statusUpdatedById: userId,
              }
            : {}),
        }
        if (c.existingId) {
          await tx.vehicleCoverage.update({ where: { id: c.existingId }, data })
          summary.coveragesUpdated++
        } else {
          await tx.vehicleCoverage.create({
            data: { ...data, vehicleId, type: c.type, endDate: ymdToDate(c.endDate), createdById: userId },
          })
          summary.coveragesCreated++
        }
      }

      summary.coveragesAutoClosed = await enforceCoverageRules(tx, [...touched], userId)
      return summary
    },
    { timeout: 60_000 },
  )
}
```

- [ ] **Step 4: Routes**

`app/api/renewals/import/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { badRequest, renewalErrorResponse } from '@/lib/renewals/http'
import { applyRenewalImport, loadImportSnapshot } from '@/lib/renewals/import/apply'
import { validateRenewalImport } from '@/lib/renewals/import/validate'
import { readRenewalWorkbook } from '@/lib/renewals/import/workbook'
import type { ImportCommitResponse, ImportPreviewResponse } from '@/types/renewals'

const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** preview = ตรวจอย่างเดียว; commit = ตรวจซ้ำกับข้อมูลล่าสุดแล้วบันทึก (ไฟล์มี error → 400 ไม่บันทึกอะไร) */
export async function POST(req: Request) {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const mode = form?.get('mode')
    if (!(file instanceof File)) throw badRequest('กรุณาเลือกไฟล์')
    if (mode !== 'preview' && mode !== 'commit') throw badRequest('mode ต้องเป็น preview หรือ commit')
    if (file.size > MAX_IMPORT_BYTES) throw badRequest('ไฟล์ต้องไม่เกิน 5 MB')

    const parsed = await readRenewalWorkbook(await file.arrayBuffer())
    if ('error' in parsed) throw badRequest(parsed.error)
    const result = validateRenewalImport(parsed, await loadImportSnapshot())
    const preview: ImportPreviewResponse = {
      valid: result.errors.length === 0,
      errors: result.errors,
      unknownInsurers: result.unknownInsurers,
      summary: result.summary,
    }
    if (mode === 'preview') return NextResponse.json(preview)
    if (!preview.valid) return NextResponse.json(preview, { status: 400 })

    const body: ImportCommitResponse = { success: true, summary: await applyRenewalImport(result.plan, access.user.id) }
    return NextResponse.json(body, { status: 201 })
  } catch (error) {
    return renewalErrorResponse(error)
  }
}
```

`app/api/renewals/import/template/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireRenewalAccess } from '@/lib/renewals/access'
import { buildRenewalTemplate } from '@/lib/renewals/import/workbook'

export async function GET() {
  const access = await requireRenewalAccess()
  if ('response' in access) return access.response

  const buffer = await buildRenewalTemplate()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="renewals_template.xlsx"',
    },
  })
}
```

- [ ] **Step 5: หน้า import**

`components/renewals/RenewalImport.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Alert, App, Button, Descriptions, Space, Table, Upload, type TableColumnsType } from 'antd'
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { ImportCommitResponse, ImportErrorDto, ImportPreviewResponse, ImportSummaryDto } from '@/types/renewals'
import { sendJson } from './api'

const SUMMARY_LABELS: [keyof ImportSummaryDto, string][] = [
  ['vehiclesCreated', 'รถใหม่'],
  ['vehiclesUpdated', 'รถที่อัปเดต'],
  ['coveragesCreated', 'งวดใหม่'],
  ['coveragesUpdated', 'งวดที่อัปเดต'],
  ['coveragesAutoClosed', 'งวดเก่าที่ปิดอัตโนมัติ'],
]

const describeSummary = (s: ImportSummaryDto) => SUMMARY_LABELS.map(([key, label]) => `${label} ${s[key]}`).join(', ')

type ImportResponseBody = Partial<ImportPreviewResponse> & Partial<ImportCommitResponse> & { error?: string }

const errorColumns: TableColumnsType<ImportErrorDto> = [
  { title: 'ชีต', dataIndex: 'sheet', key: 'sheet', width: 70 },
  { title: 'แถว', dataIndex: 'row', key: 'row', width: 70 },
  { title: 'คอลัมน์', dataIndex: 'field', key: 'field', width: 140 },
  { title: 'ปัญหา', dataIndex: 'message', key: 'message' },
]

export default function RenewalImport() {
  const { message, modal } = App.useApp()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async (mode: 'preview' | 'commit'): Promise<{ status: number; body: ImportResponseBody } | null> => {
    if (!file) return null
    const form = new FormData()
    form.append('file', file)
    form.append('mode', mode)
    try {
      const res = await fetch('/api/renewals/import', { method: 'POST', body: form })
      return { status: res.status, body: (await res.json().catch(() => ({}))) as ImportResponseBody }
    } catch {
      message.error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      return null
    }
  }

  const runPreview = async () => {
    setBusy(true)
    const res = await send('preview')
    setBusy(false)
    if (!res) return
    if (res.status !== 200) {
      setPreview(null)
      message.error(res.body.error || 'ตรวจสอบไฟล์ไม่สำเร็จ')
      return
    }
    setPreview(res.body as ImportPreviewResponse)
  }

  const addUnknownInsurers = () => {
    if (!preview) return
    modal.confirm({
      title: 'เพิ่มบริษัทประกัน',
      content: preview.unknownInsurers.join(', '),
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: async () => {
        const res = await sendJson('/api/renewals/insurers', { names: preview.unknownInsurers })
        if (!res.ok) {
          message.error(res.error)
          return
        }
        message.success('เพิ่มบริษัทประกันสำเร็จ')
        await runPreview()
      },
    })
  }

  const runCommit = () => {
    modal.confirm({
      title: 'ยืนยันนำเข้า',
      content: 'บันทึกข้อมูลทั้งไฟล์เข้าระบบ',
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: async () => {
        setBusy(true)
        const res = await send('commit')
        setBusy(false)
        if (!res) return
        if (res.status !== 201 || !res.body.summary) {
          message.error(res.body.error || 'นำเข้าไม่สำเร็จ — ตรวจสอบไฟล์อีกครั้ง')
          if (res.body.errors) setPreview(res.body as ImportPreviewResponse)
          return
        }
        message.success(`นำเข้าสำเร็จ: ${describeSummary(res.body.summary)}`)
        setPreview(null)
        setFile(null)
      },
    })
  }

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>นำเข้า Excel</h2>
        <Button icon={<DownloadOutlined />} href="/api/renewals/import/template" data-testid="import-template-btn">
          ดาวน์โหลด template
        </Button>
      </div>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space>
          <Upload
            accept=".xlsx"
            maxCount={1}
            fileList={file ? [{ uid: 'import-file', name: file.name, status: 'done' }] : []}
            beforeUpload={(f) => {
              setFile(f)
              setPreview(null)
              return false
            }}
            onRemove={() => {
              setFile(null)
              setPreview(null)
            }}
          >
            <Button icon={<UploadOutlined />} data-testid="import-select-btn">
              เลือกไฟล์ .xlsx
            </Button>
          </Upload>
          <Button type="primary" disabled={!file} loading={busy} onClick={runPreview} data-testid="import-preview-btn">
            ตรวจสอบไฟล์
          </Button>
        </Space>

        {preview && (
          <>
            <Descriptions
              size="small"
              bordered
              column={{ xs: 1, md: 5 }}
              items={SUMMARY_LABELS.map(([key, label]) => ({
                key,
                label,
                children: <span data-testid={`import-summary-${key}`}>{preview.summary[key]}</span>,
              }))}
            />
            {preview.unknownInsurers.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`บริษัทประกันที่ยังไม่มีในระบบ: ${preview.unknownInsurers.join(', ')}`}
                action={
                  <Button size="small" onClick={addUnknownInsurers} data-testid="import-add-insurers-btn">
                    เพิ่มบริษัทประกันที่ยังไม่มี ({preview.unknownInsurers.length} ราย)
                  </Button>
                }
              />
            )}
            {preview.valid ? (
              <Alert type="success" showIcon message="ไฟล์ถูกต้อง พร้อมนำเข้า" />
            ) : (
              <Table
                size="small"
                rowKey={(e) => `${e.sheet}-${e.row}-${e.field}-${e.message}`}
                dataSource={preview.errors}
                columns={errorColumns}
                pagination={{ pageSize: 50 }}
              />
            )}
            <Button type="primary" disabled={!preview.valid} loading={busy} onClick={runCommit} data-testid="import-commit-btn">
              ยืนยันนำเข้า
            </Button>
          </>
        )}
      </Space>
    </>
  )
}
```

`app/(protected)/renewals/import/page.tsx`:

```tsx
import RenewalImport from '@/components/renewals/RenewalImport'

export default function RenewalImportPage() {
  return <RenewalImport />
}
```

- [ ] **Step 6: รันให้ผ่าน**

Run: `npx playwright test e2e/renewals/import.spec.ts --workers=1` → PASS 2 tests
Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"` → 2 error เดิม

- [ ] **Step 7: Commit**

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
git add lib/renewals/import/apply.ts app/api/renewals/import components/renewals/RenewalImport.tsx "app/(protected)/renewals/import" e2e/renewals/import.spec.ts
git commit -m "$(cat <<'EOF'
feat(renewals): หน้านำเข้า Excel พร้อม preview, เพิ่มบริษัทประกันที่ขาด และบันทึกทั้งไฟล์ใน transaction เดียว

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: แปลงไฟล์ Excel ปี 69 เป็น template (one-off — ไม่ commit)

**Files (ทั้งหมดอยู่ใน scratchpad — ไม่เข้า repo):**
- Create: `<scratchpad>/convert/convert_renewals_69.py`
- Create: `<scratchpad>/convert/check_import.ts`
- Output: `<scratchpad>/convert/out/renewals_import_69.xlsx`, `<scratchpad>/convert/out/renewals_import_69_report.txt`

**Interfaces:**
- Consumes: `readRenewalWorkbook`, `validateRenewalImport` (Task 11) — ใช้ตรวจไฟล์ที่แปลงแล้วแบบ dry-run
- Produces: ไฟล์ template ที่กรอกข้อมูลปี 69 + รายงานแถวที่แปลงไม่ได้ ให้ผู้ใช้ตรวจก่อน upload (ภาษีวันสิ้นสุดว่าง ไฮไลต์เหลือง)

ไฟล์ต้นฉบับเป็นข้อมูลที่ผู้ใช้ส่งมา: copy ไปไว้ในโฟลเดอร์แยก และรัน Python ด้วย `-I` ตามกติกา untrusted data

- [ ] **Step 1: เตรียมไฟล์**

```bash
S=/private/tmp/claude-501/-Users-burinlumyai-Projects-syl-system/aaffb75d-093d-496a-916d-e7ab30b87739/scratchpad
mkdir -p "$S/convert/src" "$S/convert/out"
cp "/Users/burinlumyai/Documents/SYL/พรบ. +ประกัน+สินค้า ทั้งปี 69.xlsx" "$S/convert/src/source.xlsx"
```

- [ ] **Step 2: เขียน `convert_renewals_69.py`**

```python
"""แปลง 'พรบ. +ประกัน+สินค้า ทั้งปี 69.xlsx' เป็น template นำเข้าระบบต่ออายุรถ (one-off, ไม่ commit)
usage: python3 -I convert_renewals_69.py <source.xlsx> <out.xlsx> <report.txt>
"""
import datetime as dt
import re
import sys
from collections import OrderedDict

import openpyxl
from openpyxl.styles import Font, PatternFill

SRC, OUT, REPORT = sys.argv[1:4]
wb = openpyxl.load_workbook(SRC, data_only=True)
report = []

PLATE_RE = re.compile(r'^\d{1,3}-\d{4}')
PERSON_PLATE_RE = re.compile(r'^[ก-ฮ]{1,3}\s*\d{1,4}\s')
FUELS = ('ดีเซล', 'เบนซิน', 'แก๊ส', 'NGV', 'LPG')
INSURERS = [
    ('วิริยะ', 'วิริยะประกันภัย'), ('เออร์โก', 'เออร์โกประกันภัย'), ('กรุงเทพ', 'กรุงเทพประกันภัย'),
    ('ทิพย', 'ทิพยประกันภัย'), ('เมืองไทย', 'เมืองไทยประกันภัย'), ('axa', 'แอกซ่าประกันภัย'),
    ('lmg', 'แอลเอ็มจีประกันภัย'), ('แอลเอ็มจี', 'แอลเอ็มจีประกันภัย'), ('ไอโออิ', 'ไอโออิ กรุงเทพ ประกันภัย'),
    ('อินทร', 'อินทรประกันภัย'), ('ไทยพัฒนา', 'ไทยพัฒนาประกันภัย'), ('msig', 'เอ็ม เอส ไอ จี ประกันภัย'),
    ('นวกิจ', 'นวกิจประกันภัย'),
]


def text(value):
    return '' if value is None else str(value).strip()


def norm_plate(value):
    return re.sub(r'\.+$', '', re.sub(r'\s+', ' ', text(value))).strip()


def is_plate(value):
    plate = norm_plate(value)
    return bool(PLATE_RE.match(plate) or PERSON_PLATE_RE.match(plate + ' '))


def be_date(value):
    """' 31-03-70' / '09-01-69' / '30-0670' / datetime → date ค.ศ."""
    if isinstance(value, dt.datetime):
        return value.date()
    m = re.match(r'^\s*(\d{1,2})-(\d{1,2})-?(\d{2})\s*$', text(value))
    if not m:
        return None
    d, mo, yy = (int(x) for x in m.groups())
    try:
        return dt.date(2500 + yy - 543, mo, d)
    except ValueError:
        return None


def note_date(note):
    """'วันที่ 29-6-69' / '( 17/7/69 )' / '2-6-2569' → date ค.ศ."""
    m = re.search(r'(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})', note)
    if not m:
        return None
    d, mo, y = (int(x) for x in m.groups())
    try:
        return dt.date((2500 + y if y < 100 else y) - 543, mo, d)
    except ValueError:
        return None


def norm_insurer(raw):
    low = text(raw).lower()
    for key, name in INSURERS:
        if key in low:
            return name
    return None


def coverage_class(raw):
    m = re.search(r'ป\s*\.?\s*([123])\s*(\+?)', text(raw))
    return f'ป.{m.group(1)}{m.group(2)}' if m else ''


def owner_of(row_text):
    if 'แวลู' in row_text or 'VALUE' in row_text.upper():
        return 'แวลู ทรานสปอร์ต'
    if 'ทรงยุทธ' in row_text or 'SONGYOUTH' in row_text.upper():
        return 'ทรงยุทธ โลจิสติคส์'
    if 'ชื่อบุคคล' in row_text:
        return 'PERSON'
    return None


vehicles = OrderedDict()   # plate → dict
coverages = OrderedDict()  # (plate, type, end) → dict


def upsert_vehicle(plate, where, **fields):
    v = vehicles.setdefault(plate, {'plate': plate})
    for key, value in fields.items():
        if value in (None, ''):
            continue
        if v.get(key) not in (None, '') and v[key] != value:
            report.append(f'{where}: {plate} {key} ไม่ตรงกับที่อื่น ("{v[key]}" vs "{value}") — ใช้ค่าแรก')
            continue
        v[key] = value


def add_coverage(plate, ctype, end, where, **fields):
    key = (plate, ctype, end)
    if key in coverages:
        report.append(f'{where}: งวดซ้ำ {plate} {ctype} {end} — ใช้แถวแรก')
        return
    coverages[key] = {'plate': plate, 'type': ctype, 'end': end, **fields}


def status_from_note(plate, note, where):
    """ม.79 / ขายรถ → รถขาย (งวดไม่ต่อ/ขายรถ), ม.89 → รถงดใช้ (งวดคงเปิด ให้เจ้าหน้าที่ตัดสินใจ)"""
    squashed = note.replace(' ', '')
    if 'ม.79' in squashed or 'ขายรถ' in squashed:
        upsert_vehicle(plate, where, status='ขาย', statusDate=note_date(note))
        return 'ไม่ต่อ', 'ขายรถ'
    if 'ม.89' in squashed:
        upsert_vehicle(plate, where, status='งดใช้', statusDate=note_date(note))
    return '', ''


# ---------- พรบ. (รถหลัก + งวด พรบ.) ----------
for name in ('พรบ.3', 'พรบ.6', 'พรบ.9', 'พรบ.12'):
    ws = wb[name]
    owner = None
    for r in range(1, ws.max_row + 1):
        cells = [ws.cell(r, c).value for c in range(1, 14)]
        owner = owner_of(' '.join(text(v) for v in cells)) or owner
        fleet, plate_raw, vtype, brand, chassis, insurer_raw, end_raw = cells[1:8]
        where = f'{name} แถว {r}'
        if not is_plate(plate_raw):
            if text(plate_raw) and text(plate_raw) != 'ทะเบียน':
                report.append(f'{where}: ข้าม — "{text(plate_raw)}" ไม่ใช่รูปแบบทะเบียน')
            continue
        plate = norm_plate(plate_raw)
        note = ' '.join(text(v) for v in cells[8:] if text(v))
        upsert_vehicle(plate, where, fleetNumber=text(fleet), ownerName=owner, vehicleType=text(vtype),
                       brand='' if text(brand) == 'หาง' else text(brand), chassisNumber=text(chassis))
        status, reason = status_from_note(plate, note, where)
        end = be_date(end_raw)
        if end is None:
            report.append(f'{where}: {plate} อ่านวันสิ้นสุด พรบ. ไม่ได้ ("{text(end_raw)}") — ไม่สร้างงวด')
            continue
        add_coverage(plate, 'พรบ.', end, where, insurer=norm_insurer(insurer_raw) or text(insurer_raw),
                     status=status, reason=reason, note=note)

# ---------- ภาษี (เฉพาะคันในชีต 6/69 — วันสิ้นสุดว่าง ให้เจ้าหน้าที่กรอก) ----------
tax_rows = OrderedDict()
ws = wb['ภาษี 6-69']
owner = None
for r in range(1, ws.max_row + 1):
    cells = [ws.cell(r, c).value for c in range(1, 11)]
    owner = owner_of(' '.join(text(v) for v in cells)) or owner
    _, fleet, plate_raw, vtype, brand, fuel, chassis, weight, tax, fee = cells
    if not is_plate(plate_raw):
        continue
    plate = norm_plate(plate_raw)
    where = f'ภาษี 6-69 แถว {r}'
    extra = {} if plate in vehicles else {
        'fleetNumber': text(fleet), 'vehicleType': text(vtype) or text(brand),
        'brand': '' if text(brand) == 'หาง' else text(brand), 'chassisNumber': text(chassis),
    }
    upsert_vehicle(plate, where, ownerName=owner,
                   fuelType=text(fuel) if any(f in text(fuel) for f in FUELS) else '',
                   weightKg=int(weight) if isinstance(weight, (int, float)) else None, **extra)
    # ส่วนท้ายชีตเป็นสำเนาบางคันที่ส่งตัวแทน — ใช้แถวแรกของแต่ละทะเบียน
    tax_rows.setdefault(plate, {'amount': tax, 'fee': fee})

# ---------- ประกันรถยนต์ / ประกันสินค้า ----------
for ws in [w for w in wb.worksheets if 'รถยนต์' in w.title and 'ขนส่ง' in w.title]:
    kind = 'ประกันรถยนต์'
    owner = None
    for r in range(1, ws.max_row + 1):
        cells = [ws.cell(r, c).value for c in range(1, 16)]
        row_text = ' '.join(text(v) for v in cells)
        if 'ประกันรถยนต์ประจำเดือน' in row_text:
            kind = 'ประกันรถยนต์'
        if 'ประกันสินค้าประจำเดือน' in row_text:
            kind = 'ประกันสินค้า'
        owner = owner_of(row_text) or owner
        no, plate_raw, vtype, paired_raw, _color, fuel, brand, chassis, insurer_raw, policy, premium, start_raw, end_raw = cells[:13]
        where = f'{ws.title} แถว {r}'
        if not is_plate(plate_raw):
            continue
        plate = norm_plate(plate_raw)
        person = owner == 'PERSON'
        # รถชื่อบุคคลเป็นประกันรถยนต์เสมอ (หัวตารางบางเดือนคัดลอกมาผิดเป็น "ความรับผิดผู้ขนส่ง")
        ctype = 'ประกันรถยนต์' if person else kind
        upsert_vehicle(plate, where,
                       ownerName=text(no).split('-')[0] if person else owner,
                       fleetNumber='' if person else text(no), vehicleType=text(vtype), brand=text(brand),
                       chassisNumber=text(chassis), fuelType=text(fuel) if any(f in text(fuel) for f in FUELS) else '')
        end = be_date(end_raw)
        if end is None:
            report.append(f'{where}: {plate} อ่านวันสิ้นสุดไม่ได้ ("{text(end_raw)}") — ไม่สร้างงวด')
            continue
        note = ' '.join(text(v) for v in cells[13:] if text(v))
        status, reason = status_from_note(plate, note, where)
        amount = premium if isinstance(premium, (int, float)) else None
        if amount is None and text(premium):
            # เบี้ยเป็นข้อความ เช่น "ไม่ต่อ" / "ไม่ใช้รถ" → งวดนี้ไม่ต่อ
            status = 'ไม่ต่อ'
            reason = reason or ('งดใช้' if 'ไม่ใช้' in text(premium) or 'ไม่ได้ใช้' in note else 'อื่นๆ')
            note = ' '.join(x for x in (note, text(premium)) if x)
        if not status and 'ไม่ได้ใช้' in note:
            status, reason = 'ไม่ต่อ', 'งดใช้'
        insurer = norm_insurer(insurer_raw)
        if insurer is None:
            report.append(f'{where}: ไม่รู้จักบริษัทประกัน "{text(insurer_raw)}" — ใส่ชื่อเดิม')
        if 'TKR' in text(insurer_raw):
            note = ' '.join(x for x in (note, 'TKR') if x)
        paired = norm_plate(paired_raw) if ctype == 'ประกันรถยนต์' and is_plate(paired_raw) else ''
        add_coverage(plate, ctype, end, where, insurer=insurer or text(insurer_raw),
                     cls=coverage_class(insurer_raw) if ctype == 'ประกันรถยนต์' else '',
                     policy=text(policy), start=be_date(start_raw), amount=amount, paired=paired,
                     status=status, reason=reason, note=note)

# ---------- ตรวจความครบก่อนเขียน ----------
for cov in coverages.values():
    if cov.get('paired') and cov['paired'] not in vehicles:
        report.append(f'หางคู่ {cov["paired"]} ของ {cov["plate"]} ไม่มีในรายการรถ — ตัดหางคู่ออก')
        cov['paired'] = ''
for v in vehicles.values():
    for key, label in (('ownerName', 'บริษัท'), ('vehicleType', 'ลักษณะ')):
        if not v.get(key):
            report.append(f'รถ {v["plate"]}: ไม่มี{label} — ต้องกรอกเองก่อน upload')

# ---------- เขียนไฟล์ตาม template ----------
V_HEAD = ['ทะเบียน', 'เบอร์รถ', 'บริษัท', 'ลักษณะ', 'ยี่ห้อ', 'เลขตัวถัง', 'เชื้อเพลิง', 'น้ำหนัก(กก.)', 'สถานะ', 'วันที่สถานะ', 'หมายเหตุ']
C_HEAD = ['ทะเบียน', 'ประเภท', 'บริษัทประกัน', 'ชั้น', 'เลขกรมธรรม์', 'วันเริ่ม', 'วันสิ้นสุด', 'เบี้ย/ภาษี', 'ค่าบริการ', 'ทะเบียนหางคู่', 'สถานะการต่อ', 'เหตุผลไม่ต่อ', 'หมายเหตุ']
YELLOW = PatternFill('solid', fgColor='FFFF00')

out = openpyxl.Workbook()
ws_v = out.active
ws_v.title = 'รถ'
ws_v.append(V_HEAD)
for v in vehicles.values():
    ws_v.append([v['plate'], v.get('fleetNumber', ''), v.get('ownerName', ''), v.get('vehicleType', ''),
                 v.get('brand', ''), v.get('chassisNumber', ''), v.get('fuelType', ''), v.get('weightKg'),
                 v.get('status', ''), v.get('statusDate'), ''])

ws_c = out.create_sheet('งวด')
ws_c.append(C_HEAD)
for cov in coverages.values():
    ws_c.append([cov['plate'], cov['type'], cov.get('insurer', ''), cov.get('cls', ''), cov.get('policy', ''),
                 cov.get('start'), cov['end'], cov.get('amount'), None, cov.get('paired', ''),
                 cov.get('status', ''), cov.get('reason', ''), cov.get('note', '')])
for plate, tax in tax_rows.items():
    ws_c.append([plate, 'ภาษี', '', '', '', None, None, tax['amount'], tax['fee'], '', '', '', 'ต่อภาษีเดือน 6/69'])
    ws_c.cell(ws_c.max_row, 7).fill = YELLOW  # วันสิ้นสุดภาษี — เจ้าหน้าที่ต้องกรอก

for ws in (ws_v, ws_c):
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value, dt.date):
                cell.number_format = 'DD/MM/YYYY'
    for cell in ws[1]:
        cell.font = Font(bold=True)

guide = out.create_sheet('วิธีกรอก')
guide.append(['หมายเหตุ', 'ไฟล์นี้แปลงจาก "พรบ. +ประกัน+สินค้า ทั้งปี 69.xlsx" — ช่องสีเหลือง (วันสิ้นสุดภาษี) ต้องกรอกก่อน upload'])
out.save(OUT)

with open(REPORT, 'w', encoding='utf-8') as f:
    f.write(f'รถ {len(vehicles)} คัน, งวด พรบ./ประกัน {len(coverages)} รายการ, งวดภาษี {len(tax_rows)} รายการ (ต้องกรอกวันสิ้นสุด)\n')
    f.write(f'ประเด็นที่ต้องตรวจ {len(report)} รายการ\n\n')
    f.write('\n'.join(report))
print(open(REPORT, encoding='utf-8').read()[:3000])
```

- [ ] **Step 3: รันแปลงไฟล์**

```bash
S=/private/tmp/claude-501/-Users-burinlumyai-Projects-syl-system/aaffb75d-093d-496a-916d-e7ab30b87739/scratchpad
python3 -I "$S/convert/convert_renewals_69.py" "$S/convert/src/source.xlsx" "$S/convert/out/renewals_import_69.xlsx" "$S/convert/out/renewals_import_69_report.txt"
```
Expected: บรรทัดแรกของรายงานแสดงจำนวนรถ ~200+ คัน และงวด; รายการประเด็นเป็นแถวที่ข้าม (เช่น `P55-4059`), ค่าที่ไม่ตรงกันระหว่างชีต, บริษัทประกันที่ไม่รู้จัก

- [ ] **Step 4: ตรวจไฟล์ที่แปลงแล้วด้วย validator จริง (dry-run)**

`<scratchpad>/convert/check_import.ts`:

```ts
import { readFileSync } from 'fs'
import { readRenewalWorkbook } from '/Users/burinlumyai/Projects/syl-system/lib/renewals/import/workbook'
import { validateRenewalImport } from '/Users/burinlumyai/Projects/syl-system/lib/renewals/import/validate'

async function main() {
  const buf = readFileSync(process.argv[2])
  const parsed = await readRenewalWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  if ('error' in parsed) throw new Error(parsed.error)
  // รอบแรกหาชื่อบริษัทประกันทั้งหมด แล้วตรวจรอบสองโดยสมมติว่าเพิ่มบริษัทครบแล้ว — เหลือแต่ปัญหาเรื่องรูปแบบข้อมูล
  const first = validateRenewalImport(parsed, { vehicles: [], insurers: [], coverages: [] })
  const insurers = first.unknownInsurers.map((name, i) => ({ id: `ins-${i}`, name, isActive: true }))
  const result = validateRenewalImport(parsed, { vehicles: [], insurers, coverages: [] })
  const counts = new Map<string, number>()
  for (const e of result.errors) {
    const key = `${e.sheet} / ${e.field}: ${e.message.replace(/".*?"/g, '"…"').replace(/\d{1,3}-\d{4}[^ ]*( [ก-ฮ]+)?/g, '<ทะเบียน>')}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  console.log('summary', result.summary)
  console.log('บริษัทประกันที่ต้องเพิ่ม', first.unknownInsurers)
  console.table([...counts].map(([message, count]) => ({ message, count })))
}

main()
```

Run (จาก project root เพื่อให้ tsx ใช้ path alias ของ tsconfig):
```bash
S=/private/tmp/claude-501/-Users-burinlumyai-Projects-syl-system/aaffb75d-093d-496a-916d-e7ab30b87739/scratchpad
npx tsx "$S/convert/check_import.ts" "$S/convert/out/renewals_import_69.xlsx"
```
Expected: error ที่เหลือมีแค่ `งวด / วันสิ้นสุด: กรุณากรอกวันสิ้นสุด` (จำนวน = งวดภาษี) และ `รถ / บริษัท|ลักษณะ` เฉพาะคันที่รายงานไว้แล้ว
ถ้ามี error ประเภทอื่น (เช่น ชั้นผิด, วันที่อ่านไม่ได้) ให้แก้ converter แล้วรัน Step 3–4 ใหม่จนเหลือแค่ประเภทที่คาดไว้

- [ ] **Step 5: ส่งมอบให้ผู้ใช้ตรวจ (ไม่ commit)**

รายงานผู้ใช้: path ของ `renewals_import_69.xlsx` และ `renewals_import_69_report.txt`, จำนวนรถ/งวด, รายชื่อบริษัทประกันที่ต้องกดเพิ่มตอน import, และสิ่งที่เจ้าหน้าที่ต้องทำก่อน upload (กรอกวันสิ้นสุดภาษีช่องสีเหลือง, ตรวจประเด็นในรายงาน) — การ upload จริงทำโดยเจ้าหน้าที่ผ่านหน้า `/renewals/import` หลัง deploy

---

### Task 14: ตรวจรอบสุดท้าย

**Files:**
- Modify (ถ้าจำเป็น): `docs/superpowers/specs/2026-10-06-vehicle-renewals-design.md` — sync กับโค้ดจริง

- [ ] **Step 1: Unit test ทั้งหมด**

Run: `npx tsx --test lib/renewals/__tests__/*.test.ts lib/renewals/import/__tests__/*.test.ts lib/utils/__tests__/*.test.ts`
Expected: PASS ทั้งหมด (รวม test เดิมของ `lib/utils`)

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit -p . 2>&1 | grep "error TS"`
Expected: เหลือ 2 error เดิมเท่านั้น

- [ ] **Step 3: E2E**

Run: `npx playwright test e2e/renewals --workers=1` → PASS ทั้งหมด
Run: `npx playwright test --workers=1` → ทั้ง suite; test ที่รู้ว่า flaky อยู่แล้ว ("อัตราค่าเที่ยวคนขับ Case 1" ใน `e2e/jobs/settings.spec.ts` — fail เฉพาะตอนรันต่อจาก test อื่น) ให้รันแยกยืนยันว่าผ่านเดี่ยวๆ แล้วรายงานตามจริง

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build สำเร็จ (ดูว่า middleware ใหม่ build ผ่านบน edge runtime — ไม่มี error เรื่อง module ที่ใช้ไม่ได้บน edge)

- [ ] **Step 5: GitNexus**

Run: `node .gitnexus/run.cjs detect-changes --scope compare --base-ref main --repo .`
รายงาน symbol/process ที่ได้รับผลกระทบ; ถ้า `partial: true` / `truncated: true` ให้รันใหม่ (เช่น `node .gitnexus/run.cjs analyze --index-only` ก่อน)

- [ ] **Step 6: Sync spec + commit**

เทียบ spec กับโค้ดจริง (ชื่อ route, testid, ข้อความ error, กติกา) แก้ส่วนที่ต่าง แล้ว commit:

```bash
git add docs/superpowers/specs/2026-10-06-vehicle-renewals-design.md
git commit -m "$(cat <<'EOF'
docs(spec): sync สเปกต่ออายุรถให้ตรงกับโค้ด

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Checklist หลัง merge (ส่งให้ผู้ใช้ — ไม่ทำเอง)**

1. `make migrate-stag` แล้ว deploy staging
2. สร้าง user ฝ่ายประกันที่ `/admin/users` บน staging → login แล้ว **เปิด `/jobs` ตรงๆ ต้องถูกพากลับ `/renewals`** (ยืนยันว่า middleware ถอด JWT ได้บน DO — ต้องมี `NEXTAUTH_SECRET` ตอน runtime)
3. ทดลอง upload ไฟล์ที่แปลงจาก Task 13 บน staging
4. แนบไฟล์ทดสอบ 1 ไฟล์ แล้วตรวจใน Spaces ว่า object ไม่เป็น public (เปิด URL ตรงของ object ต้องได้ AccessDenied)
5. ทำซ้ำข้อ 1–2 กับ production (`make migrate-prod`)
