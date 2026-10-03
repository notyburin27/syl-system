# น้ำมันมาตรฐาน (Fuel Standard) — Design

**Date:** 2026-10-03
**Status:** Approved (design)

## Goal

ตั้งค่า "น้ำมันมาตรฐานต่อเที่ยว" ตาม size + เส้นทาง แล้วเทียบกับน้ำมันที่เติมจริงของรถแต่ละคัน
เพื่อให้รู้ว่าคนขับใช้น้ำมันเกินมาตรฐานกี่ลิตร — ใช้ประกอบการกรอก "หัก น้ำมัน/หยุด" ในหน้าสรุปรายเดือน

ตัวอย่างค่ามาตรฐาน:

```
40DC  CMA/KM.18 → โรงงาน B → SYL   300 ลิตร
20DC  CMA/KM.18 → โรงงาน K → CMA   200 ลิตร
```

คนขับไม่ได้จดไมล์/เติมน้ำมันทุก job — เติมเต็มถังเป็นช่วงๆ จึงต้องรวม job เป็น "ช่วง" ก่อนเทียบ:

```
A  ไมล์ 706,461  เติม 259
B  -
C  -
…
H  ไมล์ 707,015  เติม 97

ช่วง B–H: ใช้จริง 97 ลิตร, มาตรฐาน Σ(B..H) = 80 ลิตร → เกิน +17 ลิตร
```

## Behavior (confirmed with user)

1. **Key ของค่ามาตรฐาน** = `size + สถานที่รับตู้ + โรงงาน + สถานที่คืนตู้` — **ไม่แยกตาม jobType**
   โรงงานว่างได้ (งานทอยที่ไม่มีโรงงาน) ชื่อสายเรือ (เช่น CMA) อยู่ในชื่อสถานที่รับตู้อยู่แล้ว ไม่ต้องมี field แยก
2. **จุดเติม** = job ที่ `fuelOfficeLiters + fuelCashLiters + fuelCreditLiters > 0` — ไม่ดูเลขไมล์
   ถือว่าเติมเต็มถังทุกครั้ง
3. **ช่วง** = job ถัดจากจุดเติมก่อนหน้า ถึงจุดเติมนี้ (รวมจุดเติมนี้)
   ใช้จริง = ลิตรรวม ณ จุดเติมที่ปิดช่วง, มาตรฐาน = Σ มาตรฐานของทุก job ในช่วง, ส่วนต่าง = ใช้จริง − มาตรฐาน
4. **ไม่มีค่ามาตรฐาน** — ถ้าในช่วงมี job ใดหาค่ามาตรฐานไม่เจอ ช่วงนั้น **ไม่คำนวณ** (incomplete) และแสดงคำเตือนพร้อมเส้นทางที่ขาด ไม่นำไปรวมยอดเดือน
5. **ไม่มีจุดเติมก่อนหน้า** (ช่วงแรกสุดของรถคันนั้น) — incomplete เพราะไม่รู้ว่าถังเหลือเท่าไร
6. **งานจับคู่** — ใบ primary ใช้ค่ามาตรฐานของ paired size (`getPairedSize`: 20DC → 2x20DC, 20RF → 2x20RF) ครั้งเดียว ใบ secondary มาตรฐาน = 0 (แต่ถ้าใบ secondary มีการเติมก็ยังเป็นจุดเติมได้)
7. **ช่วงคร่อมเดือน** — นับเข้าเดือนของ job ที่ปิดช่วง job หลังจุดเติมสุดท้ายของเดือน = "รอปิดช่วง" ยังไม่นับ
8. **ยอดรายเดือน** แสดงทั้งสองแบบ:
   - เกินรวม = Σ ส่วนต่างที่ > 0
   - สุทธิ = Σ ส่วนต่างทุกช่วง (หักลบช่วงที่ประหยัด)
9. **ไม่คิดเป็นเงิน** — แสดงเป็นลิตรเท่านั้น ยอดหักเงินคนขับยังกรอกมือในช่อง "หัก น้ำมัน/หยุด" (`DriverMonthlyEntry.fuelDeduction`) ตามเดิม
10. **แสดงผลที่หน้าสรุปรายเดือนเท่านั้น** — ไม่แตะตาราง job, ไม่แตะ Excel export
11. **คำนวณสดทุกครั้งที่เปิดหน้าสรุป** — ไม่เก็บผลลง DB แก้ค่ามาตรฐานแล้วตัวเลขเดือนเก่าเปลี่ยนตาม (ยอมรับได้ เพราะยอดหักจริงถูกกรอกมือเก็บไว้แล้ว)

