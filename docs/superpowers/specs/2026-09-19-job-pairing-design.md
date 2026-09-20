# Job Pairing (จับคู่งาน) — Design

**Date:** 2026-09-19
**Status:** Approved (design)

## Goal

รถคันเดียววิ่งครั้งเดียวแต่ลากตู้ 20 ฟุตสองตู้ — งานถูกออกเป็นสองใบตามจำนวนตู้ แต่ค่าขนส่งและค่าเที่ยวคนขับต้องคิดครั้งเดียวในอัตรา `2x20DC`

ตัวอย่าง:

```
1 ก.ย.  JOB-1023  20DC  ค่าเที่ยว 100  ค่าขนส่ง 3,000
1 ก.ย.  JOB-1024  20DC  ค่าเที่ยว 100  ค่าขนส่ง 3,000
```

หลังจับคู่:

```
1 ก.ย.  JOB-1023  20DC  ค่าเที่ยว —    ค่าขนส่ง —       (ถูกล้าง)
1 ก.ย.  JOB-1024  20DC  ค่าเที่ยว 150  ค่าขนส่ง 5,000   (อัตรา 2x20DC)
```

ผลที่หน้าสรุป: จากเดิมนับ 2 เที่ยว เหลือ 1 เที่ยว

## Behavior (confirmed with user)

1. **size ไม่ถูกแก้ใน DB** — ทั้งสองใบยังเป็น `20DC` ระบบแปลงเป็น `2x20DC` เฉพาะตอนดึงอัตรา ทำให้ปลดคู่แล้วกลับสู่สภาพเดิมได้สะอาด และตารางยังสะท้อนความจริงว่าวิ่ง 20DC สองตู้
2. **คู่ที่รองรับ** — `20DC + 20DC → 2x20DC` และ `20RF + 20RF → 2x20RF` เท่านั้น (ตรงกับค่าที่มีใน `SIZE_OPTIONS`) size อื่นหรือ size ต่างกันจับคู่ไม่ได้
3. **คนถือยอด** — ใบที่ `createdAt` ใหม่กว่าเป็น primary ระบบตัดสินเอง ไม่ให้ผู้ใช้เลือก
4. **ยอดที่ถูกล้าง** — `income` + `driverWage` เท่านั้น ค่าใช้จ่ายอื่น (ค่าทางด่วน ค่ารับตู้ ค่าคืนตู้ ค่ายกตู้ ค่าฝากตู้ ค่ายาง อื่นๆ) น้ำมัน และเลขไมล์ ยังกรอกแยกใบได้ตามจริง เพราะเป็นต้นทุนต่อตู้ ไม่ใช่ต่อเที่ยว
5. **jobType ต้องเหมือนกันเป๊ะ** — ทอยตู้กับทอยตู้หนักจับคู่กันไม่ได้ เพราะอัตรา key ด้วย `jobType` ถ้าคู่มีสองประเภทจะตอบไม่ได้ว่าใช้อัตราไหน
6. **ไม่เติมอัตราอัตโนมัติตอนจับคู่** — ผู้ใช้กดปุ่ม "ดึงข้อมูล" ที่มีอยู่แล้วเอง แต่ปุ่มนั้นต้องถูกแก้ให้ใช้ paired size
7. **หน้าสรุปนับใบ primary ใบเดียว** — ยอดรวม (income, driverWage, น้ำมัน, ค่าใช้จ่าย) ยังรวมทุกใบตามปกติ
8. **UI อยู่ที่หน้า job list ที่เดียว** — ไม่แตะ `JobFormModal`

## Data Model

เพิ่ม model ใหม่ใน [prisma/schema.prisma](../../../prisma/schema.prisma) วางถัดจาก `JobTowingLink`:

```prisma
model JobPairLink {
  id             String @id @default(cuid())
  /// ใบที่ถือยอด — createdAt ใหม่กว่า
  primaryJobId   String @unique
  primaryJob     Job    @relation("PairPrimary", fields: [primaryJobId], references: [id], onDelete: Cascade)
  /// ใบที่ถูกล้างยอด — income/driverWage = null
  secondaryJobId String @unique
  secondaryJob   Job    @relation("PairSecondary", fields: [secondaryJobId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())

  @@map("job_pair_links")
}
```

เพิ่ม relation ฝั่ง `Job`:

```prisma
  // Pair link relations
  pairLinkAsPrimary   JobPairLink? @relation("PairPrimary")
  pairLinkAsSecondary JobPairLink? @relation("PairSecondary")
```

