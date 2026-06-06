# Design: วันลาคนขับ + วันหยุดบริษัท ในตารางงานรายวัน

วันที่: 2026-06-06

## เป้าหมาย

แสดงให้เห็นในตารางงานของคนขับแต่ละคน (`EditableJobTable`) ว่าวันไหน:
- คนขับ **ลา** (รายคน)
- เป็น **วันหยุดบริษัท** (ส่วนกลาง ทุกคน)
- เป็น **วันอาทิตย์** (วันหยุดประจำสัปดาห์ คำนวณจากวันที่)
- **ไม่มีงาน** (วันว่าง)

โดยแทรกเป็น "banner row" ตามลำดับวันที่ในตารางเดิม

## ขอบเขต (Scope)

- "พนักงาน" ที่ติดตามวันลา = **คนขับรถ (Driver)** เท่านั้น
- แสดงผลในตารางงานของคนขับรายคน (`EditableJobTable`) เท่านั้น — ไม่ทำหน้าภาพรวมทั้งทีม
- วันอาทิตย์ = วันหยุดอัตโนมัติ ไม่เก็บใน DB (คำนวณจาก `dayjs(date).day() === 0`)

## กติกาการแสดงผลแต่ละวัน (สำหรับคนขับ 1 คน)

ลำดับความสำคัญ (priority) ของสิ่งที่แสดงในแต่ละวัน:

| กรณี | สิ่งที่แสดง | สี |
|------|-----------|-----|
| วันนั้น **มีงาน** | แถวงานตามปกติ (งานชนะทุกอย่าง — ไม่มี banner) | (ปกติ) |
| ไม่มีงาน + คนขับ **ลา** | banner "🌴 {ประเภทลา} — {หมายเหตุ}" | เหลือง |
| ไม่มีงาน + เป็น **วันหยุดบริษัท** | banner "🔴 วันหยุด — {ชื่อวันหยุด}" | แดงเข้ม |
| ไม่มีงาน + เป็น **วันอาทิตย์** | banner "🔴 วันอาทิตย์" | แดงเข้ม |
| ไม่มีงาน + ไม่ลา + ไม่ใช่วันหยุด | banner "🔵 ไม่มีงาน" | เทา |

หมายเหตุ: เพราะการลาถูก guard ไม่ให้เกิดในวันที่มีงาน/วันหยุด/วันอาทิตย์ (ดู Guard ด้านล่าง) จึงไม่มีกรณีซ้อนทับของ banner — แต่ละวันมีแค่สถานะเดียว

### กติกาวันอนาคต

นิยาม "อนาคต" = `วันที่ > วันนี้` (เทียบเฉพาะวันที่ ไม่เอาเวลา) — วันนี้ยังนับเป็นปัจจุบัน แสดง banner ได้

- **งาน** ขึ้นเสมอ ไม่ว่าอดีต/ปัจจุบัน/อนาคต (เช่น ลงงานล่วงหน้าวันที่ 8 มิย ก็โชว์แถวงาน)
- **วันลา** ขึ้นเสมอ แม้เป็นวันอนาคต (จองลาล่วงหน้าได้ → ขึ้น banner "🌴 ลา")
- **banner วันว่าง** ("ไม่มีงาน" / "วันหยุด" / "วันอาทิตย์") ของวัน **อนาคต** → **ซ่อน** ไม่สร้างแถว
  - เพราะเป็นการ "เดา" สถานะวันที่ยังมาไม่ถึง
- ถ้าดูเดือนอดีต (เช่น วันนี้ มิย แต่ดู พ.ค.) → ทุกวันเป็นอดีต แสดง banner ครบทั้งเดือน

### ตัวอย่างจริง

สมมติ: เดือน มิ.ย. 2026, วันนี้ = 6 มิย, วันอาทิตย์ = 7/14/21/28, วันหยุดบริษัท = 3 มิย,
คนขับ "สมชาย" มีงานวันที่ 2,3,5 และ 8 (ล่วงหน้า) / ลาวันที่ 4 / จองลาล่วงหน้าวันที่ 20

| ลำดับ | วันที่ | แถว | เหตุผล |
|------|-------|-----|--------|
| 1 | 1 มิย | 🔵 ไม่มีงาน | อดีต ว่าง |
| 2 | 2 มิย | งาน — CT-1234 ... | มีงาน |
| 3 | 3 มิย | งาน — CT-1240 ... | วันหยุด แต่มีงาน → งานชนะ |
| 4 | 4 มิย | 🌴 ลาป่วย — เป็นไข้ | ลา |
| 5 | 5 มิย | งาน — CT-1255 ... | มีงาน |
| 6 | 6 มิย | 🔵 ไม่มีงาน | วันนี้ ว่าง |
| 7 | 8 มิย | งาน — CT-1300 ... | อนาคต แต่มีงาน → ขึ้น |
| 8 | 20 มิย | 🌴 ลากิจ — ... | อนาคต แต่จองลาล่วงหน้า → ขึ้น |

