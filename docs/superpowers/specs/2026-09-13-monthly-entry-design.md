# ช่องกรอกมือรายเดือน + สลับคนขับ (Monthly Manual Entry)

วันที่: 2026-09-13
ต่อยอดจาก: [2026-09-13-driver-monthly-summary-design.md](2026-09-13-driver-monthly-summary-design.md)

## ที่มา

หน้าสรุปงานเดิมเว้น 5 ช่องไว้ให้กรอกในไฟล์ Excel เอง เพราะระบบไม่มีข้อมูล
ผลคือทุกครั้งที่ export ต้องกรอกซ้ำ และข้อมูลไม่ถูกเก็บไว้ที่ไหนเลย

งานนี้ย้ายการกรอกเข้ามาไว้ในระบบ — **แก้ที่การ์ดสรุปที่เดียว** แล้วค่าไปโผล่ทั้งบนหน้าจอและในไฟล์ Excel

## ขอบเขต 4 ส่วน

1. **ค้างคืน** → คำนวณอัตโนมัติ (ไม่ต้องกรอก)
2. **4 ช่องที่เหลือ** → เก็บลง DB แยกตามคน+เดือน แก้ทีละช่องบนการ์ด
3. **Excel** → ใส่ค่าที่กรอกไว้ลงไปเลย ไม่เว้นว่าง
4. **ปุ่มสลับคนขับ** บนหน้ารายคน

---

## ส่วนที่ 1 — ค้างคืน คำนวณอัตโนมัติ

"ค้างคืน" มีลักษณะเดียวกับ "ซ่อมรถ" คือเป็นวันที่คนขับไม่ได้วิ่งงานปกติ
จึงเก็บในรูปแบบเดียวกัน: job ประเภท "ไม่มีงาน" ที่มีเหตุผลระบุ

### เปลี่ยนแปลง

```ts
// types/job.ts
export const NO_JOB_REASONS = [
  { value: "repair",    label: "ซ่อมรถ" },
  { value: "overnight", label: "ค้างคืน" },   // ← เพิ่ม
  { value: "lowVolume", label: "งานน้อย" },
  { value: "cancelled", label: "งานยกเลิก" },
  { value: "other",     label: "อื่นๆ" },
] as const;
```

`calculateDriverSummary` เพิ่ม:
```ts
overnightDays: active.filter((j) => j.jobType === "noJob" && j.noJobReason === "overnight").length,
```

ตัวเลือกนี้จะโผล่ในหน้ากรอกงานอัตโนมัติ (`JobFormModal`/`EditableJobTable` อ่านจาก `NO_JOB_REASONS`)
— ไม่ต้องแก้อะไรเพิ่ม

---

## ส่วนที่ 2 — ช่องกรอกมือ เก็บลง DB

### Schema

```prisma
model DriverMonthlyEntry {
  id       String @id @default(cuid())
  driverId String
  driver   Driver @relation(fields: [driverId], references: [id], onDelete: Cascade)
  /** 'YYYY-MM' */
  month    String

  /** แบก (เที่ยว) */
  carryTrips    Int?
  /** หัก น้ำมัน/หยุด (บาท) — ปกติเป็นค่าลบ */
  fuelDeduction Decimal? @db.Decimal(10, 2)
  /** ค่าใช้จ่ายต่างๆ (บาท) */
  otherExpenses Decimal? @db.Decimal(10, 2)
  /** สรุปให้เงินเดือนคนรถ (บาท) */
  driverPayout  Decimal? @db.Decimal(10, 2)

  updatedById String
  updatedBy   AuthUser @relation(fields: [updatedById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([driverId, month])
  @@index([driverId])
  @@index([month])
  @@map("driver_monthly_entries")
}
```

**ทำไมเก็บ `updatedById`**: เป็นข้อมูลเกี่ยวกับเงินเดือน ต้องตามรอยได้ว่าใครแก้
(รูปแบบเดียวกับ `DriverLeave`/`CompanyHoliday` ที่มีอยู่แล้ว)

**ทำไม `month` เป็น String ไม่ใช่ Date**: ทั้งระบบใช้ `'YYYY-MM'` เป็นคีย์เดือนอยู่แล้ว
(`buildMonthSummaries`, `monthsInRange`, `DriverMonthlySummary.month`) การใช้ String
ทำให้ `@@unique([driverId, month])` ตรงไปตรงมาและ query ง่าย