**เหตุผลที่ใช้ตารางแยก ไม่ใช่ field `pairedWithJobId` บน `Job`:** `@unique` ทั้งสองฝั่งบังคับ invariant "หนึ่งใบอยู่ได้แค่คู่เดียว และเป็นได้ฝั่งเดียว" ที่ระดับ DB ถ้าใช้ self-relation ต้อง guard ด้วยโค้ดว่าไม่มีใครถูกชี้ซ้ำ — เป็นเหตุผลเดียวกับที่ `JobTowingLink` เลือกตารางแยก

Apply ด้วย `make migrate-stag` (และ `make migrate-prod` ตอน deploy)

## Size Mapping

เพิ่มใน [types/job.ts](../../../types/job.ts):

```ts
/** size ที่จับคู่ได้ → size ที่ใช้ดึงอัตราหลังจับคู่ */
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

/** ลักษณะงานที่จับคู่ได้ */
export const PAIRABLE_JOB_TYPES = ["inbound", "outbound", "towing", "towingHeavy"] as const;

export function isPairableJobType(jobType: string): boolean {
  return (PAIRABLE_JOB_TYPES as readonly string[]).includes(jobType);
}
```

เพิ่ม interface:

```ts
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
  /** อีกฝั่งของคู่ — API เติมให้ตามมุมมองของใบที่ query */
  otherJob: PairedJobSummary;
  createdAt: string;
}
```

เพิ่มใน `Job` interface:

```ts
  pairLinkAsPrimary?: JobPairLink | null;
  pairLinkAsSecondary?: JobPairLink | null;
```

## Pairing Rules

เงื่อนไขทั้งหมดต้องผ่านพร้อมกัน:

| เงื่อนไข | เหตุผล |
|---|---|
| `jobDate` วันเดียวกัน | วิ่งครั้งเดียวคือวันเดียว |
| `driverId` เดียวกัน และไม่ `null` | วิ่งครั้งเดียวคือคนเดียว |
| `jobType` ตรงกัน และอยู่ใน `PAIRABLE_JOB_TYPES` | อัตรา key ด้วย `jobType` |
| `size` ตรงกัน และ `isPairableSize()` เป็น true | ต้องมี paired size |
| `factoryLocationId` ตรงกัน — เฉพาะ `inbound`/`outbound` | ทอยตู้ไม่ผูกโรงงาน |
| ทั้งคู่ `isCancelled = false` | งานยกเลิกไม่นับในสรุปอยู่แล้ว |
| ทั้งคู่ `clearStatus = false` | เคลียร์แล้ว = ล็อกยอด ห้ามแตะ |
| ทั้งคู่ยังไม่ถูกจับคู่ | บังคับด้วย `@unique` |
| คนละใบ (`id` ต่างกัน) | |

กฎเดียวกันนี้ใช้ทั้งฝั่ง candidate query และ validation ตอน POST — ต้องอยู่ใน helper ตัวเดียวเพื่อไม่ให้หลุดจากกัน

## API

### `GET /api/jobs/[id]/pair-candidates`

หาใบที่จับคู่ได้กับใบที่ระบุ

Response:

```ts
{
  jobs: [{
    id: string;
    jobNumber: string;
    jobDate: string;
    size: string | null;
    customer: { name: string } | null;
    factoryLocation: { name: string } | null;
    /** ADMIN เท่านั้น — role อื่นได้ undefined */
    income?: number | null;
    driverWage?: number | null;
    /** candidate.createdAt > currentJob.createdAt */
    willBePrimary: boolean;
  }]
}
```

`willBePrimary` จำเป็นสำหรับ UX — ให้ผู้ใช้เห็นก่อนกดว่ายอดจะไปอยู่ใบไหน

**สิทธิ์:** ADMIN และ SENIOR_STAFF เท่านั้น
**ตัดข้อมูลตาม role:** role ที่ไม่ใช่ ADMIN ไม่เห็น `income`/`driverWage` — แบบเดียวกับที่ `baseSalary` ทำใน `Driver`

### `POST /api/jobs/[id]/pair-link`

Body: `{ otherJobId: string }`

ทำใน transaction:

