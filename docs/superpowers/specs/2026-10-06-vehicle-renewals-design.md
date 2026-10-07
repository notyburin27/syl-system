# ต่ออายุรถ (พรบ. / ภาษี / ประกัน) — Design

**Date:** 2026-10-06
**Status:** Approved (design)

## Goal

แทน Excel ที่ฝ่ายประกันทำมือ (`พรบ. +ประกัน+สินค้า ทั้งปี 69.xlsx`) ด้วยระบบที่:

1. เก็บทะเบียนรถ (~200 คัน, 2 บริษัท + รถชื่อบุคคล) และ "งวด" ของ พรบ. / ภาษี / ประกันรถยนต์ / ประกันสินค้า พร้อมประวัติ
2. **ติดตามสถานะการต่อทีละคัน** (รอต่อ → กำลังดำเนินการ → ต่อแล้ว / ไม่ต่อ)
3. Dashboard แสดงรายการที่ต้องต่อ **ทั้งเดือนหน้า** + ที่ค้างอยู่
4. Upload Excel (template ใหม่) เพื่อนำข้อมูลเข้า/อัปเดตทีละมาก
5. แนบไฟล์กรมธรรม์ / ป้ายภาษี ต่องวด

เฟสแรกไม่มีการแจ้งเตือนแบบ push — dashboard อย่างเดียว

## ข้อมูลใน Excel เดิม (อ้างอิง)

| ชีต | เนื้อหา |
|---|---|
| `พรบ.3/6/9/12` | รถแบ่ง 4 กลุ่ม หมดสิ้นเดือน มี.ค./มิ.ย./ก.ย./ธ.ค. — เบอร์รถ, ทะเบียน, ลักษณะ, ยี่ห้อ, เลขตัวถัง, บ.พรบ. (นวกิจ ส่วนใหญ่), วันสิ้นสุด แยกตารางตามบริษัทเจ้าของ |
| `ภาษี 6-69` | รายการต่อภาษีเดือน 6/69 — น้ำหนัก, อัตราภาษี, ค่าบริการตัวแทน 1,300/คัน |
| `ต่อรถยนต์+ขนส่ง 1..12` | ประกันรถยนต์ (ป.1/ป.3, คู่กับหาง) + ประกันสินค้า (ความรับผิดผู้ขนส่ง) รายเดือน — บริษัท, เลขกรมธรรม์, เบี้ย, เริ่ม, สิ้นสุด, หมายเหตุ |
| `คลุมราคา+ได้จริง` | เคลมประกัน — **นอกขอบเขต** |
| `Sheet2` | สำเนาบางส่วนของชีตภาษีที่ส่งตัวแทน — ไม่นำเข้า |

หมายเหตุที่พบ: "แจ้ง ม.89" (งดใช้), "ม.79 ขายรถ", "ไม่ต่อ / ไม่ใช้รถ", "กาญ ต่อ" (สาขากาญจนบุรีต่อเอง)
ชื่อบริษัทประกันเจ้าเดียวกันพิมพ์หลายแบบ (เช่น "วิริยะ - ป3", "วิริยะประกันภัย (ป.3)", "บม.วิริยะ ป1")

## Behavior (ยืนยันกับ user แล้ว)

1. **สถานะการต่อชุดเดียวทุกประเภท**: `รอต่อ (PENDING)` → `กำลังดำเนินการ (IN_PROGRESS)` → `ต่อแล้ว (RENEWED)` หรือ `ไม่ต่อ (NOT_RENEWED)`
2. **ไม่ต่อ ต้องมีเหตุผล**: ขายรถ / งดใช้ / รถเกิดอุบัติเหตุ / รถซ่อม / อื่นๆ — "อื่นๆ" ต้องกรอกหมายเหตุ
3. **ช่วงที่ขึ้น dashboard** = ทุกงวดที่ยังเปิด (PENDING/IN_PROGRESS) และ `endDate ≤ สิ้นเดือนหน้า` (Asia/Bangkok)
   เช่น วันนี้ 6 ต.ค. → เห็นทุกรายการที่หมดภายใน 30 พ.ย. รวมถึงรายการ ต.ค. และที่เลยกำหนดซึ่งยังไม่ปิด
4. **สิทธิ์**: role ใหม่ `INSURANCE` (ฝ่ายประกัน) + `MANAGER` + `ADMIN` — สามกลุ่มนี้ดูและแก้ไขได้เท่ากัน
5. **นำเข้าข้อมูล**: หน้า upload Excel ในระบบ ใช้ **template ใหม่** (ตารางเรียบ) — ไฟล์ปี 69 แปลงเป็น template ด้วย script ครั้งเดียว
6. **ภาษีไม่ได้หมดวันเดียวกับ พรบ. เสมอไป** — ไม่ derive วันหมดภาษีจาก พรบ.
7. **แนบไฟล์** กรมธรรม์/ป้ายภาษีต่องวดได้

## Data Model

เพิ่มใน `prisma/schema.prisma`:

```prisma
enum Role {
  ADMIN
  MANAGER
  SENIOR_STAFF
  STAFF
  INSURANCE   // ฝ่ายประกัน — เห็นเฉพาะเมนูต่ออายุรถ
}

enum VehicleStatus {
  ACTIVE      // ใช้งาน
  SUSPENDED   // งดใช้ (แจ้ง ม.89)
  SOLD        // ขาย / เลิกใช้ (แจ้ง ม.79)
}

enum CoverageType {
  PRB              // พรบ.
  TAX              // ภาษี
  MOTOR_INSURANCE  // ประกันรถยนต์
  CARGO_INSURANCE  // ประกันสินค้า (ความรับผิดผู้ขนส่ง)
}

enum RenewalStatus {
  PENDING
  IN_PROGRESS
  RENEWED
  NOT_RENEWED
}

enum NotRenewedReason {
  SOLD       // ขายรถ
  SUSPENDED  // งดใช้
  ACCIDENT   // รถเกิดอุบัติเหตุ
  REPAIR     // รถซ่อม
  OTHER      // อื่นๆ (ต้องมี renewalNote)
}

model Vehicle {
  id            String        @id @default(cuid())
  plate         String        @unique   // normalize แล้ว (ดู normalizePlate)
  fleetNumber   String?                 // เบอร์รถ — free text ไม่ unique ("31 - S.", "พ่วงลูก 54", หัวกับหางใช้เลขซ้ำกันได้)
  ownerName     String                  // "แวลู ทรานสปอร์ต" / "ทรงยุทธ โลจิสติคส์" / ชื่อบุคคล
  vehicleType   String                  // ลากจูง, หาง, รถพ่วง, ลากจูง(6ล้อ), ...
  brand         String?
  chassisNumber String?                 // เลขตัวถัง (= "หมายเลขเครื่อง" ในชีตประกัน)
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
  insurerId         String?                       // พรบ./ประกัน; ภาษีไม่มี
  insurer           Insurer?          @relation(fields: [insurerId], references: [id])
  coverageClass     String?                       // ป.1 / ป.2+ / ป.3 / ป.3+ (ประกันรถยนต์)
  policyNumber      String?
  startDate         DateTime?         @db.Date
  endDate           DateTime          @db.Date    // วันสุดท้ายที่คุ้มครอง (inclusive)
  amount            Decimal?          @db.Decimal(10, 2)  // เบี้ย หรือ ค่าภาษี
  serviceFee        Decimal?          @db.Decimal(10, 2)  // ค่าบริการตัวแทน
  pairedVehicleId   String?                       // หางคู่ (ประกันรถยนต์ "คู่กับ")
  pairedVehicle     Vehicle?          @relation("CoveragePairedVehicle", fields: [pairedVehicleId], references: [id])

  renewalStatus     RenewalStatus     @default(PENDING)
  notRenewedReason  NotRenewedReason?
  renewalNote       String?                       // "ส่งเล่มให้คุณบุญชัย 23/6", "กาญ ต่อ"
  renewedToId       String?           @unique     // งวดใหม่เมื่อ RENEWED
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
  fileKey      String          // key ใน storage
  fileName     String          // ชื่อไฟล์เดิม
  contentType  String
  sizeBytes    Int
  uploadedById String
  uploadedBy   AuthUser        @relation("AttachmentUploadedBy", fields: [uploadedById], references: [id])
  createdAt    DateTime        @default(now())

  @@index([coverageId])
  @@map("coverage_attachments")
}
```