Assumptions (ยืนยันกับ user แล้ว):

- job ที่ `isCancelled`, `jobType = noJob`, `jobType = advance` — ข้ามทั้งหมด ไม่นับทั้งมาตรฐานและลิตรที่เติม (สอดคล้องกับหน้าสรุปเดิมที่ไม่นับน้ำมันของ job ยกเลิก)
- ทอยตู้ที่ถูกดูดซับ (`isTowingAbsorbed`) — ยังนับมาตรฐานตามเส้นทางของตัวเอง เพราะรถวิ่งจริง
- รถ NGV (`Driver.isGasVehicle`) — ไม่คำนวณ เว้นว่าง
- job ที่ไม่ได้กรอก size หรือสถานที่รับ/คืนตู้ = หาค่ามาตรฐานไม่เจอ → ช่วง incomplete

## Data Model

เพิ่ม model ใหม่ใน [prisma/schema.prisma](../../../prisma/schema.prisma) ในหมวด Rate Tables ถัดจาก `RateDriverWage`:

```prisma
// น้ำมันมาตรฐานต่อเที่ยว ตาม size + เส้นทาง (ไม่แยก jobType)
model FuelStandard {
  id                String   @id @default(cuid())
  size              String
  pickupLocationId  String
  factoryLocationId String?  // ว่างได้ — งานทอยที่ไม่มีโรงงาน
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

`Location` เพิ่ม back-relations 3 ตัว: `fuelStandardPickup`, `fuelStandardFactory`, `fuelStandardReturn`

Postgres ถือว่า NULL ไม่ซ้ำกัน → `@@unique` กันแถวซ้ำที่ `factoryLocationId = null` ไม่ได้
ต้องเช็คซ้ำใน API ด้วย `findFirst({ where: { ..., factoryLocationId: { equals: null } } })` แบบเดียวกับ
[app/api/rates/driver-wage/route.ts](../../../app/api/rates/driver-wage/route.ts)

ลบแบบ hard delete เหมือนตาราง rate อื่น

## API

ทุก route: `auth()` → 401 ถ้าไม่มี session, **403 ถ้า role ไม่ใช่ ADMIN** (ต่างจาก rate API เดิมที่เช็คแค่ session — ไม่แก้ตัวเดิมในงานนี้)
Error message ภาษาไทย

| Method | Route | หน้าที่ |
|---|---|---|
| GET | `/api/rates/fuel-standard` | รายการทั้งหมด include ชื่อสถานที่ 3 ตัว เรียงตาม size, ชื่อสถานที่รับตู้ |
| POST | `/api/rates/fuel-standard` | สร้าง — 400 ถ้าขาด field / liters < 0, 409 ถ้า key ซ้ำ |
| PUT | `/api/rates/fuel-standard/[id]` | แก้ — 409 ถ้า key ใหม่ชนกับแถวอื่น |
| DELETE | `/api/rates/fuel-standard/[id]` | ลบ |
| POST | `/api/rates/fuel-standard/import` | import CSV (ดูด้านล่าง) |

### Import CSV

ใช้ `ImportCSVModal` ตัวเดิม (validate → preview → import) รูปแบบเดียวกับ
[app/api/rates/driver-wage/import/route.ts](../../../app/api/rates/driver-wage/import/route.ts)

- headers: `size, pickupLocationName, factoryLocationName, returnLocationName, liters`
- headerLabels: `SIZE, สถานที่รับตู้, โรงงาน, สถานที่คืนตู้, ลิตร`
- exampleRow: `40DC, CMA/KM.18, โรงงาน B, SYL, 300`
- Validation ต่อแถว:
  - size ต้องอยู่ใน `SIZE_OPTIONS`
  - สถานที่รับตู้ / คืนตู้ ต้องมี, โรงงานว่างได้
  - **ชื่อสถานที่ต้องมีอยู่แล้วใน `Location` (isActive)** — ไม่เจอ → error `ไม่พบสถานที่ "X"`
    (ต่างจาก import เดิมที่ upsert สถานที่ใหม่ — กันพิมพ์ผิดแล้วได้สถานที่ซ้ำที่ไม่ match กับ job)
  - liters ต้องเป็นตัวเลข ≥ 0
  - key ซ้ำกันเองในไฟล์ → error
- Import: key ซ้ำกับของเดิม → update liters, ไม่ซ้ำ → create

### Export

ปุ่ม Export ในหน้าตั้งค่า สร้าง CSV ฝั่ง client จากข้อมูลที่โหลดอยู่ ใช้ headers เดียวกับ import (แก้แล้ว import กลับได้)

## Settings Page

- Route: `app/(protected)/jobs/settings/fuel-standard/page.tsx` — server component เช็ค ADMIN (redirect `/jobs` ถ้าไม่ใช่) แล้ว render `<App><FuelStandardManager/></App>`
- Component: `components/jobs/FuelStandardManager.tsx` ตามแบบ `RateDriverWageManager.tsx`
  - ตาราง `size="small"`: SIZE | สถานที่รับตู้ | โรงงาน | สถานที่คืนตู้ | ลิตร | จัดการ
  - Filter: size, สถานที่ (ค้นในทั้ง 3 ช่อง)
  - ปุ่ม: เพิ่ม, Import, Export
  - Modal เพิ่ม/แก้: Select size, Select สถานที่รับตู้, Select โรงงาน (เฉพาะ `type = factory`, allowClear), Select สถานที่คืนตู้, InputNumber ลิตร (min 0, precision 2)
  - ลบ: `modal.confirm` (ไม่ใช้ Popconfirm)
  - Selects ใส่ `id` prop สำหรับ e2e
- Modal เพิ่ม/แก้แยกเป็น component `FuelStandardFormModal.tsx` รับ `initialValues` — ใช้ซ้ำจากหน้าสรุป (quick-add)
- เมนู: [components/ProtectedLayoutClient.tsx](../../../components/ProtectedLayoutClient.tsx) เพิ่ม `{ key: "jobs-fuel-standard", label: "น้ำมันมาตรฐาน" }` ถัดจาก "ราคาน้ำมัน" แสดงให้ ADMIN/MANAGER (เหมือนเมนู rate อื่น) + selectedKey mapping สำหรับ pathname

## Calculation — `lib/utils/fuelSegments.ts`

Pure function ไม่แตะ DB

```ts
interface FuelJob {
  id: string
  jobNumber: string
  jobDate: Date
  jobType: string
  isCancelled: boolean
  size: string | null
  pickupLocationId: string | null
  factoryLocationId: string | null
  returnLocationId: string | null
  fuelLiters: number            // OFF + สด + เครดิต (null → 0)
  pairRole: 'primary' | 'secondary' | null
}