1. validate เงื่อนไขทั้งหมดฝั่ง server อีกรอบ (ห้ามเชื่อ client)
2. ตัดสิน primary/secondary จาก `createdAt` — ใหม่กว่าเป็น primary
3. สร้าง `JobPairLink`
4. `UPDATE primaryJob, secondaryJob SET income = NULL, driverWage = NULL` — ล้างทั้งคู่
5. คืนข้อมูลคู่ + ใบทั้งสองที่อัปเดตแล้ว

> **ทำไมต้องล้าง primary ด้วย** (แก้จากดีไซน์เดิมที่ล้างเฉพาะ secondary): ยอดเดิมของ primary เป็นอัตราตู้เดียว (`20DC`) ซึ่งใช้กับคู่ไม่ได้ และปุ่ม "ดึงข้อมูล" เติมเฉพาะช่องที่ `null` — ถ้าไม่ล้าง ปุ่มจะข้าม primary ตลอดไป ทริปนั้นจะค้างที่ราคาตู้เดียวโดยไม่มีใครสังเกต หลังจับคู่แล้วผู้ใช้กด "ดึงข้อมูล" ครั้งเดียวได้อัตรา `2x20DC` ทันที

Error cases:

| กรณี | status | ข้อความ |
|---|---|---|
| ใบใดใบหนึ่งถูกจับคู่แล้ว | 409 | `งานนี้ถูกจับคู่ไปแล้ว` |
| เงื่อนไขไม่ผ่าน | 400 | ระบุเงื่อนไขที่ไม่ผ่าน เช่น `โรงงานไม่ตรงกัน` |
| ใบใดใบหนึ่งเคลียร์แล้ว | 400 | `งานที่เคลียร์แล้วจับคู่ไม่ได้` |
| ไม่มีสิทธิ์ | 403 | `ไม่มีสิทธิ์ใช้งาน` |

### `DELETE /api/jobs/[id]/pair-link`

ลบ `JobPairLink` ที่ใบนี้เกี่ยวข้อง (เป็น primary หรือ secondary ก็ได้)

- **ไม่คืนยอดให้ secondary** — ปล่อยเป็น `null` ให้ผู้ใช้กรอก/ดึงอัตราเอง เพราะระบบไม่ได้เก็บยอดเดิมไว้ และการเดาว่าควรคืนเท่าไหร่จะผิดมากกว่าถูก
- **ไม่ล้างยอด primary** — ปล่อยยอด `2x20DC` ไว้ ให้ผู้ใช้จัดการเอง

ปฏิเสธ (400) ถ้าใบใดใบหนึ่งเคลียร์แล้ว

**สิทธิ์:** ADMIN และ SENIOR_STAFF

### แก้ `GET /api/jobs` และ `GET /api/jobs/[id]`

[app/api/jobs/route.ts](../../../app/api/jobs/route.ts) และ [app/api/jobs/[id]/route.ts](../../../app/api/jobs/[id]/route.ts) — เพิ่ม include แบบเดียวกับ towing link:

```ts
pairLinkAsPrimary: {
  include: { secondaryJob: { select: { id: true, jobNumber: true, jobDate: true, size: true } } },
},
pairLinkAsSecondary: {
  include: { primaryJob: { select: { id: true, jobNumber: true, jobDate: true, size: true } } },
},
```

แล้ว map เป็น `otherJob` ก่อนส่งออก เพื่อให้ client ไม่ต้องรู้ว่าตัวเองอยู่ฝั่งไหน

### แก้ `PATCH /api/jobs/[id]`

ปฏิเสธ (400) การแก้ `income` หรือ `driverWage` ถ้าใบนั้นเป็น secondary — server-side guard คู่กับ disable ฝั่ง UI ข้อความ: `งานนี้ถูกจับคู่แล้ว ยอดอยู่ที่ JOB-xxxx`

Guard นี้อยู่ที่ PATCH endpoint เท่านั้น การล้างยอดตอนจับคู่ทำผ่าน `prisma.job.update` ภายใน transaction ของ `POST /pair-link` โดยตรง จึงไม่ติด guard

## Rate Prefill — "ดึงข้อมูล" ต้องเติมให้ถูก

มีปุ่ม "ดึงข้อมูล" สองที่ ทำงานคนละแบบ ต้องแก้ทั้งคู่

### 1. ปุ่มทั้งเดือน — `/api/jobs/prefill-rates`

ปุ่มอยู่ที่ [DriverJobList.tsx:291](../../../components/jobs/DriverJobList.tsx) และในหน้าตาราง

แก้ [app/api/jobs/prefill-rates/route.ts](../../../app/api/jobs/prefill-rates/route.ts):

