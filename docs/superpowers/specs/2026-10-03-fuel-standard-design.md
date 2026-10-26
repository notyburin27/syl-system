# น้ำมันมาตรฐาน (Fuel Standard) — Design

**Date:** 2026-10-03 · **Revised:** 2026-10-26 (key ใหม่: งานวิ่ง = size + โรงงาน + แหลมฉบัง, งานทอย = size + ที่ทอย)
**Status:** Approved (design)

## Goal

ตั้งค่า "น้ำมันมาตรฐานต่อเที่ยว" แล้วเทียบกับน้ำมันที่เติมจริงของรถแต่ละคัน
เพื่อให้รู้ว่าคนขับใช้น้ำมันเกินมาตรฐานกี่ลิตร — ใช้ประกอบการกรอก "หัก น้ำมัน/หยุด" ในหน้าสรุปรายเดือน

ตัวอย่างค่ามาตรฐาน:

```
วิ่ง  40DC  โรงงาน B               300 ลิตร   (รับ/คืนตู้โซนกรุงเทพ)
วิ่ง  40DC  โรงงาน B  แหลมฉบัง     450 ลิตร   (รับหรือคืนตู้ที่แหลมฉบัง)
ทอย  40DC  WINWIN                  25 ลิตร
```

คนขับไม่ได้จดไมล์/เติมน้ำมันทุก job — เติมเต็มถังเป็นช่วงๆ จึงต้องรวม job เป็น "ช่วง" ก่อนเทียบ:

```
A  เติม 259
B  -
…
H  เติม 97

ช่วง B–H: ใช้จริง 97 ลิตร, มาตรฐาน Σ(B..H) = 80 ลิตร → เกิน +17 ลิตร
```

### ทำไมเปลี่ยน key (2026-10-26)

ข้อมูล prod ก.ค.–ก.ย. 2026: key เดิม `size + รับตู้ + โรงงาน + คืนตู้` มี 1,386 แบบ ตั้งค่าครบไม่ไหว
user เลือกดูโรงงานเป็นหลัก ยกเว้นรับ/คืนตู้ที่แหลมฉบังแยกค่า (ท่าเรืออื่นทั้งหมดถือเป็นโซนกรุงเทพ)
— งานวิ่ง 322 key, 61 key ครอบคลุม 80%
งานทอย (~3,000 เที่ยว, 44% ของงาน) กรอกแค่สถานที่รับตู้ — ใช้ size + ที่ทอย, 182 key, 59 key ครอบคลุม 80%

## Behavior (confirmed with user)

1. **Key ของค่ามาตรฐาน** = `ประเภท + size + สถานที่ + แหลมฉบัง`
   - **งานวิ่ง** (jobType อื่นที่ไม่ใช่ทอย: ขาเข้า/ขาออก/พื้นเรียบ/โรงสี) — สถานที่ = **โรงงาน** ของ job,
     แหลมฉบัง = สถานที่รับตู้ **หรือ** คืนตู้มีคำว่า `แหลม` ในชื่อ
   - **งานทอย** (`towing`, `towingHeavy`) — สถานที่ = **สถานที่รับตู้** (ที่ทอย), แหลมฉบัง = false เสมอ
     (ที่ทอยเป็นแหลมฉบังก็คือสถานที่นั้นเองอยู่แล้ว)
   - **เช็คแหลมฉบังจากชื่อสถานที่** (`name.includes("แหลม")`) — ไม่มี field ใน Location
     สถานที่แหลมฉบังใน prod เปลี่ยนชื่อเป็นรูปแบบ `<ชื่อ> /แหลมฉบัง` แล้ว (`sql/rename-laem-locations-261026-v1.sql`)
     สถานที่ใหม่ต้องตั้งชื่อให้มีคำว่า "แหลม" — หน้าตั้งค่าแสดงคำอธิบายนี้
