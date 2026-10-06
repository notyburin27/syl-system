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

- **`normalizePlate`**: trim, ยุบช่องว่างซ้อนเหลือช่องเดียว, ตัด "." ท้ายตัวย่อจังหวัด
  (`"64-5598 กท."` → `"64-5598 กท"`, `"64-0329  กท"` → `"64-0329 กท"`) — ใช้ทุกจุดที่รับทะเบียน (form, import, ค้นหา)
- **รถไม่มี soft delete แยก** — `status` ทำหน้าที่แทน; ลบรถได้เฉพาะเมื่อไม่มีงวด (ทั้งที่เป็นเจ้าของและที่เป็นหางคู่) มิฉะนั้น 409
- **เปลี่ยนสถานะรถเป็น SOLD** → ใน transaction เดียวกัน ปิดทุกงวดที่เปิดอยู่ของรถคันนั้นเป็น `NOT_RENEWED` / `SOLD`
  กติกาเต็ม: **รถสถานะ SOLD ไม่มีงวดเปิดเลย** — ทุกจุดที่แก้งวด/รถ (เพิ่ม/แก้/ลบงวด, แก้รถ, import) เรียก `enforceCoverageRules` ตัวเดียว
  (เพิ่มงวดให้รถที่ขายแล้ว → ปิดทันที; เปิดใหม่งวดของรถที่ขายแล้ว → 409)
  เปลี่ยนเป็น `SUSPENDED` → ไม่แตะงวด (บางคันงดใช้แต่ยังต่อประกัน) แค่แสดงป้าย "งดใช้" บน dashboard
  เปลี่ยนกลับเป็น `ACTIVE` → ไม่เปิดงวดคืนอัตโนมัติ
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
| เปิดใหม่ | NOT_RENEWED | PENDING | ล้าง reason (เช่น รถซ่อมเสร็จกลับมาใช้) |
| ลบงวดใหม่ | (งวดที่ถูกชี้โดย `renewedToId`) | — | งวดก่อนหน้ากลับเป็น PENDING + ล้าง `renewedToId` — transaction เดียว |

ทุก transition อัปเดต `statusUpdatedAt` / `statusUpdatedById`

**กันการกดซ้ำ/พร้อมกัน**: action ที่ต้องการสถานะต้นทาง "เปิด" ใช้ `updateMany({ where: { id: { in: ids }, renewalStatus: { in: [PENDING, IN_PROGRESS] } } })`
ภายใน transaction ถ้า `count` ไม่เท่าจำนวน id → rollback และตอบ **409 "งวดนี้ถูกปิดไปแล้ว"** (bulk: แจ้งรายการที่ชน — ทั้งชุดไม่สำเร็จ)

### ค่า default ของงวดใหม่ (ต่อแล้ว)

- คัดลอกจากงวดเดิม: `insurerId`, `coverageClass`, `amount`, `serviceFee`, `pairedVehicleId`
- `startDate` = `endDate` เดิม + 1 วัน; `endDate` = `endDate` เดิม + 1 ปี (29 ก.พ. → 28 ก.พ.)
- `policyNumber`, `renewalNote` ว่าง
- validate: `endDate` ใหม่ต้อง > `endDate` เดิม และ ≥ `startDate` ใหม่ → ไม่ผ่าน 400

## Dashboard & Buckets

ฟังก์ชัน pure ใน `lib/renewals/dueWindow.ts` (รับ `today` เป็น `YYYY-MM-DD` ตาม Asia/Bangkok — route คำนวณ today จากเวลาปัจจุบันแล้วส่งเข้า):

- `endOfNextMonth(today)` — เช่น `2026-10-06` → `2026-11-30`, `2026-12-15` → `2027-01-31`
- `dueBucket(endDate, today)`:
  - `OVERDUE` — `endDate < today` (แดง)
  - `THIS_MONTH` — `today ≤ endDate ≤ สิ้นเดือนนี้` (ส้ม)
  - `NEXT_MONTH` — `สิ้นเดือนนี้ < endDate ≤ สิ้นเดือนหน้า` (น้ำเงิน)