- **กรอง secondary ออกจาก query** — เพิ่ม `pairLinkAsSecondary: null` ใน `where`

  > **นี่คือจุดที่ bug จะเกิดแน่ถ้าลืม:** `where` ปัจจุบันมี `OR: [{ income: null }, { driverWage: null }]` ซึ่งใบ secondary เข้าเงื่อนไขเสมอ (null ทั้งคู่) ถ้าไม่กรองออก ยอดจะถูกเติมกลับทุกครั้งที่กดปุ่ม ทำให้ยอดเบิ้ลในหน้าสรุป

- **`select` เพิ่ม `pairLinkAsPrimary`**
- ตอนสร้าง key สำหรับ `incomeByKey`/`wageByKey` — ถ้าใบนั้นเป็น primary ใช้ `getPairedSize(job.size) ?? job.size` แทน `job.size`

### 2. ปุ่มในใบงาน — `JobFormModal`

`prefillIncome` และ `prefillDriverWage` ส่ง `size` จาก form ตรงๆ ต้องแปลงก่อนส่ง:

```ts
const rawSize = form.getFieldValue("size");
const size = isPairPrimary ? getPairedSize(rawSize) ?? rawSize : rawSize;
```

และ **ซ่อนปุ่ม "ดึงข้อมูล" ถ้าใบนั้นเป็น secondary** เพราะยอดต้องเป็น `null`

> หมายเหตุ: UI จับคู่/ปลดคู่ไม่ได้อยู่ใน `JobFormModal` แต่ modal ยังต้องรู้สถานะคู่เพื่อ (ก) แปลง size ตอนดึงอัตรา (ข) ซ่อนปุ่มและ disable ช่อง `income`/`driverWage` ของ secondary ข้อมูลมาจาก `GET /api/jobs/[id]` ที่ include อยู่แล้ว

ทั้งสองฟังก์ชันมี guard `if (currentVal != null) return` อยู่แล้ว — พฤติกรรม "เติมเฉพาะช่องที่ยัง null" จึงคงเดิม ไม่ทับยอดที่กรอกไว้

## UI — เฉพาะ `EditableJobTable` (หน้า `/jobs/[driverId]`)

ไม่มี UI จับคู่/ปลดคู่ที่อื่น

### Props ใหม่

```ts
isAdmin: boolean       // เดิม — ควบคุมคอลัมน์การเงิน
canPairJobs: boolean   // ใหม่ — ADMIN | SENIOR_STAFF
```

ใน [app/(protected)/jobs/[driverId]/page.tsx](../../../app/(protected)/jobs/[driverId]/page.tsx):

```ts
const role = (session.user as { role?: string }).role
const isAdmin = role === 'ADMIN'
const canPairJobs = role === 'ADMIN' || role === 'SENIOR_STAFF'
```

### ปุ่มจับคู่ — ซ้ายสุดของกลุ่ม icon action ฝั่งขวา

ลำดับคอลัมน์ action (ทั้งหมด `fixed: 'right'`): **จับคู่ → เคลียร์ → ลบ**

แสดงปุ่มเมื่อ `canPairJobs` และแถวนั้นไม่ใช่ banner/advance/noJob

| สถานะแถว | ปุ่ม |
|---|---|
| จับคู่ได้ (`isPairableJobType` + `isPairableSize` + ไม่เคลียร์/ยกเลิก/จับคู่) | 🔗 `LinkOutlined` |
| จับคู่แล้ว | 🔗̸ `DisconnectOutlined` สีส้ม |
| จับคู่ไม่ได้ | ไม่แสดงปุ่ม (ช่องว่าง) |

ต้องขยาย `width` ของกลุ่ม action ตามจำนวนปุ่มที่เพิ่ม

### Confirm dialog ตอนจับคู่

ใช้ `modal.confirm` จาก `App.useApp()` ตามคอนเวนชันโปรเจกต์

ถ้าไม่มีใบที่จับคู่ได้ → `message.info('ไม่มีงานที่จับคู่ได้')` ไม่ต้องเปิด dialog

**เนื้อหาสำหรับ ADMIN:**

```
จับคู่งาน — JOB-1023

เลือกงานที่วิ่งไปด้วยกัน:
  ◉ JOB-1024 · 20DC · โรงงาน XYZ · ค่าขนส่ง 3,000

ผลลัพธ์:
  ยอดจะไปรวมที่ → JOB-1024 (สร้างทีหลัง)
  ยอดที่จะถูกล้าง → JOB-1023: ค่าขนส่ง 3,000 · ค่าเที่ยว 100
  อัตราที่จะใช้ → 2x20DC
```