`AuthUser` เพิ่ม relation ฝั่งกลับ 3 ตัว (`coveragesCreated`, `coverageStatusUpdates`, `coverageAttachments`)

### กติกาข้อมูล

- **`normalizePlate`** (`lib/renewals/plate.ts`): trim, ยุบช่องว่างซ้อนเหลือช่องเดียว, ตัด "." ท้ายตัวย่อจังหวัด
  (`"64-5598 กท."` → `"64-5598 กท"`, `"64-0329  กท"` → `"64-0329 กท"`) — ใช้ทุกจุดที่รับทะเบียน (form, import, ค้นหา)
- **รถไม่มี soft delete แยก** — `status` ทำหน้าที่แทน; ลบรถได้เฉพาะเมื่อไม่มีงวด (ทั้งที่เป็นเจ้าของและที่เป็นหางคู่) มิฉะนั้น 409
- **เปลี่ยนสถานะรถเป็น SOLD** → ใน transaction เดียวกัน ปิดทุกงวดที่เปิดอยู่ของรถคันนั้นเป็น `NOT_RENEWED` / `SOLD`
  กติกาเต็ม: **รถสถานะ SOLD ไม่มีงวดเปิดเลย** — ทุกจุดที่แก้งวด/รถ (เพิ่ม/แก้/ลบงวด, แก้รถ, import) เรียก `enforceCoverageRules` ตัวเดียว
  (เพิ่มงวดให้รถที่ขายแล้ว → ปิดทันที; เปิดใหม่งวดของรถที่ขายแล้ว → 409)
  เปลี่ยนเป็น `SUSPENDED` → ไม่แตะงวด (บางคันงดใช้แต่ยังต่อประกัน) แค่แสดงป้าย "งดใช้" บน dashboard
  เปลี่ยนกลับเป็น `ACTIVE` → ไม่เปิดงวดคืนอัตโนมัติ
- **แก้งวด (PATCH)**: `endDate` ใหม่ต้อง **หลัง** `endDate` ของงวดก่อนหน้าที่ผูกอยู่ (แถวที่ `renewedToId` ชี้มางวดนี้) และ **ก่อน** `endDate` ของงวดถัดไปที่ผูกอยู่ (`renewedToId` ของงวดนี้)
  มิฉะนั้น 400 "วันสิ้นสุดต้องหลังวันสิ้นสุดของงวดก่อนหน้า" / "วันสิ้นสุดต้องก่อนวันสิ้นสุดของงวดถัดไป" — กันการข้ามงวดที่ผูกกันจนเกิดวงวน `renewedTo`; แก้ในช่วงที่ถูกต้องไม่เปลี่ยนสถานะ/การผูกเดิม
- **Insurer** ลบแบบ soft (`isActive=false`) — ซ่อนจากตัวเลือก แต่งวดเดิมยังอ้างถึงได้
- **งวด** ลบแบบ hard (ใช้แก้กรณีบันทึกผิด) — attachments ลบตาม cascade
- **เพิ่ม/แก้งวดเองจากหน้ารถ** ใช้กติกา "รถ 1 คัน 1 ประเภท มีงวดเปิดได้เฉพาะงวดที่ `endDate` มากที่สุด" เดียวกับ import (ดูหัวข้อ Upload Excel) — logic เดียวกัน (`planAutoClose`)
- ประเภทที่ไม่ใช่ประกันรถยนต์ → server ล้าง `coverageClass` / `pairedVehicleId` เป็น null; ภาษี → ล้าง `insurerId` ด้วย

## สถานะการต่อ (State Transitions)

| Action | จาก | ไป | ผล |
|---|---|---|---|
| เริ่มดำเนินการ | PENDING | IN_PROGRESS | |
| ย้อนกลับ | IN_PROGRESS | PENDING | |
| **ต่อแล้ว** | PENDING / IN_PROGRESS | RENEWED | สร้างงวดใหม่ (PENDING) + ตั้ง `renewedToId` — transaction เดียว |
| **ไม่ต่อ** | PENDING / IN_PROGRESS | NOT_RENEWED | ต้องมี `notRenewedReason`; OTHER ต้องมี `renewalNote` |
| เปิดใหม่ | NOT_RENEWED | PENDING | ล้าง reason (เช่น รถซ่อมเสร็จกลับมาใช้) — 409 ถ้างวดไม่ใช่ไม่ต่อ ("เปิดใหม่ได้เฉพาะงวดที่ไม่ต่อ"), รถขายแล้ว ("รถคันนี้ขายแล้ว เปิดงวดใหม่ไม่ได้") หรือมีงวดประเภทเดียวกันที่หมดช้ากว่าแล้ว ("เปิดใหม่ไม่ได้ เพราะมีงวดที่หมดช้ากว่าแล้ว") |
| ลบงวดใหม่ | (งวดที่ถูกชี้โดย `renewedToId`) | — | งวดก่อนหน้ากลับเป็น PENDING + ล้าง `renewedToId` — transaction เดียว |

ทุก transition อัปเดต `statusUpdatedAt` / `statusUpdatedById`

**กันการกดซ้ำ/พร้อมกัน**: action ที่ต้องการสถานะต้นทาง "เปิด" ใช้ `updateMany({ where: { id: { in: ids }, renewalStatus: { in: [PENDING, IN_PROGRESS] } } })`
ภายใน transaction ถ้า `count` ไม่เท่าจำนวน id → rollback และตอบ **409 "งวดนี้ถูกปิดไปแล้ว"** (bulk: แจ้งรายการที่ชน — ทั้งชุดไม่สำเร็จ)