ทุก field เป็น nullable — ไม่กรอกก็ได้ แสดงเป็นช่องว่าง ไม่ใช่ 0

### API

`PATCH /api/summary/[driverId]/entry` — ADMIN เท่านั้น (401/403 เหมือน route อื่นในกลุ่ม)

Request:
```json
{ "month": "2026-08", "field": "carryTrips", "value": 6 }
```

- `field` ต้องเป็นหนึ่งใน 4 ชื่อที่อนุญาต — ไม่งั้น 400 (กันเขียนทับ field อื่นผ่าน API)
- `value` เป็น `number` หรือ `null` (ล้างค่า)
- ใช้ `upsert` ด้วย `driverId_month` — ไม่ต้องสร้าง record ล่วงหน้า
- คืน entry ที่อัปเดตแล้วทั้ง record

Response 200:
```json
{ "month": "2026-08", "carryTrips": 6, "fuelDeduction": null, "otherExpenses": null, "driverPayout": null }
```

### ผูกเข้ากับ summary

`buildMonthSummaries` ดึง `DriverMonthlyEntry` ของเดือนนั้นมาด้วย (batch query เดียวเหมือน jobs/leaves)
แล้วส่งเข้า `calculateDriverSummary` ผ่าน `SummaryInput.entry`

`DriverMonthlySummary` เพิ่ม field:
```ts
overnightDays: number;          // คำนวณจาก noJobReason
carryTrips: number | null;      // กรอกมือ
fuelDeduction: number | null;   // กรอกมือ
otherExpenses: number | null;   // กรอกมือ
driverPayout: number | null;    // กรอกมือ
```

### ยอดคงเหลือของบริษัท

คำนวณอัตโนมัติ ไม่เก็บ ไม่ให้กรอก:

```
ยอดคงเหลือ = รายได้ − รวมใช้น้ำมัน − สรุปให้เงินเดือนคนรถ − ค่าใช้จ่ายต่างๆ
```

ถ้าตัวตั้งใดเป็น `null` (ยังไม่กรอก) ให้แสดงค่าว่าง ไม่ใช่คำนวณโดยมองเป็น 0 —
ตัวเลขครึ่งๆ กลางๆ ในรายงานเงินเดือนอันตรายกว่าช่องว่าง

---

## ส่วนที่ 3 — UI แก้ไขในการ์ด

### พฤติกรรม

แต่ละแถวที่แก้ได้ (4 แถว) มีไอคอนดินสอจางๆ ทางขวาของค่า:

1. กดดินสอ → ช่องค่ากลายเป็น `<InputNumber size="small">` โฟกัสอัตโนมัติ เลือกข้อความทั้งหมด
2. กรอกค่า
3. **บันทึก**: กด Enter หรือคลิกไอคอนติ๊กถูก
4. **ยกเลิก**: กด Esc หรือคลิกไอคอนกากบาท (ค่าเดิมกลับมา)
5. ระหว่างบันทึกแสดง spinner เล็กๆ ปิด input ไม่ให้แก้ซ้ำ
6. สำเร็จ → `message.success` และแถวที่คำนวณต่อ (ยอดคงเหลือ) อัปเดตทันที
7. ล้มเหลว → `message.error` ภาษาไทย และ**คืนค่าเดิม** ไม่ปล่อยให้หน้าจอโชว์ค่าที่ยังไม่ได้บันทึก

**แก้ทีละช่อง** — เปิดดินสอช่องใหม่ขณะที่อีกช่องยังแก้ค้างอยู่ ให้ยกเลิกช่องเดิมก่อน

### ความสูงแถว

เพิ่ม padding จาก `1px 8px` เป็น `4px 8px` และตั้ง `minHeight: 30` ให้ทุกแถว
เพื่อให้แถวที่มี input กับแถวธรรมดาสูงเท่ากัน ไม่กระตุกตอนสลับโหมด

ความกว้างการ์ดคง 400px — ไอคอนดินสอกินพื้นที่ 20px ซึ่งช่องหน่วย (38px) มีที่เหลือพอ

### เดือนที่แก้ได้

แก้ได้เฉพาะเดือนที่**จบแล้ว** (ซึ่งคือทุกการ์ดที่แสดงอยู่ เพราะซ่อนเดือนปัจจุบันไปแล้ว)
ไม่ต้องมีเงื่อนไขเพิ่ม

---

## ส่วนที่ 4 — ปุ่มสลับคนขับ

