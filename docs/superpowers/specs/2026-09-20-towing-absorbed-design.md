# ทอยตู้ถูกดูดซับโดยงานหลัก (Towing Absorbed) — Design

**Date:** 2026-09-20
**Status:** Approved (design)

## Goal

รถลากตู้มา "คาไว้บนหาง" ตอนเย็น แล้ววิ่งงานจริงเช้าวันรุ่งขึ้น — งานทอยตู้ใบนั้นเป็นแค่ขาเตรียมของงานหลัก ไม่ใช่เที่ยวที่จ่ายค่าเที่ยวแยก

ระบบรู้ได้จาก **สถานที่รับตู้ของงานหลัก** ที่เป็น `คาหาง` หรือ `รับเช้าเดินทาง` — สองค่านี้ไม่ใช่สถานที่จริง แต่เป็นสถานะว่า "ตู้อยู่บนหางอยู่แล้ว"

ตัวอย่างจริงจาก production (15 ก.ค. 2026, คนขับสันติ สุวรรณ, ลูกค้า K-APEX):

```
07:15  162899/542571  ทอยตู้  2x20DC  รับตู้ CMA/KM.18  → ไม่มีที่คืนตู้   ค่าเที่ยว 150
07:16  162899/542574  ขาออก   20DC    รับตู้ คาหาง      → BBT            ค่าเที่ยว 800
```

ทอยตู้ใบบนถูกดูดซับ → ค่าเที่ยว 150 ถูกล้าง และไม่นับเป็นเที่ยวในหน้าสรุป

## Behavior (confirmed with user)

1. **ไม่มีการจับคู่ด้วยมือ** — ไม่มีตาราง link ไม่มีปุ่มกดจับคู่ ระบบคำนวณเองจากข้อมูลที่มี
2. **ล้างค่าเที่ยวจริงใน DB** (`driverWage = null`) ไม่ใช่แค่ซ่อนตอนแสดงผล
3. **ไม่แตะ `income`** — ทอยตู้ไม่มีค่าขนส่งอยู่แล้ว ยืนยันจาก production: 0 จาก 65 ใบที่เข้าเกณฑ์มีค่าขนส่ง
4. **หน้าสรุปไม่นับทอยตู้ที่ถูกดูดซับ** ใน `towingTrips` ส่วนทอยตู้ปกติยังนับตามเดิม
5. **งานที่เคลียร์แล้วข้ามทั้งหมด** — ไม่ดูดซับ ไม่ล้าง ไม่แตะ
6. **เปลี่ยนสถานที่รับตู้ออกจากคาหาง/รับเช้าเดินทาง → ยกเลิกการดูดซับ** (ธงถูกปลด) แต่ค่าเที่ยวไม่คืนอัตโนมัติ ผู้ใช้กด "ดึงข้อมูล" เอง

## Matching Rules

**งานหลัก** — `jobType` เป็น `inbound` หรือ `outbound` และ `pickupLocation.name` เป็น `คาหาง` หรือ `รับเช้าเดินทาง`

**ทอยตู้ที่ถูกดูดซับ** ต้องครบทุกข้อ:

| เงื่อนไข | เหตุผล |
|---|---|
| `jobType` เป็น `towing` หรือ `towingHeavy` | |
| `jobDate` วันเดียวกันกับงานหลัก | ผู้ใช้ระบุ |
| `customerId` เดียวกัน | ผู้ใช้ระบุ |
| `driverId` เดียวกัน | รถคันเดียวลากมาคาหางของตัวเอง |
| `size` เดียวกัน | ผู้ใช้ยืนยัน |
| `createdAt` **ก่อน** งานหลัก | ผู้ใช้ยืนยัน — ทอยตู้ต้องถูกบันทึกก่อน |
| `isCancelled = false` ทั้งคู่ | |
| `clearStatus = false` ทั้งคู่ | เคลียร์แล้วจบไป ไม่แตะ |

**ดูดซับได้หลายใบ** — งานหลักหนึ่งใบดูดซับทอยตู้ได้ทุกใบที่เข้าเกณฑ์ (production มี 8 เคสที่มีทอยตู้ 2 ใบ)