### ค่า default ของงวดใหม่ (ต่อแล้ว)

- คัดลอกจากงวดเดิม: `insurerId`, `coverageClass`, `amount`, `serviceFee`, `pairedVehicleId`
- `startDate` = `endDate` เดิม + 1 วัน; `endDate` = `endDate` เดิม + 1 ปี (29 ก.พ. → 28 ก.พ.)
- `policyNumber`, `renewalNote` ว่าง
- validate: `endDate` ใหม่ต้อง > `endDate` เดิม และ ≥ `startDate` ใหม่ → ไม่ผ่าน 400 ("วันสิ้นสุดใหม่ต้องหลังวันสิ้นสุดของงวดเดิม" / "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม")
- ภาษีล้าง `insurerId`; ประเภทที่ไม่ใช่ประกันรถยนต์ล้าง `coverageClass` / `pairedVehicleId` (กฎเดียวกับการเพิ่ม/แก้งวดเอง)

## Dashboard & Buckets

ฟังก์ชัน pure ใน `lib/renewals/dueWindow.ts` (รับ `today` เป็น `YYYY-MM-DD` ตาม Asia/Bangkok — route คำนวณ today จากเวลาปัจจุบันแล้วส่งเข้า):

- `endOfNextMonth(today)` — เช่น `2026-10-06` → `2026-11-30`, `2026-12-15` → `2027-01-31`
- `dueBucket(endDate, today)`:
  - `OVERDUE` — `endDate < today` (แดง)
  - `THIS_MONTH` — `today ≤ endDate ≤ สิ้นเดือนนี้` (ส้ม)
  - `NEXT_MONTH` — `สิ้นเดือนนี้ < endDate ≤ สิ้นเดือนหน้า` (น้ำเงิน)
  - `LATER` — `endDate > สิ้นเดือนหน้า` (ไม่ขึ้น dashboard — มีไว้ให้ type ครบเท่านั้น)

เปรียบเทียบแบบ date-only (`@db.Date`) — ไม่ใช้ timestamp

## หน้าจอ

เมนูใหม่ **"ต่ออายุรถ"** (prefix `/renewals`):

| Path | หน้าที่ |
|---|---|
| `/renewals` | Dashboard (เมนู "ภาพรวม") |
| `/renewals/vehicles` | ทะเบียนรถ — ค้นหา/กรอง, เพิ่ม/แก้ไข/เปลี่ยนสถานะ, คอลัมน์วันหมดล่าสุดของ 4 ประเภท |
| `/renewals/vehicles/[id]` | รายละเอียดรถ + ประวัติงวดแยกตามประเภท, เพิ่ม/แก้/ลบงวด, เปิดใหม่, ไฟล์แนบ |
| `/renewals/insurers` | รายชื่อบริษัทประกัน (เพิ่ม/แก้ชื่อ/ปิดใช้งาน) — เมนู "บริษัทประกัน" |
| `/renewals/import` | Upload Excel — เมนู "นำเข้า Excel" |

### Dashboard (`/renewals`)

```
[เลยกำหนด 3] [หมดเดือนนี้ 12] [หมดเดือนหน้า 85] [กำลังดำเนินการ 20]
แท็บ: ทั้งหมด | พรบ. | ภาษี | ประกันรถยนต์ | ประกันสินค้า   (badge จำนวน)
ตัวกรอง: บริษัท ▾  สถานะ ▾  ค้นหาทะเบียน/เบอร์รถ
☐ เบอร์รถ ทะเบียน ลักษณะ บริษัท ประเภท บ.ประกัน เลขกรมธรรม์ วันหมด สถานะ หมายเหตุ [ต่อแล้ว][ไม่ต่อ]
───── รวมเบี้ย/ภาษี: xxx   ค่าบริการ: xxx  (ของแถวตามตัวกรองปัจจุบัน) ─────
```

- เรียงตาม `endDate` ก่อน แล้วตาม `fleetNumber`
- วันหมดเป็น Tag สีตาม bucket; รถ SUSPENDED มีป้าย "งดใช้"; คลิกทะเบียน → `/renewals/vehicles/[id]`
- **ต่อแล้ว (ทีละคัน)**: modal เติม default ตามหัวข้อด้านบน แก้ได้ทุกช่อง + แนบไฟล์ได้ (ไม่บังคับ — ผูกกับงวดใหม่)
- **ไม่ต่อ**: modal เลือกเหตุผล + หมายเหตุ
- **แก้หมายเหตุ / สลับ รอต่อ ↔ กำลังดำเนินการ** ทำได้จากแถว
- **Bulk** (เลือกหลายแถว):
  - "กำลังดำเนินการ" / "ไม่ต่อ" — ข้ามประเภทได้
  - "ต่อแล้ว" — ต้องเป็นประเภทเดียวกันทั้งหมด (ปุ่ม disabled ถ้าปน); กรอก บริษัทประกัน (ไม่บังคับ — ว่าง = คงของแต่ละคัน), วันเริ่ม, วันหมด ชุดเดียว; เบี้ย/ค่าบริการคัดลอกรายคันจากงวดเดิม; ไม่มีช่องแนบไฟล์
  - จำกัด 500 แถวต่อครั้ง
  - ยืนยันด้วย `modal.confirm`
- ใช้ `<Table size="small">` (แบ่งหน้า 50 แถว), `App.useApp().message/modal`, แสดงวันที่ พ.ศ. ผ่าน `lib/utils/thaiDate.ts`; DatePicker ใช้ `DD/MM/YYYY` (ค.ศ.)
- **Modal ที่มี Form** (ต่อแล้ว, ต่อแล้วหลายรายการ, ไม่ต่อ, หมายเหตุ, ฟอร์มรถ/งวด): mount เมื่อเปิดเท่านั้น และตั้ง `preserve={false}` + `clearOnDestroy` + `destroyOnHidden` — กันค่าของรายการก่อนหน้าค้างตอนเปิดซ้ำ (rc-field-form เอา store เดิมทับ `initialValues` ตอน remount); `validateFields()` ที่ไม่ผ่านถูกจับแล้ว return เงียบๆ (ไม่ throw)
- ต่อแล้ว (ทีละคัน): ถ้าบันทึกงวดสำเร็จแต่แนบไฟล์ไม่สำเร็จ → `message.warning` ("ต่ออายุสำเร็จ แต่แนบไฟล์ไม่สำเร็จ (แนบใหม่ที่หน้ารถ)") ไม่ rollback การต่ออายุ
- ปุ่ม/ช่องสำคัญมี `data-testid` ตามแนวทางใน `CLAUDE.md` เช่น `renew-btn-<id>`, `not-renew-btn-<id>`, `bulk-renew-btn`, `count-<key>`, `dashboard-totals`, `import-preview-btn`, `import-commit-btn`, `attachment-upload-btn`; Select/DatePicker/InputNumber/AutoComplete ใช้ `id` (เช่น `dashboard-owner-filter`, `coverage-end-date`, `vehicle-owner`)