2. **ค่ามาตรฐานกรอกเองทั้งหมด** — ไม่ใช้เลขไมล์ ไม่มีค่าแนะนำอัตโนมัติ
3. **จุดเติม** = job ที่ `fuelOfficeLiters + fuelCashLiters + fuelCreditLiters > 0` ถือว่าเติมเต็มถังทุกครั้ง
4. **ช่วง** = job ถัดจากจุดเติมก่อนหน้า ถึงจุดเติมนี้ (รวมจุดเติมนี้)
   ใช้จริง = ลิตรรวม ณ จุดเติมที่ปิดช่วง, มาตรฐาน = Σ มาตรฐานของทุก job ในช่วง, ส่วนต่าง = ใช้จริง − มาตรฐาน
5. **ไม่มีค่ามาตรฐาน** — ถ้าในช่วงมี job ใดหาค่ามาตรฐานไม่เจอ ช่วงนั้น **ไม่คำนวณ** (incomplete) และแสดงคำเตือนพร้อม key ที่ขาด ไม่นำไปรวมยอดเดือน
   รวมถึง job ที่กรอกไม่ครบ (ไม่มี size, งานวิ่งไม่มีโรงงาน, งานทอยไม่มีสถานที่รับตู้)
6. **ไม่มีจุดเติมก่อนหน้า** (ช่วงแรกสุดของรถคันนั้น) — incomplete เพราะไม่รู้ว่าถังเหลือเท่าไร
7. **งานจับคู่** — ในการตัดช่วง ใบ secondary ถูกจัดให้อยู่ถัดจากใบ primary เสมอ; ใบ primary ใช้ค่ามาตรฐานของ paired size (`getPairedSize`: 20DC → 2x20DC, 20RF → 2x20RF) ครั้งเดียว ใบ secondary มาตรฐาน = 0 (แต่ถ้าใบ secondary มีการเติมก็ยังเป็นจุดเติมได้)
8. **ทอยที่ถูกดูดซับ** (`isTowingAbsorbed`) — มาตรฐาน = 0 เพราะค่าเที่ยวถูกรวมไปกับงานหลักแล้ว (ยังเป็นจุดเติมได้)
9. **ช่วงคร่อมเดือน** — นับเข้าเดือนของ job ที่ปิดช่วง job หลังจุดเติมสุดท้ายของเดือน = "รอปิดช่วง" ยังไม่นับ
10. **ยอดรายเดือน** แสดงทั้งสองแบบ:
    - เกินรวม = Σ ส่วนต่างที่ > 0
    - สุทธิ = Σ ส่วนต่างทุกช่วง (หักลบช่วงที่ประหยัด)
11. **ไม่คิดเป็นเงิน** — แสดงเป็นลิตรเท่านั้น ยอดหักเงินคนขับยังกรอกมือในช่อง "หัก น้ำมัน/หยุด" (`DriverMonthlyEntry.fuelDeduction`) ตามเดิม
12. **แสดงผลที่หน้าสรุปรายเดือนเท่านั้น** — ไม่แตะตาราง job, ไม่แตะ Excel export
13. **คำนวณสดทุกครั้งที่เปิดหน้าสรุป** — ไม่เก็บผลลง DB แก้ค่ามาตรฐาน/ชื่อสถานที่แล้วตัวเลขเดือนเก่าเปลี่ยนตาม (ยอมรับได้ เพราะยอดหักจริงถูกกรอกมือเก็บไว้แล้ว)

Assumptions (ยืนยันกับ user แล้ว):

- job ที่ `isCancelled`, `jobType = noJob`, `jobType = advance` — ข้ามทั้งหมด ไม่นับทั้งมาตรฐานและลิตรที่เติม
- รถ NGV (`Driver.isGasVehicle`) — ไม่คำนวณ เว้นว่าง

## Data Model

[prisma/schema.prisma](../../../prisma/schema.prisma) หมวด Rate Tables ถัดจาก `RateDriverWage`:

```prisma
// น้ำมันมาตรฐานต่อเที่ยว — งานวิ่ง: size + โรงงาน (+ แหลมฉบัง), งานทอย: size + ที่ทอย
model FuelStandard {
  id            String   @id @default(cuid())
  kind          String   // "run" | "towing"
  size          String
  locationId    String   // run = โรงงาน, towing = สถานที่รับตู้ (ที่ทอย)
  isLaemChabang Boolean  @default(false) // run เท่านั้น — รับหรือคืนตู้ที่แหลมฉบัง
  liters        Decimal  @db.Decimal(10, 2)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  location Location @relation("FuelStandardLocation", fields: [locationId], references: [id])

  @@unique([kind, size, locationId, isLaemChabang])
  @@map("fuel_standard")
}
```

`Location` มี back-relation `fuelStandards FuelStandard[] @relation("FuelStandardLocation")`
ทุกช่องใน key ไม่เป็น null → `@@unique` กันซ้ำได้เอง (API ยังเช็คก่อนเพื่อตอบ 409 เป็นข้อความไทย)

ตารางเดิม (key 4 สถานที่) มีอยู่แค่บน staging และไม่มีข้อมูลจริง → `db push --accept-data-loss` สร้างใหม่ได้เลย
prod ยังไม่มีตารางนี้

ลบแบบ hard delete เหมือนตาราง rate อื่น

## API

ทุก route: `requireApiRoles(RATE_ROLES)` → 401 ถ้าไม่มี session, **403 ถ้า role ไม่ใช่ ADMIN/MANAGER** (role มาจาก [lib/settingsNav.ts](../../../lib/settingsNav.ts) ร่วมกับเมนูและหน้า)
Error message ภาษาไทย

| Method | Route | หน้าที่ |
|---|---|---|
| GET | `/api/rates/fuel-standard` | รายการทั้งหมด include ชื่อสถานที่ เรียงตาม kind, size, ชื่อสถานที่ |
| POST | `/api/rates/fuel-standard` | สร้าง — 400 ถ้าขาด field / kind ผิด / liters ผิด / ทอยติ๊กแหลมฉบัง, 409 ถ้า key ซ้ำ |
| PUT | `/api/rates/fuel-standard/[id]` | แก้ — 409 ถ้า key ใหม่ชนกับแถวอื่น |
| DELETE | `/api/rates/fuel-standard/[id]` | ลบ |
| POST | `/api/rates/fuel-standard/import` | import CSV (ดูด้านล่าง) |

Body POST/PUT: `{ kind: "run" | "towing", size, locationId, isLaemChabang?: boolean, liters }`

### Import CSV

ใช้ `ImportCSVModal` ตัวเดิม (validate → preview → import)

- headers: `kind, size, locationName, isLaemChabang, liters`
- headerLabels: `ประเภท, SIZE, สถานที่, แหลมฉบัง, ลิตร`
- optional: `isLaemChabang`
- exampleRow: `วิ่ง, 40DC, โรงงาน B, Y, 450`
- Validation ต่อแถว:
  - ประเภท: `วิ่ง` / `ทอย` (รับ `run` / `towing` ด้วย)
  - size ต้องอยู่ใน `SIZE_OPTIONS`
  - **ชื่อสถานที่ต้องมีอยู่แล้วใน `Location` (isActive)** — ไม่เจอ → error `ไม่พบสถานที่ "X"`
  - งานวิ่ง: สถานที่ต้องเป็น `type = factory` — ไม่ใช่ → error
  - แหลมฉบัง: ว่าง / `N` / `ไม่` / `0` = ไม่ใช่, `Y` / `ใช่` / `1` = ใช่ (ไม่สนตัวพิมพ์) อื่นๆ → error;
    งานทอยติ๊กแหลมฉบัง → error
  - liters ต้องเป็นตัวเลข 0 ≤ liters ≤ 99,999,999.99 — ว่าง/Infinity/เกิน → error (POST/PUT ใช้กฎเดียวกัน)
  - key ซ้ำกันเองในไฟล์ → error