วันที่ 7 (อาทิตย์อนาคต), 9–19, 21–30 ที่ว่าง → ไม่ขึ้น row (banner วันว่างในอนาคตถูกซ่อน)

## Data Model (Prisma)

เพิ่ม 2 model ใหม่ใน `prisma/schema.prisma`:

```prisma
model DriverLeave {
  id          String   @id @default(cuid())
  driverId    String
  driver      Driver   @relation(fields: [driverId], references: [id], onDelete: Cascade)
  leaveDate   DateTime @db.Date
  leaveType   String   // "sick" | "personal" | "other"
  note        String?
  createdById String
  createdBy   AuthUser @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([driverId, leaveDate])   // กันลาซ้ำวันเดียวกัน
  @@index([driverId])
  @@index([leaveDate])
  @@map("driver_leaves")
}

model CompanyHoliday {
  id          String   @id @default(cuid())
  holidayDate DateTime @db.Date @unique
  name        String   // ชื่อวันหยุด เช่น "วันเฉลิมพระชนมพรรษา"
  createdById String
  createdBy   AuthUser @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([holidayDate])
  @@map("company_holidays")
}
```

เพิ่ม relation:
- `Driver`: `leaves DriverLeave[]`
- `AuthUser`: `driverLeaves DriverLeave[]`, `companyHolidays CompanyHoliday[]`

ประเภทการลา (`leaveType`): `sick` (ลาป่วย) / `personal` (ลากิจ) / `other` (อื่นๆ) — fix 3 อย่าง map เป็นภาษาไทยตอนแสดงผล (ตาม pattern เดิม เช่น `jobType`, `Location.type`)

## API Routes

ตาม pattern เดิม: `auth()` check → 401, `NextResponse.json`, error ภาษาไทย, Prisma.

### วันลา
```
GET    /api/jobs/leaves?driverId=xxx&month=YYYY-MM   ดึงวันลาของคนขับในเดือน
POST   /api/jobs/leaves                              ลงลา 1 วัน { driverId, leaveDate, leaveType, note }
DELETE /api/jobs/leaves/[id]                          ยกเลิกการลา
```
สิทธิ์: **SENIOR_STAFF ขึ้นไป** (กลุ่มที่จัดการ jobs ได้)

**Guard ฝั่ง server ตอน POST** (กันลาผิดกติกา — เป็นด่านหลัก):
- วันนั้นมีงาน (Job ที่ `driverId` + `jobDate` ตรง) → `400 "วันนี้มีงานอยู่แล้ว ลงลาไม่ได้"`
- วันนั้นเป็นวันหยุดบริษัท → `400 "วันนี้เป็นวันหยุดบริษัท"`
- วันนั้นเป็นวันอาทิตย์ → `400 "วันอาทิตย์เป็นวันหยุดอยู่แล้ว"`
- ลาซ้ำ (ชน `@@unique`) → `400 "ลงลาวันนี้ไว้แล้ว"`

### วันหยุดบริษัท
```
GET    /api/jobs/holidays?month=YYYY-MM    ดึงวันหยุดในเดือน
POST   /api/jobs/holidays                  เพิ่มวันหยุด { holidayDate, name }
DELETE /api/jobs/holidays/[id]              ลบวันหยุด
```
สิทธิ์: **ADMIN / MANAGER เท่านั้น** (ข้อมูลส่วนกลาง)

### การโหลดข้อมูลในตาราง
Frontend ยิง 3 requests แยก (jobs เดิม + leaves + holidays) แล้วประกอบ banner ฝั่ง client ตอน build `dataSource` — ไม่แตะ logic การเงิน/transfer ของ endpoint งานเดิม (ลด risk)

## UX/UI: Banner Rows ในตาราง

### การประกอบ `dataSource` ใน `EditableJobTable`
1. งานทั้งหมดของเดือน (เหมือนเดิม) — ขึ้นเสมอ
2. วันลาที่มี → แทรก banner "🌴 ..." (ขึ้นเสมอ แม้อนาคต)
3. วันว่าง (ไม่มีงาน + ไม่ลา) ตั้งแต่วันที่ 1 ถึง `min(วันนี้, สิ้นเดือน)` → แทรก banner ตามประเภท (วันหยุด/อาทิตย์/ไม่มีงาน)
4. วันอนาคตที่ว่าง → ข้าม
5. เรียงทุกแถวตามวันที่จริง