บนหน้ารายคน เพิ่มปุ่มข้างชื่อคนขับ กดแล้วเปิด modal ค้นหา

- สร้าง `components/summary/SummaryDriverSwitchModal.tsx` ใหม่ รับ `Driver[]`
  **ไม่ดัดแปลง `components/jobs/DriverSearchModal.tsx`** เพราะตัวนั้นผูกกับ `DriverJobSummary`
  และมีเทสต์ของหน้า jobs คุมอยู่ — แก้แล้วเสี่ยงพังของเดิมโดยไม่จำเป็น
- ค้นจาก **ชื่อ หรือ เบอร์รถ** แสดงกลุ่มในผลลัพธ์ (รูปแบบเดียวกับของหน้า jobs)
- คลิกผลลัพธ์ → `router.push('/summary/<id>')` → หน้าโหลดข้อมูลคนใหม่ **คงปีที่เลือกไว้**
- คนที่กำลังดูอยู่แสดงเป็น disabled ในรายการ (กันกดแล้วไม่เกิดอะไรขึ้น)

ดึงรายชื่อจาก `/api/drivers` ตอนเปิด modal ครั้งแรก แล้ว cache ไว้

---

## Excel

4 ช่องที่เคยเว้นว่างจะมีค่าจากระบบแล้ว:

| แถว | เดิม | ใหม่ |
|---|---|---|
| 9 แบก | ว่าง | `carryTrips` |
| 10 ค้างคืน | ว่าง | `overnightDays` (คำนวณ) |
| 24 หัก น้ำมัน/หยุด | ว่าง | `fuelDeduction` |
| 28 สรุปให้เงินเดือนคนรถ | ว่าง | `driverPayout` |
| 30 ค่าใช้จ่ายต่างๆ | ว่าง | `otherExpenses` |

**สูตรทุกตัวคงเดิม** — แถว 26 (รวม) และ 32 (ยอดคงเหลือ) ยังเป็นสูตรที่อ้างเซลล์เหล่านี้
พอมีค่าจริงแล้วก็คำนวณได้ทันทีตอนเปิดไฟล์ ไม่ต้องกรอกอะไรอีก

ช่องที่ยังไม่ได้กรอก (`null`) ยังเว้นว่างเหมือนเดิม — สูตรที่อ้างถึงจะมองเป็น 0 ตามพฤติกรรม Excel ปกติ

---

## Testing

### E2E
- กดดินสอ → กรอก → save → ค่าแสดงบนการ์ด และยังอยู่หลัง refresh
- กด Esc ระหว่างแก้ → ค่าเดิมกลับมา ไม่ถูกบันทึก
- กรอก "สรุปให้เงินเดือนคนรถ" + "ค่าใช้จ่ายต่างๆ" → ยอดคงเหลือคำนวณถูก
- MANAGER ยิง `PATCH /api/summary/[id]/entry` → 403
- ยิง `field` ที่ไม่อยู่ใน whitelist → 400
- export Excel แล้วค่าที่กรอกอยู่ในเซลล์ถูกต้อง (อ่านไฟล์จริงด้วย openpyxl)
- ปุ่มสลับคนขับ → ค้นหา → คลิก → URL เปลี่ยนและข้อมูลเป็นของคนใหม่

### Unit (node:test)
- `calculateDriverSummary` นับ `overnightDays` ถูก และไม่ปนกับ `repairDays`
- ยอดคงเหลือเป็น `null` เมื่อตัวตั้งใดยังไม่กรอก

---

## ไฟล์ที่เกี่ยวข้อง

**แก้ไข**
- `prisma/schema.prisma` — model ใหม่ + relation ใน Driver/AuthUser
- `types/job.ts` — `NO_JOB_REASONS`, `DriverMonthlySummary`
- `lib/utils/summaryCalculator.ts` — `overnightDays` + รับ entry
- `lib/utils/summaryQuery.ts` — ดึง entry มา join
- `lib/utils/summaryExcelGenerator.ts` — ใส่ค่าลง 5 เซลล์
- `components/summary/SummaryDetail.tsx` — แถวแก้ไขได้ + ปุ่มสลับคน

**สร้างใหม่**
- `app/api/summary/[driverId]/entry/route.ts`
- `components/summary/EditableSummaryRow.tsx`
- `components/summary/SummaryDriverSwitchModal.tsx`
- `e2e/summary/monthly-entry.spec.ts`