- Import: key ซ้ำกับของเดิม → update liters, ไม่ซ้ำ → create — โหลดของเดิมครั้งเดียวก่อน transaction แล้วใน `$transaction` ทำ update-by-id / create ต่อแถว `timeout: 30000`

### Export

ปุ่ม Export สร้าง CSV ฝั่ง client จากข้อมูลที่โหลดอยู่ (หลังกรอง) headers เดียวกับ import
ค่า kind เป็น `วิ่ง`/`ทอย`, แหลมฉบังเป็น `Y`/ว่าง — import กลับได้ทันที

## Settings Page

- Route: `app/(protected)/jobs/settings/fuel-standard/page.tsx` — `requireSettingsPage` (ADMIN/MANAGER)
- `components/jobs/FuelStandardManager.tsx`
  - ตาราง `size="small"`: ประเภท | SIZE | สถานที่ | แหลมฉบัง | ลิตร | จัดการ
  - Filter: ประเภท, size, สถานที่
  - ปุ่ม: เพิ่ม, Import, Export
  - คำอธิบายใต้หัวข้อ: งานวิ่งใช้โรงงาน, งานทอยใช้สถานที่รับตู้, "แหลมฉบัง" ใช้เมื่อรับหรือคืนตู้ที่สถานที่ที่ชื่อมีคำว่า "แหลม"
  - ลบ: `modal.confirm`
- `components/jobs/FuelStandardFormModal.tsx` รับ `initialValues` — ใช้ซ้ำจากหน้าสรุป (quick-add)
  - ประเภท (Radio วิ่ง/ทอย, `id="fuel-standard-kind"`)
  - SIZE (`id="fuel-standard-size"`)
  - สถานที่ (`id="fuel-standard-location"`) — วิ่ง: เฉพาะ `type = factory` label "โรงงาน"; ทอย: ทุกสถานที่ label "สถานที่รับตู้ (ที่ทอย)"
    เปลี่ยนประเภทแล้วสถานที่ที่เลือกไว้ไม่อยู่ในตัวเลือกใหม่ → ล้างค่า
  - Checkbox แหลมฉบัง (`id="fuel-standard-laem"`) แสดงเฉพาะงานวิ่ง
  - ลิตร InputNumber min 0 precision 2
- เมนู "น้ำมันมาตรฐาน" ใน [components/ProtectedLayoutClient.tsx](../../../components/ProtectedLayoutClient.tsx) (มีแล้ว)

## Calculation — `lib/utils/fuelSegments.ts`

Pure function ไม่แตะ DB

```ts
type FuelStandardKind = 'run' | 'towing'

interface FuelJob {
  id: string
  jobNumber: string
  jobDate: string               // 'YYYY-MM-DD'
  jobType: string
  isCancelled: boolean
  isTowingAbsorbed: boolean
  size: string | null
  pickupLocationId: string | null
  factoryLocationId: string | null
  /** รับหรือคืนตู้ที่แหลมฉบัง — query คำนวณจากชื่อสถานที่ด้วย isLaemChabangName */
  touchesLaemChabang: boolean
  fuelLiters: number            // OFF + สด + เครดิต (null → 0)
  pairRole: 'primary' | 'secondary' | null
  pairPartnerId: string | null
}

interface FuelStandardEntry { kind; size; locationId; isLaemChabang; liters }

interface FuelMissingRoute {
  kind: FuelStandardKind
  size: string | null           // size ที่ใช้หา (ใบหลักงานคู่ = paired size)
  locationId: string | null
  isLaemChabang: boolean
  jobNumbers: string[]
}

function isLaemChabangName(name: string | null | undefined): boolean  // name.includes('แหลม')
function fuelStandardKindOf(jobType: string): FuelStandardKind
```