### เงื่อนไขที่พิจารณาแล้วไม่ใช้

- **`returnLocationId IS NULL` ของทอยตู้** — จริง 109/109 ในข้อมูลที่สำรวจ แต่ซ้ำซ้อนกับเงื่อนไขอื่นและทอยตู้ 99.3% ทั้งระบบก็ไม่มีสถานที่คืนตู้อยู่แล้ว จึงไม่ช่วยคัดกรอง
- **`driverWage IS NULL` เป็นตัวชี้แทน flag** — ใช้ไม่ได้ เพราะมีทอยตู้ปกติ 24 ใบที่ค่าเที่ยวว่างเพราะกรอกไม่ครบ (ไม่มี `size` หรือ `size` ที่ไม่มีอัตรา เช่น 45HC, 40OT) การใช้ null เป็นตัวชี้จะทำให้ใบพวกนี้หายจากการนับไปด้วย

## Data Model

เพิ่มใน `model Job` ใน [prisma/schema.prisma](../../../prisma/schema.prisma) กลุ่ม "Status fields" ถัดจาก `isCarry`:

```prisma
  /// ทอยตู้ที่ถูกงานหลัก (รับตู้จากคาหาง/รับเช้าเดินทาง) ดูดซับ
  /// ค่าเที่ยวถูกล้างแล้ว และไม่นับเป็นเที่ยวในหน้าสรุป
  isTowingAbsorbed  Boolean   @default(false)
```

เพิ่ม `isTowingAbsorbed: boolean` ใน `Job` interface ที่ [types/job.ts](../../../types/job.ts)

Apply ด้วย `make migrate-stag` (และ `make migrate-prod` ตอน deploy)

**ทำไมต้องมี flag แทนการคำนวณสดทุกครั้ง:** กฎนี้อิง `pickupLocationId`/`customerId`/`size` ซึ่งผู้ใช้แก้ได้ตลอด ถ้าหน้าสรุปคำนวณใหม่ทุกครั้ง การแก้สถานที่รับตู้หลังจากล้างค่าเที่ยวไปแล้วจะทำให้ทอยตู้กลับมานับเป็นเที่ยวโดยที่เงินไม่กลับมา — กลายเป็น "มีเที่ยวแต่ไม่มีเงิน" โดยไม่มีใครสั่ง flag ทำให้เงินกับจำนวนเที่ยวเปลี่ยนพร้อมกันเสมอ

## Shared Rule Helper

สร้าง `lib/utils/towingAbsorb.ts`:

```ts
/** ชื่อสถานที่รับตู้ที่บอกว่าตู้อยู่บนหางอยู่แล้ว */
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

/** ทอยตู้ใบนี้ถูกงานหลักใบนั้นดูดซับไหม — งานหลักต้องผ่านการเช็คชื่อสถานที่มาแล้ว */
export function isAbsorbedBy(towing: AbsorbJob, main: AbsorbJob): boolean;
```

ใช้ร่วมกันทั้ง prefill-rates, PATCH job และ modal — กฎอยู่ที่เดียว

## Trigger Points

ทั้งสองจุดทำเหมือนกัน: หาทอยตู้ที่เข้าเกณฑ์ แล้ว `driverWage = null, isTowingAbsorbed = true`

### 1. ปุ่ม "ดึงข้อมูล"

- **ทั้งเดือน** — [app/api/jobs/prefill-rates/route.ts](../../../app/api/jobs/prefill-rates/route.ts) หลังเติมอัตราเสร็จ ให้สแกนงานหลักที่เข้าเกณฑ์ในเดือนนั้น แล้วดูดซับทอยตู้
- **ใบเดียวใน modal** — [components/jobs/JobFormModal.tsx](../../../components/jobs/JobFormModal.tsx) ปุ่ม `job-prefill-btn` เรียก endpoint ใหม่สำหรับงานใบนั้น

### 2. เลือกสถานที่รับตู้

ใน `JobFormModal` เมื่อผู้ใช้เลือก `pickupLocationId` เป็นคาหาง/รับเช้าเดินทาง และบันทึกแล้ว → เรียก endpoint เดียวกัน