**เนื้อหาสำหรับ SENIOR_STAFF** (ไม่เห็นตัวเลขยอด เพราะคอลัมน์การเงินถูกซ่อนด้วย `isAdmin` อยู่แล้ว):

```
จับคู่งาน — JOB-1023

เลือกงานที่วิ่งไปด้วยกัน:
  ◉ JOB-1024 · 20DC · โรงงาน XYZ

ผลลัพธ์:
  ยอดจะไปรวมที่ → JOB-1024 (สร้างทีหลัง)
  ยอดของ JOB-1023 จะถูกล้าง
  อัตราที่จะใช้ → 2x20DC
```

ถ้ามี candidate หลายใบ ใช้ radio group ให้เลือก และอัปเดตบล็อก "ผลลัพธ์" ตามใบที่เลือก

**เตือนเพิ่มเมื่อใบ primary มียอดอยู่แล้ว** (ADMIN เท่านั้น):

```
⚠️ JOB-1024 มียอดอยู่แล้ว — ปุ่ม "ดึงข้อมูล" จะไม่ทับ ต้องล้างยอดเองก่อน
```

### Confirm dialog ตอนปลดคู่

```
ปลดคู่ JOB-1023 + JOB-1024?

ยอดของ JOB-1023 จะยังเป็นค่าว่าง — ต้องกรอกหรือกด "ดึงข้อมูล" เอง
ยอดของ JOB-1024 จะยังเป็นอัตรา 2x20DC — ต้องแก้เอง
```

### การแสดงผลในแถวที่จับคู่แล้ว

| จุด | primary (ถือยอด) | secondary (ถูกล้าง) |
|---|---|---|
| คอลัมน์ JOB | Tag `2x20DC` สีน้ำเงินต่อท้าย jobNumber | Tag `จับคู่` สีเทา |
| คอลัมน์ SIZE | `20DC` ตามเดิม | `20DC` ตามเดิม |
| ค่าขนส่ง / ค่าเที่ยวคนขับ | แก้ได้ปกติ | `disabled` แสดง `—` สีเทา |
| ค่าใช้จ่ายอื่น / น้ำมัน / ไมล์ | ปกติ | ปกติ |
| tooltip ที่ Tag | `จับคู่กับ JOB-1023` | `ยอดรวมอยู่ที่ JOB-1024` |

แสดง `—` ไม่ใช่ `0` เพื่อให้แยกออกจาก "ศูนย์บาท"

### `rowClassName`

เพิ่ม `paired-row` — พื้นหลังฟ้าอ่อนจางทั้งสองแถว ให้เห็นว่าเป็นคู่กันโดยไม่ต้องอ่าน

ลำดับ priority ใน `rowClassName` (ตัวแรกที่ match ชนะ): `highlight-row` → `banner-row` → `no-job-row` → `advance-row` → `locked-row` → `cancelled-row` → **`paired-row`** → `clickable-row`

วางหลัง `locked-row`/`cancelled-row` เพราะสถานะล็อก/ยกเลิกสำคัญกว่าในการอ่านตาราง

### ไม่ทำ: ย้ายแถวให้ติดกัน

ตารางเรียงตามลำดับที่ผู้ใช้คุ้น การย้ายจะทำให้สับสน และทั้งคู่บังคับว่าต้องวันเดียวกันอยู่แล้ว จึงมักอยู่ใกล้กัน

## Summary Page

ไม่มี UI ใหม่ — `jobTrips`/`towingTrips` ลดลงตามจริง

แก้ [lib/utils/summaryCalculator.ts](../../../lib/utils/summaryCalculator.ts):

เพิ่ม field เข้า `SummaryJobInput`:

```ts
  /** true = ใบที่ถูกจับคู่แล้วยอดถูกล้าง — ไม่นับเป็นเที่ยว */
  isPairSecondary: boolean;
```

แก้การนับ:

```ts
const counted = active.filter((j) => !j.isPairSecondary);
// ...
jobTrips: counted.filter((j) => MAIN_JOB_TYPES.includes(j.jobType)).length,
towingTrips: counted.filter((j) => isTowingJobType(j.jobType)).length,
```