interface FuelStandardEntry {
  size: string
  pickupLocationId: string
  factoryLocationId: string | null
  returnLocationId: string
  liters: number
}

interface MissingRoute {
  size: string | null
  pickupLocationId: string | null
  factoryLocationId: string | null
  returnLocationId: string | null
  jobNumbers: string[]
}

interface FuelSegment {
  startDate: Date               // jobDate ของ job แรกในช่วง
  endDate: Date                 // jobDate ของจุดเติมที่ปิดช่วง
  closingJobId: string
  jobCount: number
  actualLiters: number
  standardLiters: number | null // null เมื่อ incomplete
  diffLiters: number | null     // actual − standard
  status: 'ok' | 'missing_standard' | 'no_previous_fill'
  missingRoutes: MissingRoute[] // เฉพาะ missing_standard
}

interface FuelSegmentResult {
  segments: FuelSegment[]       // เฉพาะช่วงที่ปิดภายในเดือนที่ขอ
  pendingJobCount: number       // job หลังจุดเติมสุดท้าย (ในเดือนที่ขอ)
  excessLiters: number          // Σ diff > 0 ของช่วง ok
  netDiffLiters: number         // Σ diff ของช่วง ok
}

function computeFuelSegments(
  jobs: FuelJob[],              // เรียง jobDate asc, createdAt asc แล้ว
  standards: FuelStandardEntry[],
  opts: { month: string; hasPreviousFill: boolean }
): FuelSegmentResult
```

ขั้นตอน:

1. กรอง job ที่ `isCancelled` / `noJob` / `advance` ออก
2. หามาตรฐานต่อ job:
   - `pairRole = 'secondary'` → 0
   - `pairRole = 'primary'` → ใช้ `getPairedSize(size)` เป็น size ในการหา
   - อื่นๆ → size เดิม
   - match ด้วย key 4 ตัว (factory null ต้อง match กับ null เท่านั้น)
   - ไม่เจอ → mark missing (สะสมลง `missingRoutes` group ตาม key)
3. วนตามลำดับ สะสม job ลงช่วงปัจจุบัน เมื่อ `fuelLiters > 0` → ปิดช่วง
   - ช่วงแรกที่ปิด: ถ้า `hasPreviousFill = false` → status `no_previous_fill`
   - มี job missing → `missing_standard`
   - นอกนั้น `ok`
4. job ที่เหลือหลังจุดเติมสุดท้าย → `pendingJobCount` (นับเฉพาะ job ที่อยู่ในเดือนที่ขอ)
5. คืนเฉพาะช่วงที่ `endDate` อยู่ในเดือนที่ขอ

ปัดทศนิยม 2 ตำแหน่งตอนคืนผล (Decimal → number แปลงก่อนเข้า function)

## Data Fetching — `lib/utils/summaryQuery.ts`

ใน `buildMonthSummaries` (เฉพาะคนขับที่ไม่ใช่ NGV):

1. หาจุดเติมล่าสุดก่อนต้นเดือนของแต่ละคนขับในคำสั่งเดียว — raw query `DISTINCT ON ("driverId")` จาก `jobs` ที่ `jobDate < gte`, ไม่ยกเลิก, ไม่ใช่ noJob/advance, ลิตรรวม > 0 เรียง `jobDate DESC, createdAt DESC`
2. ดึง job ของทุกคนขับ ตั้งแต่ `min(วันที่จุดเติมก่อนหน้า)` ถึงสิ้นเดือน (หรือต้นเดือนถ้าไม่มีจุดก่อนหน้า) ในคำสั่งเดียว select field ที่ `FuelJob` ต้องใช้ + `pairLinkAsPrimary`/`pairLinkAsSecondary` + `createdAt`
3. ต่อคนขับ: ตัด job ที่อยู่ก่อนหรือเป็นจุดเติมก่อนหน้า (เทียบ `jobDate, createdAt`) ออก → ส่งเข้า `computeFuelSegments` พร้อม `hasPreviousFill`
4. `FuelStandard` ทั้งหมดดึงครั้งเดียวต่อ request

ถ้าไม่มีจุดเติมก่อนหน้าเลย → ดึงตั้งแต่ต้นเดือน และช่วงแรกเป็น `no_previous_fill`
(ช่วงที่เริ่มก่อนเดือนนี้แต่ไม่มีจุดเติมใดๆ ก่อนหน้า ก็ไม่มีข้อมูลให้คำนวณอยู่แล้ว)

เพิ่ม field ใน `DriverMonthlySummary` ([types/job.ts](../../../types/job.ts)):

```ts
fuelExcessLiters: number | null      // null สำหรับรถ NGV
fuelNetDiffLiters: number | null
fuelSegments: FuelSegmentView[]      // FuelSegment + ชื่อสถานที่ของ missingRoutes สำหรับแสดงผล
fuelPendingJobs: number
```

ชื่อสถานที่ใน `missingRoutes` resolve ฝั่ง server (ดึง Location ตาม id ที่ขาด) เพื่อให้ UI แสดงได้ทันที

## Summary UI — `components/summary/SummaryDetail.tsx`

เพิ่มใน `MonthCard` ต่อจากแถว "45% - ราคาน้ำมัน" (ใน block เดียวกัน ก่อน `RowGap` ของบล็อกค่าเที่ยว):

| แถว | ค่า | การแสดง |
|---|---|---|
| น้ำมันเกินมาตรฐาน | `fuelExcessLiters` ลิตร | สีแดงเมื่อ > 0 |
| น้ำมันเกินสุทธิ | `fuelNetDiffLiters` ลิตร | แดงเมื่อ > 0, เขียวเมื่อ < 0 |
| ช่วงน้ำมัน | `N ช่วง` + `⚠ M ไม่ครบ` (ถ้ามี) + ปุ่ม "ดู" | |

- รถ NGV เว้นว่างทั้ง 3 แถว
- แถวมีความสูง `ROW_HEIGHT` เท่าแถวอื่น เพื่อให้การ์ดหลายเดือนยังตรงกัน

### `components/summary/FuelSegmentsModal.tsx`

ตาราง `size="small"`:

`ช่วงวันที่ | จำนวน job | มาตรฐาน | ใช้จริง | ส่วนต่าง | สถานะ`

- สถานะ: ✅ คำนวณได้ / ⚠ ไม่มีค่ามาตรฐาน / ⚠ ไม่พบจุดเติมก่อนหน้า
- แถว `missing_standard` ขยายได้ (expandable row) แสดงเส้นทางที่ขาด:
  `40DC · CMA/KM.18 → โรงงาน B → SYL  (JOB 123, 456)` + ปุ่ม "ตั้งค่า"
  - ปุ่ม "ตั้งค่า" เปิด `FuelStandardFormModal` กรอกค่า size/สถานที่ไว้ให้ → บันทึกสำเร็จ → refetch summary ของการ์ดนั้น
  - ถ้า route ที่ขาดไม่มี size หรือสถานที่ (job กรอกไม่ครบ) → ไม่แสดงปุ่ม แสดงข้อความ "job กรอกข้อมูลไม่ครบ"
- ท้ายตาราง (ถ้า `fuelPendingJobs > 0`): `รอปิดช่วง: N job หลังเติมครั้งล่าสุด`

หน้าสรุปเข้าได้เฉพาะ ADMIN อยู่แล้ว → quick-add ใช้สิทธิ์เดียวกับหน้าตั้งค่า

## Out of Scope

- คิดเป็นเงิน / เติมช่อง "หัก น้ำมัน/หยุด" อัตโนมัติ
- คอลัมน์ในตาราง job, ตารางรายชื่อคนขับ `/summary`, Excel export ใดๆ
- ใช้เลขไมล์ในการคำนวณ (km/ลิตร)
- ค่ามาตรฐานแบบมีวันที่มีผล (effective date)
- เพิ่ม role check ให้ rate API เดิม

## Testing

### Unit — `lib/utils/__tests__/fuelSegments.test.ts` (`node:test`)

- ตัวอย่างหลัก: A เติม 259 → B…G → H เติม 97, มาตรฐานรวม 80 → ช่วงเดียว diff +17
- จุดเติมเดียวเติมหลายช่อง (OFF + สด + เครดิต) รวมเป็น actual
- job ในช่วงไม่มีค่ามาตรฐาน → `missing_standard` + `missingRoutes` group ตาม key พร้อม jobNumbers, ไม่รวมยอด
- `hasPreviousFill = false` → ช่วงแรก `no_previous_fill`
- job หลังจุดเติมสุดท้าย → `pendingJobCount`
- งานจับคู่: primary ใช้ค่า 2x20DC, secondary = 0; secondary เป็นจุดเติมได้
- job ยกเลิก / noJob / advance ถูกข้าม (ทั้งมาตรฐานและลิตร)
- factory null match เฉพาะมาตรฐานที่ factory null
- excess vs net: ช่วง +17 และ −10 → excess 17, net 7
- ช่วงคร่อมเดือน: ช่วงที่ปิดในเดือนก่อนไม่ถูกคืน, ช่วงที่เริ่มเดือนก่อนแต่ปิดเดือนนี้ถูกคืน

### E2E (Playwright)

- `e2e/jobs/fuel-standard.spec.ts`
  - เพิ่ม / แก้ / ลบ (ผ่าน `modal.confirm`)
  - เพิ่มซ้ำ (รวมกรณีโรงงานว่าง) → error
  - Import CSV: สำเร็จ, ไม่พบสถานที่ → error, ซ้ำในไฟล์ → error, key เดิม → update liters
  - STAFF เรียก `/api/rates/fuel-standard` → 403
- `e2e/summary/summary.spec.ts` เพิ่ม case
  - seed job มีจุดเติม 2 จุด + ค่ามาตรฐาน → การ์ดแสดง "น้ำมันเกินมาตรฐาน" ถูกต้อง
  - ช่วงที่ขาดค่ามาตรฐาน → ⚠ ใน modal → กด "ตั้งค่า" → บันทึก → การ์ดคำนวณใหม่