**ต้องเป็น server-side** — ต้องอ่านงานอื่นทั้งวันมาเทียบ

### 3. ยกเลิกการดูดซับ

เมื่องานหลักเปลี่ยน `pickupLocationId` ออกจากคาหาง/รับเช้าเดินทาง (หรือเปลี่ยน `customerId`/`size`/`jobDate` จนทอยตู้ไม่เข้าเกณฑ์แล้ว) → ทอยตู้ที่เคยถูกดูดซับโดยงานหลักใบนั้น และไม่เข้าเกณฑ์กับงานหลักใบอื่น → `isTowingAbsorbed = false`

**ค่าเที่ยวไม่คืนอัตโนมัติ** — ผู้ใช้กด "ดึงข้อมูล" เอง (ตรงกับพฤติกรรมของ prefill ที่เติมเฉพาะช่องที่ null)

## API

### `POST /api/jobs/[id]/absorb-towing`

รับ `id` ของงานหลัก คำนวณการดูดซับใหม่ทั้งหมดสำหรับงานใบนั้น

Response:
```ts
{
  absorbed: number;    // จำนวนทอยตู้ที่เพิ่งถูกดูดซับ
  released: number;    // จำนวนที่ถูกปลดธง
  jobNumbers: string[] // เลขที่งานที่ถูกดูดซับ (ไว้แสดงข้อความ)
}
```

**สิทธิ์:** ADMIN เท่านั้น — ตรงกับปุ่ม "ดึงข้อมูล" ที่มีอยู่ (`isAdmin && !isSpecialType`)

ทำใน transaction: ล้างค่าเที่ยว + ติดธง พร้อมกัน

### แก้ `POST /api/jobs/prefill-rates`

หลัง loop เติมอัตราเดิม เพิ่มขั้นตอน: สแกนงานหลักที่เข้าเกณฑ์ในเดือน แล้วดูดซับทอยตู้

**สำคัญ — ป้องกันการเติมกลับ:** `where` ของ query เดิมมี `OR: [{ income: null }, { driverWage: null }]` ทอยตู้ที่ถูกดูดซับจะเข้าเงื่อนไขนี้เสมอ (`driverWage` เป็น null) ต้องเพิ่ม `isTowingAbsorbed: false` ใน `where` ไม่งั้นกดปุ่มซ้ำจะเติมค่าเที่ยวกลับทุกครั้ง — bug เดียวกับที่เคยเกิดกับ feature จับคู่

เพิ่มใน response: `absorbed: number`

### แก้ `PATCH /api/jobs/[id]`

- ปฏิเสธการแก้ `driverWage` ถ้า `isTowingAbsorbed = true` (400, ข้อความไทยบอกว่าถูกดูดซับแล้ว)
- เมื่อแก้ `pickupLocationId`/`customerId`/`size`/`jobDate` ของงานหลัก → คำนวณการดูดซับใหม่ในคำขอเดียวกัน

## Summary Page

แก้ [lib/utils/summaryCalculator.ts](../../../lib/utils/summaryCalculator.ts):

เพิ่มใน `SummaryJobInput` (**optional** — test เดิม 20 ตัวสร้าง object inline ครบทุก field):

```ts
  /** ทอยตู้ที่ถูกงานหลักดูดซับ — ไม่นับเป็นเที่ยว */
  isTowingAbsorbed?: boolean;
```

แก้การนับ `towingTrips`:

```ts
towingTrips: counted.filter((j) => isTowingJobType(j.jobType) && !j.isTowingAbsorbed).length,
```

**ไม่แตะช่องอื่น** — `jobTrips`, `income`, `driverWage`, `fuelLiters`, `carryTripsPrefill`, `otherExpensesPrefill` คงเดิม (ค่าเที่ยวของทอยตู้ที่ถูกดูดซับเป็น null อยู่แล้ว จึงบวกเป็น 0 เอง)

แก้ [lib/utils/summaryQuery.ts](../../../lib/utils/summaryQuery.ts) — select `isTowingAbsorbed` และ map เข้า `SummaryJobInput`