**ส่วนที่ยังใช้ `active` (นับทุกใบ) — ไม่เปลี่ยน:** `income`, `driverWage`, `fuelLiters`, `otherExpensesPrefill`, `carryTripsPrefill`, และ `repairDays`/`overnightDays`/`noShowDays` เพราะยอดรวมยังต้องได้ครบ และใบ secondary มี `income`/`driverWage` เป็น `null` ซึ่งบวกเป็น 0 อยู่แล้ว

**`carryTripsPrefill` (แบก) ปล่อยไว้ตามเดิม** — ถ้าคู่หนึ่งมี `isCarry` ทั้งสองใบจะนับเป็น 2 ซึ่งถูกต้อง เพราะ "แบก" นับต่อตู้ ไม่ใช่ต่อเที่ยว และผู้ใช้แก้ทับได้ในหน้าสรุปอยู่แล้ว

แก้ [lib/utils/summaryQuery.ts](../../../lib/utils/summaryQuery.ts) — ใน `select` ของ jobs เพิ่ม `pairLinkAsSecondary: { select: { id: true } }` แล้วตอน map เป็น `SummaryJobInput` ใส่ `isPairSecondary: !!j.pairLinkAsSecondary`

หน้าสรุปต้องการแค่ boolean ไม่ต้องรู้ว่าคู่กับใบไหน จึง select แค่ `id` ต่างจาก `GET /api/jobs` ที่ต้อง map เป็น `otherJob` เต็มรูปแบบเพื่อให้ตารางแสดง tooltip ได้

## Export Excel

- [lib/utils/summaryExcelGenerator.ts](../../../lib/utils/summaryExcelGenerator.ts) — ใช้ค่าจาก `calculateDriverSummary` จึงถูกต้องอัตโนมัติ
- [lib/utils/jobsExcelGenerator.ts](../../../lib/utils/jobsExcelGenerator.ts) — **ไม่ต้องแก้** ตรวจแล้วว่าไม่ได้นับจำนวนเที่ยวเอง (ไม่มี `jobTrips`/`towingTrips`) และยอดเงินของ secondary เป็น `null` อยู่แล้วจึงออกมาเป็นช่องว่างตามที่ควร

## Out of Scope

- ไม่มี UI จับคู่/ปลดคู่ใน `JobFormModal` (modal แก้แค่ prefill size และ disable ช่องของ secondary)
- ไม่จับคู่เกิน 2 ใบ
- ไม่จับคู่ข้าม `jobType` หรือข้าม `size`
- ไม่จับคู่ข้ามวัน ข้ามคนขับ ข้ามโรงงาน
- ไม่ล้างค่าใช้จ่ายอื่นนอกจาก `income`/`driverWage`
- ไม่เก็บยอดเดิมไว้คืนตอนปลดคู่
- ไม่แก้การนับ "แบก" ในหน้าสรุป

## Testing

### Unit — `summaryCalculator`

- คู่ inbound: `jobTrips` ลดจาก 2 เหลือ 1 แต่ `income`/`driverWage` รวมเท่าเดิม
- คู่ towing: `towingTrips` ลดจาก 2 เหลือ 1
- ใบ secondary ที่ยกเลิก: ไม่กระทบยอด (ถูก filter ด้วย `isCancelled` ก่อนอยู่แล้ว)
- `carryTripsPrefill` ยังนับทั้งสองใบ

### Unit — `getPairedSize`

- `20DC → 2x20DC`, `20RF → 2x20RF`
- `40DC → null`, `2x20DC → null`, `null → null`

### E2E (Playwright, `workers=1`)

- จับคู่สองงาน 20DC วันเดียวกัน → ยอดใบเก่าถูกล้าง ใบใหม่ถือยอด
- กด "ดึงข้อมูล" → ใบ primary ได้อัตรา `2x20DC` ใบ secondary ยังว่าง
- ปลดคู่ → ทั้งสองใบกลับมาแก้ยอดได้
- งานคนละโรงงาน (inbound) → ไม่ขึ้นเป็น candidate
- งานคนละวัน → ไม่ขึ้นเป็น candidate
- งานที่เคลียร์แล้ว → ปุ่มจับคู่ไม่แสดง
- หน้าสรุปหลังจับคู่ → จำนวนเที่ยวลดลง 1

ตาม convention ในโปรเจกต์: `<Table size="small">`, `modal.confirm` ไม่ใช่ `Popconfirm`, `data-testid` บน Button ได้โดยตรง