เปรียบเทียบแบบ date-only (`@db.Date`) — ไม่ใช้ timestamp

## หน้าจอ

เมนูใหม่ **"ต่ออายุรถ"** (prefix `/renewals`):

| Path | หน้าที่ |
|---|---|
| `/renewals` | Dashboard |
| `/renewals/vehicles` | ทะเบียนรถ — ค้นหา/กรอง, เพิ่ม/แก้ไข/เปลี่ยนสถานะ, คอลัมน์วันหมดล่าสุดของ 4 ประเภท |
| `/renewals/vehicles/[id]` | รายละเอียดรถ + ประวัติงวดแยกตามประเภท, เพิ่ม/แก้/ลบงวด, เปิดใหม่, ไฟล์แนบ |
| `/renewals/insurers` | รายชื่อบริษัทประกัน (เพิ่ม/แก้ชื่อ/ปิดใช้งาน) |
| `/renewals/import` | Upload Excel |

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
- ใช้ `<Table size="small">`, `App.useApp().message/modal`, แสดงวันที่ พ.ศ. ผ่าน `lib/utils/thaiDate.ts`

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
- `middleware.ts` — หลังเช็ก cookie แล้ว ถอด JWT ด้วย `getToken` (`next-auth/jwt`, รันบน edge ได้) เอา `role` ไปเรียก `renewalRouteDecision`
  - forbidden → `403 { error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }`; redirect → `NextResponse.redirect`
  - ถอด token ไม่ได้ → ทำงานแบบเดิม (ปล่อยผ่าน ให้ page/route เช็กเอง)
- `app/(protected)/renewals/layout.tsx` — server guard ซ้ำอีกชั้น: role ไม่อยู่ใน `RENEWAL_ROLES` → `redirect('/jobs')`
- `app/(protected)/layout.tsx` + `components/ProtectedLayoutClient.tsx` — เมนู "ต่ออายุรถ" (dashboard, ทะเบียนรถ, บริษัทประกัน, นำเข้า Excel) สำหรับ ADMIN/MANAGER/INSURANCE; INSURANCE เห็นเมนูนี้อย่างเดียว; label role "ฝ่ายประกัน"
- `app/(protected)/admin/users/page.tsx`, `app/api/users/route.ts`, `app/api/users/[id]/route.ts` — เพิ่มตัวเลือก `INSURANCE` ("ฝ่ายประกัน")
- `lib/renewals/access.ts` — `requireRenewalAccess()` คืน 401/403 response หรือ user; **ทุก** route ใต้ `/api/renewals/**` เรียกตัวนี้ (`RENEWAL_ROLES = ['ADMIN', 'MANAGER', 'INSURANCE']` อยู่ใน `lib/renewals/constants.ts` ซึ่ง edge-safe)

> **ข้อจำกัดเดิม (ไม่แก้ในรอบนี้)**: API และหน้าเดิม (เช่น `/jobs`, `/api/jobs`) ไม่เช็ก role สำหรับ STAFF/SENIOR_STAFF — คงเดิม
> (role `INSURANCE` ใหม่ถูกกันด้วย middleware แล้ว)

## API