## UI

### ตาราง ([EditableJobTable.tsx](../../../components/jobs/EditableJobTable.tsx))

- ทอยตู้ที่ `isTowingAbsorbed` → คอลัมน์ค่าเที่ยวคนขับแสดง `—` (เป็น null อยู่แล้ว)
- Tag เล็กๆ ที่คอลัมน์ JOB หรือ SIZE บอกว่าถูกดูดซับ พร้อม tooltip บอกเลขที่งานหลัก

### Modal ([JobFormModal.tsx](../../../components/jobs/JobFormModal.tsx))

- ทอยตู้ที่ถูกดูดซับ → ช่องค่าเที่ยวคนขับ `disabled` + hint ภาษาไทย
- ปุ่ม "ดึงข้อมูล" ของทอยตู้ที่ถูกดูดซับ → ซ่อน
- งานหลักที่เลือกคาหาง/รับเช้าเดินทาง → หลังบันทึก แสดง `message.success` ว่าดูดซับทอยตู้กี่ใบ

## Existing Data

ข้อมูล production ณ 20 ก.ย. 2026 ที่เข้าเกณฑ์:

| | จำนวน |
|---|---|
| งานหลัก | 65 |
| ทอยตู้ที่จะถูกดูดซับ | 65 |
| ค่าเที่ยวรวม | 8,950 บาท |
| **เคลียร์แล้ว (ข้ามไป)** | **57** |
| **ยังแก้ได้** | **8** |

ตามข้อ 5 งานที่เคลียร์แล้วไม่ถูกแตะ — feature นี้จึงมีผลกับข้อมูลเก่าแค่ 8 ใบ ที่เหลือใช้กับงานใหม่

**ไม่มี migration script** สำหรับข้อมูลเก่า

## Out of Scope

- ไม่มีปุ่มจับคู่/ปลดคู่ด้วยมือ
- ไม่มีตาราง link
- ไม่แก้ `income` ของทอยตู้
- ไม่แตะงานที่เคลียร์แล้ว
- ไม่คืนค่าเที่ยวอัตโนมัติเมื่อปลดธง
- ไม่ migrate ข้อมูลเก่า 57 ใบที่เคลียร์แล้ว

## Testing

### Unit — `towingAbsorb`

- ชื่อสถานที่: `คาหาง`/`รับเช้าเดินทาง` → true, อื่นๆ/null → false
- เข้าเกณฑ์ครบ → true
- คนละวัน / คนละลูกค้า / คนละคนขับ / คนละ size → false
- `createdAt` ทอยตู้หลังงานหลัก → false
- ทอยตู้หรืองานหลักเคลียร์แล้ว → false
- ทอยตู้หรืองานหลักยกเลิกแล้ว → false
- `jobType` ไม่ใช่ทอยตู้ → false

### Unit — `summaryCalculator`

- ทอยตู้ที่ `isTowingAbsorbed` ไม่นับใน `towingTrips` แต่ทอยตู้ปกติในเดือนเดียวกันยังนับ
- `jobTrips` และยอดเงินไม่เปลี่ยน
- test เดิม 20 ตัวยังผ่าน (field ใหม่ต้อง optional)

### E2E (Playwright, `workers=1`)

- สร้างทอยตู้ + งานหลักรับตู้จากคาหาง (ลูกค้า/คนขับ/size/วันเดียวกัน, ทอยตู้สร้างก่อน) → กดดึงข้อมูล → ค่าเที่ยวทอยตู้ว่าง, หน้าสรุปนับทอยลดลง
- กดดึงข้อมูลซ้ำ → ค่าเที่ยวทอยตู้ยังว่าง (ไม่เติมกลับ)
- ทอยตู้คนละลูกค้า → ไม่ถูกดูดซับ
- ทอยตู้สร้างหลังงานหลัก → ไม่ถูกดูดซับ
- เปลี่ยนสถานที่รับตู้ออกจากคาหาง → ธงถูกปลด ทอยตู้กลับมานับเป็นเที่ยว
- ทอยตู้ที่เคลียร์แล้ว → ไม่ถูกแตะ