### ฟอร์มรถ / งวด

- บริษัทเจ้าของ: `AutoComplete` จากค่า `ownerName` ที่มีอยู่ (พิมพ์ใหม่ได้)
- ลักษณะรถ: `AutoComplete` จากค่าที่มีอยู่
- งวด: ช่อง "ชั้น" และ "หางคู่" แสดงเฉพาะประกันรถยนต์; ช่อง "บริษัทประกัน" ซ่อนสำหรับภาษี

## สิทธิ์

| Role | การเข้าถึง |
|---|---|
| `INSURANCE` | เฉพาะ `/renewals/**` และ `/api/renewals/**`; path หน้าอื่น redirect ไป `/renewals` (รวม `/` หลัง login); API อื่น 403 |
| `MANAGER`, `ADMIN` | เมนูเดิม + `/renewals/**` |
| `SENIOR_STAFF`, `STAFF` | เข้า `/renewals/**` ไม่ได้ → redirect (`STAFF` → `/line-images`, อื่นๆ → `/jobs`); `/api/renewals/**` → 403 |

> **พบระหว่างเขียนแผน**: `authorized()` ใน `lib/auth.ts` **ไม่ถูกเรียกใช้จริง** — `middleware.ts` เป็น middleware เขียนเองที่เช็กแค่ว่ามี session cookie
> (การจำกัด path ของ STAFF/SENIOR_STAFF ใน `authorized()` จึงไม่มีผล) — การบังคับสิทธิ์ของฟีเจอร์นี้จึงทำใน `middleware.ts` แทน
> และไม่แตะ `authorized()` (เปิดใช้ทั้งก้อนจะเปลี่ยนพฤติกรรม role เดิมทั้งหมด — นอกขอบเขต)

ไฟล์ที่แก้:

- `lib/renewals/routeAccess.ts` (ใหม่, pure) — `renewalRouteDecision(role, pathname)` คืน allow / redirect / forbidden ตามตารางด้านบน
- `lib/renewals/sessionRole.ts` — `readSessionRole(req, cookieNames, secret)` ถอด JWT ด้วย `getToken` (`next-auth/jwt`, รันบน edge ได้)
  - ถอด **ทุก** session cookie ที่ client ส่งมา (`authjs.session-token`, `__Secure-authjs.session-token`) โดยแต่ละตัวใช้ชื่อ cookie นั้นเป็น salt — ไม่ให้ client เลือกชื่อ cookie เองเพื่อเลี่ยงการถูกจำกัดสิทธิ์
  - ได้หลาย role → **INSURANCE ชนะ** (เข้มสุด) ไม่งั้นใช้ตัวแรก
  - มี cookie แต่ถอดไม่ได้เลย → `console.warn` แล้วคืน `undefined` (fail-open: ปล่อยผ่านให้ page/route เช็กเอง — พฤติกรรมเดิม)
- `middleware.ts` — หลังเช็ก cookie แล้วเรียก `readSessionRole` ด้วย secret = `NEXTAUTH_SECRET || AUTH_SECRET` (ใช้ `||` ไม่ใช่ `??` เพราะค่าว่าง `''` ต้องตกไปใช้ตัวถัดไป) แล้วส่ง role ให้ `renewalRouteDecision`
  - forbidden → `403 { error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }`; redirect → `NextResponse.redirect`
  - ถอด token ไม่ได้ → ทำงานแบบเดิม (ปล่อยผ่าน) — **ต้องมี `NEXTAUTH_SECRET` หรือ `AUTH_SECRET` ตอน runtime บน production** ไม่งั้น INSURANCE จะไม่ถูกจำกัดที่ middleware (ยังมี guard ใน layout และ `requireRenewalAccess` ใต้ `/api/renewals`)
- `next.config.js` — `experimental.middlewareClientMaxBodySize: '12mb'` (middleware buffer body ของ request; ค่าเริ่มต้น 10 MB ไม่พอสำหรับไฟล์แนบ 10 MB + multipart overhead)
- `app/(protected)/renewals/layout.tsx` — server guard ซ้ำอีกชั้น: role ไม่อยู่ใน `RENEWAL_ROLES` → `redirect('/jobs')`
- `app/(protected)/layout.tsx` + `components/ProtectedLayoutClient.tsx` — เมนู "ต่ออายุรถ" (dashboard, ทะเบียนรถ, บริษัทประกัน, นำเข้า Excel) สำหรับ ADMIN/MANAGER/INSURANCE; INSURANCE เห็นเมนูนี้อย่างเดียว; label role "ฝ่ายประกัน"
- `app/(protected)/admin/users/page.tsx`, `app/api/users/route.ts`, `app/api/users/[id]/route.ts` — เพิ่มตัวเลือก `INSURANCE` ("ฝ่ายประกัน")
- `lib/renewals/access.ts` — `requireRenewalAccess()` คืน 401 (`{ error: "Unauthorized" }` — ข้อความอังกฤษเหมือน route เดิมของระบบ) / 403 (`ไม่มีสิทธิ์เข้าถึงข้อมูลนี้`) response หรือ user; **ทุก** route ใต้ `/api/renewals/**` เรียกตัวนี้ (`RENEWAL_ROLES = ['ADMIN', 'MANAGER', 'INSURANCE']` อยู่ใน `lib/renewals/constants.ts` ซึ่ง edge-safe)

> **ข้อจำกัดเดิม (ไม่แก้ในรอบนี้)**: API และหน้าเดิม (เช่น `/jobs`, `/api/jobs`) ไม่เช็ก role สำหรับ STAFF/SENIOR_STAFF — คงเดิม
> (role `INSURANCE` ใหม่ถูกกันด้วย middleware แล้ว)

## API

ทุก route: `requireRenewalAccess()`, validate ด้วย zod, error ภาษาไทย (ยกเว้น 401 "Unauthorized" ดูด้านบน)