ทุก route: `requireRenewalAccess()`, validate ด้วย zod, error ภาษาไทย

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/renewals/dashboard` | `{ today, items }` — ทุกงวดเปิดที่ `endDate ≤ สิ้นเดือนหน้า` พร้อม bucket; ตัวกรอง/แท็บ/counts/ยอดรวมคำนวณฝั่ง client ด้วย pure function (ข้อมูลหลักร้อยแถว) |
| POST | `/api/renewals/coverages/[id]/renew` | ต่อแล้ว (ทีละคัน) — body = งวดใหม่ |
| POST | `/api/renewals/coverages/bulk-renew` | `{ ids, insurerId?, startDate, endDate }` |
| POST | `/api/renewals/coverages/bulk-status` | `{ ids, status: PENDING\|IN_PROGRESS\|NOT_RENEWED, reason?, note? }` |
| POST | `/api/renewals/coverages/[id]/reopen` | NOT_RENEWED → PENDING |
| POST | `/api/renewals/coverages` | เพิ่มงวดเอง (จากหน้ารถ) |
| PATCH / DELETE | `/api/renewals/coverages/[id]` | แก้ข้อมูลงวด (ไม่รวมสถานะ) / ลบ |
| GET / POST | `/api/renewals/vehicles` | รายการ (พร้อมวันหมดล่าสุดต่อประเภท) / เพิ่ม |
| GET / PATCH / DELETE | `/api/renewals/vehicles/[id]` | รายละเอียด + ประวัติงวด (พร้อมจำนวนไฟล์แนบ) / แก้ (รวมสถานะรถ) / ลบ |
| GET / POST | `/api/renewals/insurers` | รายการ / เพิ่ม (รับ `names[]` สำหรับปุ่มเพิ่มหลายรายจากหน้า import) |
| PATCH | `/api/renewals/insurers/[id]` | แก้ชื่อ / isActive |
| GET | `/api/renewals/import/template` | ดาวน์โหลด template |
| POST | `/api/renewals/import` | multipart `file` + `mode=preview\|commit` |
| GET / POST | `/api/renewals/coverages/[id]/attachments` | รายการไฟล์ของงวด / multipart upload ไฟล์ (≤ 10 ไฟล์ต่อครั้ง) |
| GET / DELETE | `/api/renewals/attachments/[id]` | stream ไฟล์ (inline) / ลบ |

Status codes: 400 ข้อมูลไม่ถูกต้อง, 401 ไม่ได้ login, 403 role ไม่มีสิทธิ์, 404 ไม่พบ, 409 ชน (งวดถูกปิดแล้ว, ทะเบียนซ้ำ, งวดซ้ำ `vehicleId+type+endDate`, ลบรถที่มีงวด)

## Upload Excel

### Template (`exceljs`)

Workbook เดียว: ชีตข้อมูล 2 ชีต (แถวแรกเป็น header, ข้อมูลเริ่มแถว 2 — ไม่มีแถวตัวอย่างในชีตข้อมูล) + ชีต "วิธีกรอก" อธิบายแต่ละคอลัมน์และรูปแบบวันที่ (ระบบไม่อ่านชีตนี้):

**ชีต "รถ"**: ทะเบียน* · เบอร์รถ · บริษัท* · ลักษณะ* · ยี่ห้อ · เลขตัวถัง · เชื้อเพลิง · น้ำหนัก(กก.) · สถานะ (ใช้งาน/งดใช้/ขาย) · วันที่สถานะ · หมายเหตุ

**ชีต "งวด"**: ทะเบียน* · ประเภท* (พรบ./ภาษี/ประกันรถยนต์/ประกันสินค้า) · บริษัทประกัน · ชั้น · เลขกรมธรรม์ · วันเริ่ม · วันสิ้นสุด* · เบี้ย/ภาษี · ค่าบริการ · ทะเบียนหางคู่ · สถานะการต่อ (รอต่อ/กำลังดำเนินการ/ไม่ต่อ) · เหตุผลไม่ต่อ · หมายเหตุ

- ประเภท / สถานะ / สถานะการต่อ / เหตุผลไม่ต่อ มี data validation dropdown
- **วันที่**: date cell ของ Excel หรือข้อความ `dd/mm/yyyy`; ปี > 2400 = พ.ศ. (ลบ 543)
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
- บริษัทประกันต้องตรงกับชื่อใน `insurers` (หลัง trim) — ไม่ตรง = error + อยู่ใน `unknownInsurers` (ไม่สร้างเงียบๆ กันชื่อพิมพ์ผิดกลายเป็นบริษัทซ้ำ)
- key ซ้ำในไฟล์เดียวกัน = error ทุกแถวที่ซ้ำ
- ภาษีที่กรอกบริษัทประกัน / ประเภทที่ไม่ใช่ประกันรถยนต์แต่กรอกชั้นหรือหางคู่ = error (ในไฟล์ถือว่าผู้ใช้ตั้งใจกรอก จึงแจ้งแทนการล้างทิ้งเงียบๆ)
- รถใหม่ต้องมี บริษัท + ลักษณะ; รถที่มีอยู่แล้วเว้นว่างได้ (คงค่าเดิม)
- "ไม่ต่อ" ต้องมีเหตุผล; เหตุผล "อื่นๆ" ต้องมีหมายเหตุ
- **ปิดงวดเก่าอัตโนมัติ**: หลังรวมข้อมูลไฟล์กับของเดิม รถ 1 คัน 1 ประเภท ให้มีงวดเปิดได้เฉพาะงวดที่ `endDate` มากที่สุด
  งวดเปิดที่เก่ากว่า → `RENEWED` + `renewedToId` = งวดถัดไปตาม `endDate` (ถ้างวดถัดไปยังไม่มีงวดก่อนหน้าชี้อยู่ มิฉะนั้นปิดโดยไม่ผูก)
  งวดที่ปิดแล้ว (RENEWED/NOT_RENEWED) ไม่แตะ

Logic parse/validate/วางแผน upsert อยู่ใน `lib/renewals/import.ts` เป็น pure function (รับ rows + ข้อมูลเดิม คืน errors + plan) — route ทำแค่อ่านไฟล์ โหลดข้อมูลเดิม และ apply plan

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

- **Storage interface** `lib/renewals/storage.ts`: `putObject(key, body, contentType)`, `getObject(key)` (stream + contentType), `deleteObject(key)`
  - S3 (Spaces) — default; ใช้ `spacesClient` / `SPACES_BUCKET` จาก `lib/spaces.ts`; **ไม่ใส่ ACL** (private) ต่างจาก LINE images ที่ `public-read`
  - Local folder — เมื่อ `ATTACHMENT_STORAGE=local` เขียนที่ `.tmp/renewal-attachments/` (gitignore) ใช้ใน E2E ไม่ให้เทสต์เขียนลง bucket จริง (`.env.test` ชี้ Spaces จริง)
- Key: `vehicle-coverages/YYYY-MM/<uuid>.<ext>` (YYYY-MM ตามเวลา Asia/Bangkok)
- รับ **PDF / JPG / PNG ≤ 10 MB ต่อไฟล์** — ตรวจทั้ง MIME และนามสกุล (`lib/renewals/attachmentRules.ts` pure)
- **ดูไฟล์**: `GET /api/renewals/attachments/[id]` เช็ก role → stream จาก storage พร้อม `Content-Disposition: inline; filename*=UTF-8''<ชื่อเดิม>`
- **Upload**: put object ก่อน แล้วค่อยสร้างแถว DB — ถ้าสร้างแถวไม่สำเร็จ ลบ object แบบ best-effort
- **ลบ**: ลบแถว DB ก่อน แล้วลบ object แบบ best-effort (fail → `console.error` เท่านั้น) — object ค้างไม่ทำให้ระบบพัง แต่แถว DB ที่ชี้ไฟล์ไม่มีจริงทำให้พัง; ลบงวด → เก็บ `fileKey` ของ attachments ก่อน, ลบใน transaction (cascade), แล้วลบ objects best-effort
- **UI**: ไอคอน 📎 + จำนวน ในประวัติงวด → modal รายการไฟล์ (รูป preview ในหน้า, PDF เปิดแท็บใหม่), แนบเพิ่ม, ลบ (`modal.confirm`); modal "ต่อแล้ว" ทีละคันมีช่องแนบ

## Testing

### Unit (`node:test`, `lib/renewals/__tests__/`)

- `normalizePlate` — จุดท้าย, ช่องว่างซ้อน, ไม่มีจังหวัด
- `dueWindow` — สิ้นเดือนหน้า (ธ.ค. → ม.ค. ข้ามปี, ก.พ. ปีอธิกสุรทิน), bucket ขอบวัน (วันนี้ = endDate, สิ้นเดือน)
- ค่า default งวดใหม่ — +1 ปี, 29 ก.พ.
- `import` — วันที่ พ.ศ./ค.ศ./date cell, ช่องบังคับ, ค่า enum ภาษาไทยผิด, key ซ้ำในไฟล์, บริษัทประกันไม่รู้จัก, หางคู่ไม่มี, ช่องว่างไม่ทับค่าเดิม, แผนปิดงวดเก่าอัตโนมัติ (รวมกรณีงวดถัดไปมีคนชี้แล้ว), รถขาย → ปิดงวด
- `attachmentRules` — ชนิด/ขนาด/นามสกุลไม่ตรง MIME, key format

### E2E (Playwright, docker DB, `--workers=1`, `ATTACHMENT_STORAGE=local`)

seed เพิ่ม: user role INSURANCE, insurers, รถ + งวดที่ `endDate` คำนวณจากวันนี้ (เลยกำหนด / เดือนนี้ / เดือนหน้า / เกินเดือนหน้า)

1. INSURANCE login → อยู่ `/renewals`; เข้า `/jobs` แล้วถูก redirect; STAFF เข้า `/renewals` ไม่ได้
2. Dashboard แสดงงวดใน 3 bucket แต่ไม่แสดงงวดที่เกินเดือนหน้า; counts ถูก
3. ต่อแล้วทีละคัน + แนบ PNG → หายจาก dashboard; หน้ารถมี 2 งวด; งวดใหม่มีไฟล์ 1 ไฟล์ เปิดดูได้; ลบไฟล์ได้
4. ไม่ต่อพร้อมเหตุผล → หายจาก dashboard; เปิดใหม่ → กลับมา
5. Bulk กำลังดำเนินการ / bulk ต่อแล้ว (ประเภทเดียวกัน)
6. Import ไฟล์ fixture → preview ตัวเลขถูก → commit → รถและงวดอยู่ในระบบ; ไฟล์ที่มีบริษัทประกันไม่รู้จัก → ปุ่มเพิ่มบริษัท → preview ผ่าน
7. STAFF เรียก `/api/renewals/attachments/[id]` → 403

ใส่ `data-testid` / `id` ตามแนวทาง antd ใน `CLAUDE.md`

## Deploy

- `make migrate-stag` / `make migrate-prod` (prisma db push) — ตารางใหม่ + ค่า enum `INSURANCE` ไม่กระทบข้อมูลเดิม
- สร้าง user ฝ่ายประกันผ่าน `/admin/users` หลัง deploy

## นอกขอบเขต

- **เฟส 2 — แจ้งเตือน LINE push**: ใช้ query เดียวกับ dashboard ส่งสรุปตามรอบ; ต้องสร้าง `lib/linePush.ts` ตาม `2026-06-21-watchdog-line-push-design.md` (ยังไม่ได้ implement) + scheduled job บน DO
- เคลมประกัน (ชีตคลุมราคา)
- Export รายการประจำเดือนส่งตัวแทน / บริษัทประกัน
- เชื่อม `Vehicle` กับ `Driver.vehicleRegistration`
- ไฟล์แนบเดียวใช้ร่วมหลายงวด (กรมธรรม์ที่คลุมหลายคัน — แนบซ้ำแต่ละงวดไปก่อน)
- แก้ API เดิมที่ไม่เช็ก role