`FuelSegment` / `FuelSegmentResult` / `computeFuelSegments(jobs, standards, { month, hasPreviousFill })` เหมือนเดิม

ขั้นตอน:

1. กรอง job ที่ `isCancelled` / `noJob` / `advance` ออก แล้วจัดใบ secondary ไว้ถัดจากใบ primary ของมันทันที
2. หามาตรฐานต่อ job:
   - `pairRole = 'secondary'` หรือ `isTowingAbsorbed` → 0
   - kind = `towing` ถ้า jobType เป็นทอย, นอกนั้น `run`
   - size = `getPairedSize(size)` ถ้าเป็นใบ primary, นอกนั้น size เดิม
   - run: locationId = factoryLocationId, isLaemChabang = touchesLaemChabang
   - towing: locationId = pickupLocationId, isLaemChabang = false
   - ไม่มี size/locationId หรือหาไม่เจอ → mark missing (group ตาม key)
3. วนตามลำดับ สะสม job ลงช่วงปัจจุบัน เมื่อ `fuelLiters > 0` → ปิดช่วง
   - ช่วงแรกที่ปิด: ถ้า `hasPreviousFill = false` → `no_previous_fill`
   - มี job missing → `missing_standard`
   - นอกนั้น `ok`
4. job ที่เหลือหลังจุดเติมสุดท้าย → `pendingJobCount` (เฉพาะ job ในเดือนที่ขอ)
5. คืนเฉพาะช่วงที่ `endDate` อยู่ในเดือนที่ขอ

ปัดทศนิยม 2 ตำแหน่งตอนคืนผล

## Data Fetching — `lib/utils/fuelSegmentsQuery.ts`

`buildMonthSummaries(month, driverIds, { includeFuelStandard })` — เฉพาะ `/api/summary/[driverId]` ส่ง true

`buildFuelStandardSummaries(month, driverIds)` ต่อคนขับ:

1. หาจุดเติมล่าสุดก่อนต้นเดือน (`findFirst` เรียง `jobDate DESC, createdAt DESC`)
2. ดึง job ตั้งแต่วันที่จุดเติมก่อนหน้า (หรือต้นเดือน) ถึงสิ้นเดือน เรียง `jobDate ASC, createdAt ASC`
   select ชื่อสถานที่รับ/คืนตู้เพื่อคำนวณ `touchesLaemChabang`, และ `isTowingAbsorbed`
3. ตัด job จนถึงจุดเติมก่อนหน้า (หาด้วย id) ออก → `computeFuelSegments`
4. `FuelStandard` ทั้งหมดดึงครั้งเดียวต่อ request

`types/job.ts`:

```ts
interface FuelMissingRouteView {
  kind: 'run' | 'towing'
  size: string | null
  locationId: string | null
  locationName: string | null
  isLaemChabang: boolean
  jobNumbers: string[]
}
```

ชื่อสถานที่ใน `missingRoutes` resolve ฝั่ง server

## Summary UI — `components/summary/SummaryDetail.tsx`

แถวใน `MonthCard` ต่อจาก "45% - ราคาน้ำมัน":

| แถว | ค่า | การแสดง |
|---|---|---|
| น้ำมันเกินมาตรฐาน | `fuelStandard.excessLiters` ลิตร | สีแดงเมื่อ > 0; เว้นว่างเมื่อไม่มีช่วง `ok` เลย |
| น้ำมันเกินสุทธิ | `fuelStandard.netDiffLiters` ลิตร | แดงเมื่อ > 0, เขียวเมื่อ < 0; เว้นว่างเมื่อไม่มีช่วง `ok` เลย |
| ช่วงน้ำมัน | `N ช่วง` + `⚠ M ไม่ครบ` (ถ้ามี) + ปุ่ม "ดู" | |

รถ NGV เว้นว่างทั้ง 3 แถว