### หน้าตา banner
- คอลัมน์แรก = **เลขวันที่ (DD)** (คงไว้ อ่านลำดับวันง่าย)
- เนื้อหา banner พาด (colSpan) คอลัมน์ที่เหลือเป็น cell เดียว
- banner เป็น **read-only** ในตาราง — จัดการลาผ่าน modal เท่านั้น
- สีพื้น: ลา = **เหลือง**, วันหยุด/อาทิตย์ = **แดงเข้ม**, ไม่มีงาน = **เทา**
- banner ไม่นับรวมในยอดเงิน/transfer ใดๆ (visual ล้วน)
- draft rows (edit mode) ยังต่อท้ายเหมือนเดิม ไม่ยุ่งกับ banner

## UX/UI: Modal จัดการวันลา

Component แยก `LeaveManagerModal` รับ `driverId`, `month`, callback `onChange` — แยกออกจาก `EditableJobTable` (1200 บรรทัด) ตารางแค่เปิด modal + refresh เมื่อ `onChange`

- ปุ่ม **"จัดการวันลา"** ที่ header ตาราง (ข้างปุ่ม export/edit)
- เปิด modal แสดง **ปฏิทินเดือนที่กำลังดู** (antd `Calendar` month view)
- สถานะแต่ละวัน:

| สถานะวัน | การแสดง / กด |
|---------|-------------|
| ลาได้ (ว่าง) | กดเลือกได้ (อดีต/ปัจจุบัน/อนาคตได้หมด) |
| ลาไว้แล้ว | ไฮไลต์เหลือง + โชว์ประเภท กดเพื่อแก้/ยกเลิก |
| มีงาน | disable (เทา) tooltip "มีงาน" |
| วันหยุดบริษัท | disable (แดง) tooltip "วันหยุด" |
| วันอาทิตย์ | disable (แดง) tooltip "วันอาทิตย์" |

- **กดวันลาได้** → popover/inline form: เลือก**ประเภท** (ลาป่วย/ลากิจ/อื่นๆ) + **หมายเหตุ** → บันทึก → `POST`
- **กดวันลาไว้แล้ว** → แสดงประเภท+หมายเหตุ + ปุ่ม "ยกเลิกการลา" → `DELETE`
- เลือก **ทีละวัน** (ไม่ใช่ multi-select)
- ปิด modal → ตาราง refresh แสดง banner ใหม่

ข้อกำหนด data-testid (ตาม CLAUDE.md): ปุ่ม/Input ใส่ `data-testid` ตรง, Modal ใช้ `getByRole('dialog')`, Select/DatePicker ใส่ `id` prop (ห้ามครอบด้วย div)

## UX/UI: หน้าตั้งค่าวันหยุดบริษัท

หน้าใหม่ `app/(protected)/jobs/settings/holidays/page.tsx`:
- ตาราง list วันหยุด (วันที่ + ชื่อ) เรียงตามวันที่
- ปุ่ม "เพิ่มวันหยุด" → DatePicker (`id` prop) + ชื่อวันหยุด
- ลบได้ทีละรายการ
- เพิ่มลิงก์เมนูใน `components/ProtectedLayoutClient.tsx` ใต้ `jobs-settings` แสดงเฉพาะ **ADMIN/MANAGER**

## ไฟล์ที่เกี่ยวข้อง

เพิ่มใหม่:
- `app/api/jobs/leaves/route.ts` (GET, POST)
- `app/api/jobs/leaves/[id]/route.ts` (DELETE)
- `app/api/jobs/holidays/route.ts` (GET, POST)
- `app/api/jobs/holidays/[id]/route.ts` (DELETE)
- `app/(protected)/jobs/settings/holidays/page.tsx`
- `components/jobs/LeaveManagerModal.tsx`
- `types/leave.ts` (ถ้าจำเป็น — interface DriverLeave / CompanyHoliday)

แก้ไข:
- `prisma/schema.prisma` (เพิ่ม 2 model + relation)
- `components/jobs/EditableJobTable.tsx` (โหลด leaves/holidays, ประกอบ banner ใน dataSource, ปุ่มเปิด modal)
- `components/ProtectedLayoutClient.tsx` (เพิ่มเมนูวันหยุด)

## สิ่งที่ไม่ทำ (Out of scope / YAGNI)

- หน้าภาพรวมวันลาทั้งทีม (ตอบ A ในข้อ 2 — รายคนพอ)
- ลาครึ่งวัน
- workflow อนุมัติการลา
- สถิติ/รายงานวันลา
- ให้ ADMIN แก้รายการประเภทการลา (fix 3 อย่างพอ)