- body JSON อ่านผ่าน `parseJsonBody` (`lib/renewals/http.ts`): JSON เสีย → 400 "รูปแบบข้อมูลไม่ถูกต้อง"; ไม่ผ่าน schema → 400 ด้วยข้อความของ issue แรก — issue ที่เป็น code ในตัวของ zod (`invalid_type`, `invalid_enum_value`, …) แปลงเป็นไทย: ช่องที่ขาด → "กรุณากรอก <field>", อื่นๆ → "ข้อมูลไม่ถูกต้อง: <field>" (ไม่ใช้ global errorMap)
- error ที่ตั้งใจให้ผู้ใช้เห็นใช้ `RenewalError` (400/404/409) → `renewalErrorResponse`; error อื่น → log แล้วตอบ 500 "เกิดข้อผิดพลาด"
- ข้อความ 409 ที่ใช้บ่อย: "งวดนี้ถูกปิดไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง", "มีงวดประเภทนี้ที่หมดวันเดียวกันอยู่แล้ว", "ทะเบียนนี้มีอยู่แล้ว", "มีบริษัทประกันชื่อนี้อยู่แล้ว", "ลบไม่ได้ เพราะรถคันนี้มีงวดอยู่ — เปลี่ยนสถานะรถแทน"; bulk ที่ชน → "งวดถูกปิดไปแล้ว: <ทะเบียน, ...>"

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/renewals/dashboard` | `{ today, items }` — ทุกงวดเปิดที่ `endDate ≤ สิ้นเดือนหน้า` พร้อม bucket; ตัวกรอง/แท็บ/counts/ยอดรวมคำนวณฝั่ง client ด้วย pure function (ข้อมูลหลักร้อยแถว) |
| POST | `/api/renewals/coverages/[id]/renew` | ต่อแล้ว (ทีละคัน) — body = งวดใหม่ |
| POST | `/api/renewals/coverages/bulk-renew` | `{ ids, insurerId?, startDate?, endDate }` — ทุกคันต้องประเภทเดียวกัน (ไม่งั้น 400); `policyNumber` / `renewalNote` ของงวดใหม่ว่าง; `timeout: 30000` |
| POST | `/api/renewals/coverages/bulk-status` | `{ ids, status: PENDING\|IN_PROGRESS\|NOT_RENEWED, reason?, note? }` |
| POST | `/api/renewals/coverages/[id]/reopen` | NOT_RENEWED → PENDING |
| POST | `/api/renewals/coverages` | เพิ่มงวดเอง (จากหน้ารถ) |
| PATCH / DELETE | `/api/renewals/coverages/[id]` | แก้ข้อมูลงวด (ไม่รวมสถานะ; มีกติกา `endDate` เทียบงวดที่ผูกกัน — ดูกติกาข้อมูล) / ลบ |
| GET / POST | `/api/renewals/vehicles` | รายการ (พร้อมวันหมดล่าสุดต่อประเภท) / เพิ่ม |
| GET / PATCH / DELETE | `/api/renewals/vehicles/[id]` | รายละเอียด + ประวัติงวด (พร้อมจำนวนไฟล์แนบ) / แก้ (รวมสถานะรถ) / ลบ |
| GET / POST | `/api/renewals/insurers` | รายการ / เพิ่ม (รับ `names[]` สำหรับปุ่มเพิ่มหลายรายจากหน้า import) |
| PATCH | `/api/renewals/insurers/[id]` | แก้ชื่อ / isActive |
| GET | `/api/renewals/import/template` | ดาวน์โหลด template (`renewals_template.xlsx`) |
| POST | `/api/renewals/import` | multipart `file` + `mode=preview\|commit` — preview ตอบ 200; commit สำเร็จตอบ 201 `{ success, summary }`; commit ที่ไฟล์ยังมี error ตอบ 400 พร้อมผล preview (ไม่บันทึกอะไร) |
| GET / POST | `/api/renewals/coverages/[id]/attachments` | รายการไฟล์ของงวด / multipart field `files` (≤ 10 ไฟล์ต่อ request; UI ส่งทีละไฟล์ — ตอบ 201) |
| GET / DELETE | `/api/renewals/attachments/[id]` | stream ไฟล์ (inline) / ลบ |

Status codes: 400 ข้อมูลไม่ถูกต้อง, 401 ไม่ได้ login, 403 role ไม่มีสิทธิ์, 404 ไม่พบ, 409 ชน (งวดถูกปิดแล้ว, ทะเบียนซ้ำ, งวดซ้ำ `vehicleId+type+endDate`, ลบรถที่มีงวด)

## Upload Excel

### Template (`exceljs`)

Workbook เดียว: ชีตข้อมูล 2 ชีต (แถวแรกเป็น header, ข้อมูลเริ่มแถว 2 — ไม่มีแถวตัวอย่างในชีตข้อมูล) + ชีต "วิธีกรอก" อธิบายแต่ละคอลัมน์และรูปแบบวันที่ (ระบบไม่อ่านชีตนี้):

**ชีต "รถ"**: ทะเบียน* · จังหวัด (ทะเบียนรถ) · วันที่จดทะเบียน · เบอร์รถ · บริษัท* · ลักษณะ* · ยี่ห้อ · แบบ/รุ่น · สีรถ · เลขตัวรถ (คัสซี) · ตำแหน่งคัสซี · เลขเครื่องยนต์ · จำนวนสูบ · แรงม้า · จำนวนเพลา · เชื้อเพลิง · น้ำหนักตัวรถ (กก.) · สถานะ (ใช้งาน/งดใช้/ขาย) · วันที่แจ้งสถานะ · หมายเหตุ

หัวคอลัมน์ชื่อเดิม `เลขตัวถัง` / `น้ำหนัก(กก.)` / `วันที่สถานะ` ยังรับเป็น alias; คอลัมน์ข้อมูลเล่มทะเบียน (จังหวัด, วันที่จดทะเบียน, แบบ/รุ่น, สีรถ, ตำแหน่งคัสซี, เลขเครื่องยนต์, จำนวนสูบ, แรงม้า, จำนวนเพลา) ไม่บังคับมีในไฟล์ — ไฟล์ template เดิมนำเข้าได้เหมือนเดิม; จังหวัดต้องเป็นชื่อเต็มตาม `THAI_PROVINCES` (ไม่สนช่องว่าง, ตัด จ./จังหวัด นำหน้า, กรุงเทพฯ/กทม. → กรุงเทพมหานคร); สูบ/แรงม้า/เพลา จำนวนเต็มไม่เกิน 100 / 10,000 / 20

**ชีต "งวด"**: ทะเบียน* · ประเภท* (พรบ./ภาษี/ประกันรถยนต์/ประกันสินค้า) · บริษัทประกัน · ชั้น · เลขกรมธรรม์ · วันเริ่ม · วันสิ้นสุด* · เบี้ย/ภาษี · ค่าบริการ · ทะเบียนหางคู่ · สถานะการต่อ (รอต่อ/กำลังดำเนินการ/ไม่ต่อ) · เหตุผลไม่ต่อ · หมายเหตุ

- ประเภท / สถานะ / สถานะการต่อ / เหตุผลไม่ต่อ มี data validation dropdown
- **คอลัมน์วันที่** (วันที่สถานะ, วันเริ่ม, วันสิ้นสุด) ตั้ง format เป็นข้อความ (`@`) ทั้ง 1,000 แถว กัน Excel แปลง `31/03/2570` / `31/03/70` เป็นวันที่เอง; dropdown และ format ใส่ไว้ 1,000 แถว
- **วันที่**: date cell ของ Excel, ข้อความ `dd/mm/yyyy` (คั่น `/` หรือ `-`) หรือ `YYYY-MM-DD`
  - ปี > 2400 = พ.ศ. (ลบ 543) — ใช้กับ **ทุกรูปแบบ** (รวม date cell และ ISO text ที่ปีเป็น พ.ศ.)
  - ปีที่ได้หลังแปลงต้องอยู่ใน **2000–2200** ไม่งั้น error "ปีไม่สมเหตุผล" พร้อมคำแนะนำเรื่องปี 2 หลัก (Excel มักแปลง `31/03/70` เป็น 1970 — ระบบไม่เดาศตวรรษ); ปี 2 หลักในข้อความ → error "ไม่ถูกต้อง"
- **เงิน / น้ำหนัก**: ตัวเลข หรือข้อความที่มีคอมมาได้ (`13,449.50`); เงินไม่ติดลบและไม่เกิน `99,999,999.99`; น้ำหนักเป็นจำนวนเต็ม 0–100,000
- ข้อความตัวเลือก (ประเภท, สถานะ, เหตุผล) เทียบโดยไม่สนจุดและช่องว่าง ("พรบ" = "พรบ.")
- **แถวว่าง**: แถวที่ทุกช่องว่าง (เหลือแค่ format / dropdown / สี) ถูกข้าม ไม่ถูกฟ้อง "ช่องบังคับว่าง"; ชีตข้อมูลต้องมีหัวคอลัมน์ครบ ยกเว้นคอลัมน์ข้อมูลเล่มทะเบียนของชีตรถ (จับคู่ด้วยชื่อหัว ไม่สนช่องว่าง สลับลำดับได้) ไม่งั้น error "ชีต ... ไม่มีคอลัมน์: ..."

- สถานะการต่อ "ต่อแล้ว" ไม่รับใน import (RENEWED เกิดจากการผูกงวดเท่านั้น)

### Flow

1. ผู้ใช้เลือกไฟล์ (≤ 5 MB) → `mode=preview` → server parse + validate → ตอบ
   `{ valid, errors: [{ sheet, row, field, message }], summary: { vehiclesCreated, vehiclesUpdated, coveragesCreated, coveragesUpdated, coveragesAutoClosed }, unknownInsurers: string[] }`
2. ถ้ามี `unknownInsurers` → ปุ่ม **"เพิ่มบริษัทประกันที่ยังไม่มี (N ราย)"** (confirm) → POST insurers → preview ใหม่
3. ไม่มี error → ปุ่มยืนยัน → `mode=commit` (upload ไฟล์เดิมซ้ำ) → บันทึกทั้งไฟล์ใน transaction เดียว (`timeout: 60000`; โหลดข้อมูลเดิมครั้งเดียวก่อนเข้า transaction ตาม pattern `fuel-standard/import`)

### กติกา upsert

- **รถ**: key = `normalizePlate(ทะเบียน)`; มีอยู่ → อัปเดตเฉพาะช่องที่ไม่ว่าง (ช่องว่าง = คงค่าเดิม); สถานะ "ขาย" → ปิดงวดเปิดของคันนั้น (กติกาเดียวกับหน้าจอ)
- **งวด**: key = `(ทะเบียน, ประเภท, วันสิ้นสุด)`; มีอยู่ → อัปเดตช่องที่ไม่ว่าง; ไม่มี → สร้าง (สถานะว่าง = รอต่อ)
- ทะเบียนในชีตงวด / ทะเบียนหางคู่ ต้องมีในระบบหรือในชีต "รถ" ของไฟล์เดียวกัน
- บริษัทประกันต้องตรงกับชื่อใน `insurers` (หลัง trim) — ไม่ตรง = error + อยู่ใน `unknownInsurers` (ไม่สร้างเงียบๆ กันชื่อพิมพ์ผิดกลายเป็นบริษัทซ้ำ); บริษัทที่ปิดใช้งาน (`isActive=false`) = error "ถูกปิดใช้งาน" (ไม่อยู่ใน `unknownInsurers`)
- key ซ้ำในไฟล์เดียวกัน = error ทุกแถวที่ซ้ำ
- ภาษีที่กรอกบริษัทประกัน / ประเภทที่ไม่ใช่ประกันรถยนต์แต่กรอกชั้นหรือหางคู่ = error (ในไฟล์ถือว่าผู้ใช้ตั้งใจกรอก จึงแจ้งแทนการล้างทิ้งเงียบๆ)
- รถใหม่ต้องมี บริษัท + ลักษณะ; รถที่มีอยู่แล้วเว้นว่างได้ (คงค่าเดิม)
- "ไม่ต่อ" ต้องมีเหตุผล; เหตุผล "อื่นๆ" ต้องมีหมายเหตุ; กรอกเหตุผลโดยสถานะไม่ใช่ "ไม่ต่อ" = error
- งวดที่มีอยู่แล้วและ **ปิดแล้ว** (ต่อแล้ว/ไม่ต่อ) แต่ไฟล์ระบุสถานะการต่อที่ต่างจากของเดิม = error "งวดนี้ปิดแล้ว — เปลี่ยนสถานะผ่านหน้าจอ"; กรอกสถานะ "ต่อแล้ว" = error "ไม่รับสถานะ \"ต่อแล้ว\" ..."
- วันเริ่มต้องไม่หลังวันสิ้นสุด; หางคู่ต้องคนละคันกับรถของงวด
- error ทุกรายการระบุ ชีต / แถว (เลขแถว Excel) / คอลัมน์ / ข้อความ เรียงชีต "รถ" ก่อน แล้วตามเลขแถว
- **ปิดงวดเก่าอัตโนมัติ**: หลังรวมข้อมูลไฟล์กับของเดิม รถ 1 คัน 1 ประเภท ให้มีงวดเปิดได้เฉพาะงวดที่ `endDate` มากที่สุด
  งวดเปิดที่เก่ากว่า → `RENEWED` + `renewedToId` = งวดถัดไปตาม `endDate` (ถ้างวดถัดไปยังไม่มีงวดก่อนหน้าชี้อยู่ มิฉะนั้นปิดโดยไม่ผูก)
  งวดที่ปิดแล้ว (RENEWED/NOT_RENEWED) ไม่แตะ
- **รถที่ตั้งเป็น "ขาย" ในไฟล์** → งวดเปิดของรถนั้น (ทั้งที่มีอยู่แล้วและที่มาในไฟล์เดียวกัน) ถูกปิดเป็น ไม่ต่อ/ขายรถ ไม่ค้างบน dashboard; ตัวเลข `coveragesAutoClosed` ใน preview จำลองผลนี้ให้ตรงกับ commit
- apply เรียก `enforceCoverageRules` กับรถทุกคันที่ไฟล์แตะ (กติกาเดียวกับหน้าจอ); `ownerName` / `vehicleType` ของรถใหม่ validate แล้วว่าไม่ว่างก่อนถึงขั้นนี้

Logic แยกเป็นโมดูลใน `lib/renewals/import/`: `columns.ts` (หัวคอลัมน์/ข้อความวิธีกรอก), `cells.ts` (parse วันที่/เงิน/ตัวเลือก), `validate.ts` (`validateRenewalImport` — pure: รับ rows + snapshot ข้อมูลเดิม คืน errors + plan + summary), `workbook.ts` (สร้าง template / อ่านไฟล์ด้วย exceljs), `apply.ts` (`loadImportSnapshot`, `applyRenewalImport`) — route ทำแค่อ่านไฟล์ โหลดข้อมูลเดิม แล้ว validate / apply plan; commit ตรวจซ้ำกับข้อมูลล่าสุดก่อนบันทึกเสมอ
ข้อจำกัด: ไฟล์ต้องเป็น `.xlsx` ขนาด ≤ 5 MB ("ไฟล์ต้องไม่เกิน 5 MB"), ต้องมีชีต "รถ" และ "งวด"

### แปลงไฟล์ปี 69 (one-off — ไม่ commit)

script ใน scratchpad อ่าน `พรบ. +ประกัน+สินค้า ทั้งปี 69.xlsx` แล้วเขียนไฟล์ตาม template + รายงานแถวที่แปลงไม่ได้ ให้เจ้าหน้าที่ตรวจก่อน upload:

- **รถ + พรบ.** จากชีต `พรบ.3/6/9/12` — บริษัทจากหัวตาราง "ในนาม ..." (→ "แวลู ทรานสปอร์ต" / "ทรงยุทธ โลจิสติคส์"); วันสิ้นสุด `31-03-70` = พ.ศ. 2570
- **น้ำหนัก / เชื้อเพลิง** จากชีต `ภาษี 6-69`
- **ภาษี**: สร้างงวดเฉพาะคันในชีต `ภาษี 6-69` พร้อมอัตราภาษี + ค่าบริการ — **วันสิ้นสุดเว้นว่าง ไฮไลต์เหลือง** ให้เจ้าหน้าที่กรอก (ไม่กรอก = import ไม่ผ่านเพราะช่องบังคับ); ภาษีคันอื่นเจ้าหน้าที่เพิ่มเอง
- **ประกันรถยนต์ / ประกันสินค้า** จากชีตรายเดือน 1–12 — แยกชั้น (ป.1/ป.3/ป.3+) ออกจากชื่อ, ปรับชื่อบริษัทเป็นชื่อมาตรฐาน, "คู่กับ" → ทะเบียนหางคู่
- **รถชื่อบุคคล** → `ownerName` = ชื่อบุคคล
- **หมายเหตุ**: "ม.79" → สถานะรถ ขาย (+วันที่), "ม.89" → งดใช้ (+วันที่), เบี้ย "ไม่ต่อ"/"ไม่ใช้รถ" → สถานะการต่อ ไม่ต่อ, ข้อความอื่น (เช่น "กาญ ต่อ") → หมายเหตุ
- ไม่นำเข้า `คลุมราคา+ได้จริง` และ `Sheet2`

## ไฟล์แนบ

- **Storage interface** `lib/renewals/storage.ts` (`getAttachmentStorage()`): `put(key, body, contentType)`, `get(key)` (คืน bytes หรือ `null` ถ้าไม่มี), `remove(key)`; local storage กัน path traversal (key ต้องอยู่ใต้ root)
  - S3 (Spaces) — default; ใช้ `spacesClient` / `SPACES_BUCKET` จาก `lib/spaces.ts`; **ไม่ใส่ ACL** (private) ต่างจาก LINE images ที่ `public-read`
  - Local folder — เมื่อ `ATTACHMENT_STORAGE=local` เขียนที่ `.tmp/renewal-attachments/` (gitignore) ใช้ใน E2E ไม่ให้เทสต์เขียนลง bucket จริง (`.env.test` ชี้ Spaces จริง)
- Key: `vehicle-coverages/YYYY-MM/<uuid>.<ext>` (YYYY-MM ตามเวลา Asia/Bangkok)
- รับ **PDF / JPG / PNG ≤ 10 MB ต่อไฟล์** — ตรวจทั้ง MIME และนามสกุล (`lib/renewals/attachmentRules.ts` pure); error ขึ้นต้นด้วยชื่อไฟล์ ("<ชื่อ>: รองรับเฉพาะไฟล์ PDF, JPG, PNG" / "ชนิดไฟล์ไม่ตรงกับนามสกุล" / "ไฟล์ว่าง" / "ไฟล์ต้องไม่เกิน 10 MB")
- **ตรวจฝั่ง client ก่อนส่ง**: modal "ต่อแล้ว" และ modal ไฟล์แนบเรียก `validateAttachment` ตอนเลือกไฟล์ (ไฟล์ไม่ผ่านไม่เข้ารายการ + `message.error`) และ `uploadAttachments` ตรวจซ้ำก่อนส่ง — เพราะไฟล์ใหญ่เกิน ~12 MB ถูก middleware ตัด body แล้ว server อ่าน multipart ไม่ได้ (modal "ต่อแล้ว" ต้องรู้ก่อนกดต่อ เพราะต่ออายุย้อนไม่ได้)
- server: อ่าน multipart ไม่ได้ → 400 "อ่านไฟล์ไม่สำเร็จ — ไฟล์อาจใหญ่เกิน 10 MB"; ไม่มีไฟล์ → 400 "กรุณาเลือกไฟล์"; เกิน 10 ไฟล์ → 400; ไฟล์ไม่ผ่านกติกา → 400 รวมข้อความทุกไฟล์ (คั่นบรรทัด) และไม่เก็บสักไฟล์; ไม่พบงวด → 404
- **ดูไฟล์**: `GET /api/renewals/attachments/[id]` เช็ก role → stream จาก storage พร้อม header
  - `Content-Type` = ชนิดที่บันทึกไว้, `Cache-Control: private, no-store`
  - `X-Content-Type-Options: nosniff` (ชนิดไฟล์มาจาก client ตอนอัปโหลดและเปิดแบบ inline — กัน browser เดา type เอง)
  - `Content-Disposition: inline; filename="<ASCII ล้วน — อักขระนอก ASCII แทนด้วย _>"; filename*=UTF-8''<ชื่อเดิม encode แบบ RFC 5987>` เพื่อให้ชื่อไฟล์ภาษาไทยไม่ทำ header พัง
  - ไม่พบแถว → 404 "ไม่พบไฟล์"; แถวมีแต่ object หาย → 404 "ไม่พบไฟล์ในที่เก็บ"
- **Upload**: put object ก่อน แล้วค่อยสร้างแถว DB — ถ้าสร้างแถวไม่สำเร็จ ลบ object แบบ best-effort
- **ลบ**: ลบแถว DB ก่อน แล้วลบ object แบบ best-effort (fail → `console.error` เท่านั้น) — object ค้างไม่ทำให้ระบบพัง แต่แถว DB ที่ชี้ไฟล์ไม่มีจริงทำให้พัง; ลบงวด → เก็บ `fileKey` ของ attachments ก่อน, ลบใน transaction (cascade), แล้วลบ objects best-effort
- **UI**: ไอคอน 📎 + จำนวน ในประวัติงวด → modal รายการไฟล์ (รูป preview ในหน้า, PDF เปิดแท็บใหม่), แนบเพิ่ม, ลบ (`modal.confirm`); modal "ต่อแล้ว" ทีละคันมีช่องแนบ

## Testing

### Unit (`node:test`, `lib/renewals/__tests__/`)

ไฟล์: `attachmentRules`, `autoClose`, `constants`, `dashboardFilter`, `dateOnly`, `dueWindow`, `http`, `plate`, `renewalDefaults`, `routeAccess`, `schemas`, `sessionRole`, `storage` (ใน `lib/renewals/__tests__/`) และ `cells`, `validate`, `workbook` (ใน `lib/renewals/import/__tests__/`); รันรวมกับ `lib/utils/__tests__/` (`excel.ts` export `normalizeCellValue` เพิ่มโดยไม่เปลี่ยนพฤติกรรม)

- `normalizePlate` — จุดท้าย, ช่องว่างซ้อน, ไม่มีจังหวัด
- `dueWindow` — สิ้นเดือนหน้า (ธ.ค. → ม.ค. ข้ามปี, ก.พ. ปีอธิกสุรทิน), bucket ขอบวัน (วันนี้ = endDate, สิ้นเดือน)
- ค่า default งวดใหม่ — +1 ปี, 29 ก.พ.
- `sessionRole` — หลาย cookie (INSURANCE ชนะ), cookie ถอดไม่ได้ → warn + undefined; `http` / `schemas` — ข้อความ error ภาษาไทย (JSON เสีย, zod built-in code)
- `import` (`cells` / `validate` / `workbook`) — วันที่ พ.ศ. ทุกรูปแบบ (รวม date cell และ ISO) / ค.ศ. / ปีนอก 2000–2200 / ปี 2 หลัก, เงินมีคอมมา, แถวว่างที่มีแต่ format, template คอลัมน์วันที่เป็น `@`, ช่องบังคับ, ค่า enum ภาษาไทยผิด, key ซ้ำในไฟล์, บริษัทประกันไม่รู้จัก, หางคู่ไม่มี, ช่องว่างไม่ทับค่าเดิม, แผนปิดงวดเก่าอัตโนมัติ (รวมกรณีงวดถัดไปมีคนชี้แล้ว), รถขาย → ปิดงวด
- `attachmentRules` — ชนิด/ขนาด/นามสกุลไม่ตรง MIME, key format, `Content-Disposition` ASCII ล้วน

### E2E (Playwright, docker DB, `--workers=1`, `ATTACHMENT_STORAGE=local`)

seed (`e2e/scripts/seed.ts`) เพิ่ม user role INSURANCE; ข้อมูลรถ/บริษัทประกัน/งวดสร้างในแต่ละ spec ผ่าน API (`e2e/renewals/helpers.ts`) โดยทะเบียนขึ้นต้น `E2E-` และชื่อบริษัทประกันขึ้นต้น `E2E` แล้ว `e2e/scripts/cleanup-renewals.ts` ลบตาม prefix; `endDate` คำนวณจากวันนี้ (เลยกำหนด / เดือนนี้ / เดือนหน้า / เกินเดือนหน้า)
spec: `access`, `dashboard`, `vehicles-api`, `vehicles-ui`, `status-api`, `insurers`, `attachments`, `import` (ใน `e2e/renewals/`)

1. INSURANCE login → อยู่ `/renewals`; เข้า `/jobs` แล้วถูก redirect; STAFF เข้า `/renewals` ไม่ได้
2. Dashboard แสดงงวดใน 3 bucket แต่ไม่แสดงงวดที่เกินเดือนหน้า; counts ถูก
3. ต่อแล้วทีละคัน + แนบ PNG → หายจาก dashboard; หน้ารถมี 2 งวด; งวดใหม่มีไฟล์ 1 ไฟล์ เปิดดูได้; ลบไฟล์ได้
4. ไม่ต่อพร้อมเหตุผล → หายจาก dashboard; เปิดใหม่ → กลับมา
5. Bulk กำลังดำเนินการ / bulk ต่อแล้ว (ประเภทเดียวกัน)
6. Import ไฟล์ fixture → preview ตัวเลขถูก → commit → รถและงวดอยู่ในระบบ; ไฟล์ที่มีบริษัทประกันไม่รู้จัก → ปุ่มเพิ่มบริษัท → preview ผ่าน
7. STAFF เรียก `/api/renewals/attachments/[id]` → 403
8. กดต่อแล้วพร้อมกัน 2 ครั้ง → สำเร็จ 1 ครั้ง อีกครั้ง 409 และมีงวดใหม่งวดเดียว; แก้ `endDate` ข้ามงวดที่ผูกกัน → 400
9. ไฟล์แนบชื่อภาษาไทยเปิดดูได้; ไฟล์เกิน 10 MB ถูกปฏิเสธฝั่ง client; multipart อ่านไม่ได้ → 400; import ปี 2 หลัก → error และกดนำเข้าไม่ได้; import รถ "ขาย" ปิดงวดอัตโนมัติ
10. เปิด modal ซ้ำต้องไม่ค้างค่าจากรายการก่อนหน้า (`preserve={false}`)

ใส่ `data-testid` / `id` ตามแนวทาง antd ใน `CLAUDE.md`

## Deploy

- `make migrate-stag` / `make migrate-prod` (prisma db push) — ตารางใหม่ + ค่า enum `INSURANCE` ไม่กระทบข้อมูลเดิม
- สร้าง user ฝ่ายประกันผ่าน `/admin/users` หลัง deploy
- ต้องมี `NEXTAUTH_SECRET` (หรือ `AUTH_SECRET`) ตอน runtime บน DO — middleware ใช้ถอด JWT เพื่อจำกัดสิทธิ์ INSURANCE; ตรวจโดยล็อกอินด้วย user ฝ่ายประกันแล้วเปิด `/jobs` ตรงๆ ต้องถูกพากลับ `/renewals`
- ไฟล์แนบเก็บ private ใน Spaces (ไม่ใส่ ACL) — ตรวจว่าเปิด URL ตรงของ object แล้วได้ AccessDenied

## นอกขอบเขต

- **เฟส 2 — แจ้งเตือน LINE push**: ใช้ query เดียวกับ dashboard ส่งสรุปตามรอบ; ต้องสร้าง `lib/linePush.ts` ตาม `2026-06-21-watchdog-line-push-design.md` (ยังไม่ได้ implement) + scheduled job บน DO
- เคลมประกัน (ชีตคลุมราคา)
- Export รายการประจำเดือนส่งตัวแทน / บริษัทประกัน
- เชื่อม `Vehicle` กับ `Driver.vehicleRegistration`
- ไฟล์แนบเดียวใช้ร่วมหลายงวด (กรมธรรม์ที่คลุมหลายคัน — แนบซ้ำแต่ละงวดไปก่อน)
- แก้ API เดิมที่ไม่เช็ก role