### `components/summary/FuelSegmentsModal.tsx`

ตาราง `size="small"`: `ช่วงวันที่ | จำนวน job | มาตรฐาน | ใช้จริง | ส่วนต่าง | สถานะ`

- แถวที่มี missingRoutes ขยายได้ แสดง key ที่ขาด:
  - `วิ่ง · 40DC · โรงงาน B · แหลมฉบัง  (JOB 123, 456)` / `ทอย · 40DC · WINWIN  (JOB 789)` + ปุ่ม "ตั้งค่า"
  - ปุ่ม "ตั้งค่า" เปิด `FuelStandardFormModal` กรอก kind/size/สถานที่/แหลมฉบังไว้ให้ → บันทึก → refetch
  - ไม่มี size หรือสถานที่ → ไม่แสดงปุ่ม แสดง "job กรอกข้อมูลไม่ครบ"
- ท้ายตาราง: `รอปิดช่วง: N job หลังเติมครั้งล่าสุด`

## Out of Scope

- คิดเป็นเงิน / เติมช่อง "หัก น้ำมัน/หยุด" อัตโนมัติ
- คอลัมน์ในตาราง job, ตารางรายชื่อคนขับ `/summary`, Excel export
- ใช้เลขไมล์ในการคำนวณ
- ค่ามาตรฐานแบบมีวันที่มีผล (effective date)
- field แหลมฉบังใน Location (ใช้ชื่อแทน)

## Testing

### Unit (`node:test`)

`lib/utils/__tests__/fuelSegments.test.ts`:

- ตัวอย่างหลัก: มาตรฐานรวม 80 เติม 97 → diff +17
- งานวิ่ง match ด้วยโรงงาน ไม่สนสถานที่รับ/คืนตู้ (โซนกรุงเทพ)
- งานวิ่งรับหรือคืนตู้ที่แหลมฉบัง → ใช้ค่า isLaemChabang = true; ไม่มีค่าแหลม → missing (ไม่ fallback ไปค่ากรุงเทพ)
- งานทอย match ด้วยสถานที่รับตู้; `towingHeavy` เป็นทอย
- งานวิ่งไม่มีโรงงาน / ทอยไม่มีที่รับตู้ / ไม่มี size → missing พร้อม kind
- ทอยที่ถูกดูดซับ → 0 แต่ยังเป็นจุดเติมได้
- `missing_standard` group ตาม key พร้อม jobNumbers, ไม่รวมยอด
- `hasPreviousFill = false` → ช่วงแรก `no_previous_fill`
- `pendingJobCount`
- งานจับคู่: primary ใช้ 2x20DC, secondary = 0, เติมใบใดก็ได้ผลเท่ากัน
- job ยกเลิก / noJob / advance ถูกข้าม
- excess vs net
- ช่วงคร่อมเดือน
- `isLaemChabangName`

`lib/utils/__tests__/fuelStandardImport.test.ts`: ประเภทไทย/อังกฤษ, ประเภทผิด, วิ่งต้องเป็นโรงงาน, ทอยใช้สถานที่ใดก็ได้, แหลมฉบัง Y/ว่าง/ค่าผิด, ทอยติ๊กแหลม → error, ไม่พบสถานที่, ซ้ำในไฟล์, liters ผิด

### E2E (Playwright)

- `e2e/jobs/fuel-standard.spec.ts` — เพิ่ม/แก้/ลบ งานวิ่งและทอย, เพิ่มซ้ำ → error, Import CSV (สำเร็จ / ไม่พบสถานที่ / ซ้ำในไฟล์ / key เดิม → update), MANAGER เข้าได้, STAFF → 403
- `e2e/summary/fuel-standard-summary.spec.ts` — seed งานวิ่ง + งานทอย + จุดเติม → การ์ดแสดงค่าถูก; ช่วงที่ขาดค่า → quick-add → การ์ดคำนวณใหม่
