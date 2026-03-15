# ระบบจัดการงานขนส่ง (Job Management)

## ภาพรวม

ระบบจัดการงานขนส่งสำหรับบันทึก ติดตาม และสรุปข้อมูลงานขนส่งรายคนขับ รองรับการกรอกข้อมูลแบบ click-to-edit (คล้าย Google Sheets) พร้อมระบบ lock/unlock และ import ข้อมูลจาก CSV

---

## สิทธิ์การใช้งาน (Roles)

| ฟีเจอร์ | ADMIN | STAFF |
|---------|-------|-------|
| ดูรายการงาน | ✓ | ✓ |
| เพิ่ม/แก้ไข/ลบงาน | ✓ | ✓ |
| ดูคอลัมน์ "รายได้" | ✓ | ✗ |
| ดูคอลัมน์ "ค่าเที่ยวคนขับรถ" | ✓ | ✗ |
| ปลดล็อคงานที่เคลียร์แล้ว | ✓ | ✗ |
| ตั้งค่าข้อมูลอ้างอิง | ✓ | ✓ |
| Import CSV | ✓ | ✓ |

---

## หน้าหลัก

### 1. รายชื่อคนขับ (`/jobs`)

- แสดงรายชื่อคนขับทั้งหมดเป็น Card
- มีตัวกรอง MonthPicker เพื่อเลือกเดือน (ค่าเริ่มต้น = เดือนปัจจุบัน)
- แต่ละ Card แสดง: จำนวนงาน, รายได้รวม, ยอดโอนรวม
- คลิกที่ Card เพื่อเข้าหน้าตารางงานของคนขับนั้น

### 2. ตารางงานรายคนขับ (`/jobs/[driverId]?month=YYYY-MM`)

หน้าหลักสำหรับจัดการงาน แสดงเป็นตารางที่แก้ไขได้ (Editable Table)

#### การใช้งานตาราง

**โหมดดู (View Mode)**
- ดูข้อมูลงานทั้งหมดของคนขับในเดือนที่เลือก
- เรียงตามวันที่อัตโนมัติ
- ไม่สามารถแก้ไขได้

**โหมดแก้ไข (Edit Mode)**
- กดปุ่ม "แก้ไข" เพื่อเข้าสู่โหมดแก้ไข
- คลิกที่ cell เพื่อแก้ไขข้อมูล (click-to-edit)
- ข้อมูลจะบันทึกอัตโนมัติเมื่อ blur ออกจาก cell
- กด Escape เพื่อยกเลิกการแก้ไข cell ปัจจุบัน
- แสดง icon สถานะบันทึก (loading / สำเร็จ)

#### กลุ่มคอลัมน์

| กลุ่ม | คอลัมน์ |
|-------|---------|
| **ข้อมูลงาน** | วันที่, ลักษณะงาน, ลูกค้า, JOB/เลขที่, SIZE |
| **สถานที่** | สถานที่รับตู้, โรงงาน, สถานที่คืนตู้ |
| **การเงินหลัก** | คาดการณ์โอน, รายได้ (ADMIN), ค่าเที่ยวคนขับ (ADMIN), ยอดโอนจริง |
| **ค่าใช้จ่ายคนขับ** | เบิกล่วงหน้า, ค่าทางด่วน, ค่ารับตู้, ค่าคืนตู้, ค่ายกตู้, ค่าฝากตู้, ค่ายาง, อื่นๆ |
| **สรุป** | รวมคนรถปิดงาน (คำนวณ), ส่วนต่าง (คำนวณ), รวมยอดโอน (คำนวณ) |
| **น้ำมัน/ไมล์** | ไมล์รถ, น้ำมัน OFF, น้ำมันสด (ลิตร/฿), น้ำมันเครดิต (ลิตร/฿) |
| **สถานะ** | เคลียร์ (checkbox), ST (statement verified) |

#### คอลัมน์คำนวณ (Computed - ไม่เก็บใน DB)

- **รวมคนรถปิดงาน** = เบิกล่วงหน้า + ค่าทางด่วน + ค่ารับตู้ + ค่าคืนตู้ + ค่ายกตู้ + ค่าฝากตู้ + ค่ายาง + อื่นๆ
- **ส่วนต่าง** = รวมคนรถปิดงาน - ยอดโอนจริง
- **รวมยอดโอน** = ยอดโอนจริง + ส่วนต่าง

---

## การเพิ่มงานใหม่

### วิธีที่ 1: เพิ่มทีละรายการ

1. กดปุ่ม "แก้ไข" เพื่อเข้า Edit Mode
2. กดปุ่ม "เพิ่ม row" — จะเพิ่ม row เปล่าด้านล่างสุด (Draft Row)
3. กรอกข้อมูลใน Draft Row:
   - กรอก วันที่, ลักษณะงาน, ลูกค้า
   - กรอก เลขที่งาน แล้ว blur → ระบบจะสร้างงานใน DB อัตโนมัติ
   - หลังจากสร้างแล้ว row จะกลายเป็นงานจริง สามารถแก้ไข cell อื่นๆ ต่อได้
4. กรอกข้อมูลที่เหลือ (แต่ละ cell auto-save เมื่อ blur)

**กรณี "เบิกล่วงหน้า":**
- เลือกลักษณะงาน = "เบิกล่วงหน้า"
- เลือกลูกค้า → ระบบจะสร้างงานอัตโนมัติพร้อม generate เลขที่งาน (ADV-00001, ADV-00002, ...)
- ใส่ได้แค่ช่อง "เบิกล่วงหน้า" เท่านั้น (= ยอดโอนจริงเสมอ)
- คอลัมน์อื่นๆ จะถูก disabled

### วิธีที่ 2: Import จาก CSV

1. กดปุ่ม "Import CSV"
2. กดปุ่ม "ดาวน์โหลด Template" เพื่อรับไฟล์ CSV ตัวอย่าง
3. กรอกข้อมูลใน CSV (ใช้ชื่อลูกค้า/สถานที่แทน ID)
4. อัปโหลดไฟล์ CSV
5. กดปุ่ม "ตรวจสอบข้อมูล" เพื่อ validate
   - ระบบจะตรวจ: เลขที่งานซ้ำ, ลูกค้าไม่พบ, สถานที่ไม่พบ, รูปแบบวันที่, ลักษณะงาน, ขนาดตู้
   - ถ้ามีข้อผิดพลาดจะแสดงรายละเอียดเป็นตาราง
6. เมื่อ validate ผ่าน กดปุ่ม "ยืนยัน Import" เพื่อสร้างงานทั้งหมด

**รูปแบบไฟล์ CSV:**
- Encoding: UTF-8
- คอลัมน์: jobDate, jobType, customerName, jobNumber, size, pickupLocationName, factoryLocationName, returnLocationName, estimatedTransfer, income, driverWage, actualTransfer, advance, toll, pickupFee, returnFee, liftFee, storageFee, tire, other, mileage, fuelOfficeLiters, fuelCashLiters, fuelCashAmount, fuelCreditLiters, fuelCreditAmount
- วันที่ใช้รูปแบบ YYYY-MM-DD
- ใช้ชื่อลูกค้า/สถานที่ (ต้องตรงกับที่มีในระบบ)

---

## ระบบ Lock (เคลียร์)

- เมื่อติ๊ก checkbox "เคลียร์" → งานจะถูก **lock** ไม่สามารถแก้ไขหรือลบได้
- **STAFF**: ติ๊กเคลียร์ได้ แต่ปลดล็อคไม่ได้
- **ADMIN**: ปลดล็อคได้ผ่านปุ่ม unlock ในคอลัมน์ action

---

## การลบงาน

- กดปุ่มถังขยะที่ row (ต้องอยู่ใน Edit Mode)
- ลบได้เฉพาะงานที่ **ไม่ได้ lock** (clearStatus = false)
- Draft row ที่ยังไม่มีเลขที่งาน → ล้างข้อมูล row ทิ้ง
- งานที่มีเลขที่งานแล้ว → ลบออกจาก DB

---

## การเพิ่มข้อมูลอ้างอิงแบบ Inline

ขณะกรอกข้อมูลในตาราง สามารถเพิ่มลูกค้า/สถานที่ใหม่ได้จาก dropdown โดยตรง:

1. คลิกที่ cell ลูกค้า/สถานที่ เพื่อเปิด dropdown
2. กดปุ่ม "+ เพิ่มใหม่" ด้านล่าง dropdown
3. กรอกชื่อใน modal → กดบันทึก
4. รายการใหม่จะถูกเพิ่มใน dropdown ทันที

---

## ตั้งค่าข้อมูลอ้างอิง (`/jobs/settings/...`)

เมนูย่อยสำหรับจัดการข้อมูลพื้นฐาน มี sidebar เมนูด้านซ้าย:

### ลูกค้า (`/jobs/settings/customers`)
- เพิ่ม/แก้ไข/ลบลูกค้า
- ชื่อลูกค้าต้องไม่ซ้ำ
- ลบเป็น soft delete (isActive = false)

### คนขับรถ (`/jobs/settings/drivers`)
- เพิ่ม/แก้ไข/ลบคนขับ
- ชื่อคนขับต้องไม่ซ้ำ
- จัดการบัญชีธนาคาร (หลายบัญชีได้):
  - ชื่อธนาคาร
  - เลขบัญชี
  - ชื่อบัญชี
- ลบเป็น soft delete

### สถานที่ (`/jobs/settings/locations`)
- เพิ่ม/แก้ไข/ลบสถานที่
- ชื่อสถานที่ต้องไม่ซ้ำ
- ประเภท:
  - **โรงงาน (factory)**: ใช้ในคอลัมน์ "โรงงาน"
  - **ทั่วไป (general)**: ใช้ในคอลัมน์ "สถานที่รับตู้" และ "สถานที่คืนตู้"
- ลบเป็น soft delete

---

## ลักษณะงาน (Job Types)

| ลักษณะงาน | คอลัมน์ที่ใช้ได้ | หมายเหตุ |
|-----------|-----------------|---------|
| ขาเข้า | ทุกคอลัมน์ | - |
| ขาออก | ทุกคอลัมน์ | - |
| ทอยตู้ | ทุกคอลัมน์ | - |
| พื้นเรียบ | ทุกคอลัมน์ | - |
| โรงสี | ทุกคอลัมน์ | - |
| เบิกล่วงหน้า | เบิกล่วงหน้า เท่านั้น | เลขที่งาน auto-generate (ADV-XXXXX), ยอดโอนจริง = เบิกล่วงหน้า |

## ขนาดตู้ (Size Options)

20DC, 40DC, 20RF, 40RF, 2x20DC, truck

---

## Backend Prefill

ระบบจะ prefill ค่าอัตโนมัติจากงานล่าสุดที่ตรงเงื่อนไข:

- **คาดการณ์โอน**: คำนวณจาก ค่ารับตู้ + ค่าคืนตู้ ของงานล่าสุดที่ตรง size + factory
- **รายได้**: ดึงจากรายได้ของงานล่าสุดที่ตรง customer + size + factory
- **ค่าเที่ยวคนขับ**: คำนวณจากงานล่าสุดที่ตรง size + factory

---

## โครงสร้างไฟล์

```
app/
  (protected)/jobs/
    page.tsx                          # หน้ารายชื่อคนขับ
    [driverId]/page.tsx               # หน้าตารางงานรายคนขับ
    settings/
      layout.tsx                      # Layout พร้อม sidebar เมนู
      customers/page.tsx              # จัดการลูกค้า
      drivers/page.tsx                # จัดการคนขับ
      locations/page.tsx              # จัดการสถานที่
  api/jobs/
    route.ts                          # GET (list), POST (create)
    [id]/route.ts                     # PATCH (update), DELETE
    [id]/clear/route.ts               # PATCH toggle clearStatus
    summary/route.ts                  # GET สรุปรายคนขับ
    import/route.ts                   # POST import จาก CSV
    calculate/
      estimated-transfer/route.ts     # POST prefill คาดการณ์โอน
      income/route.ts                 # POST prefill รายได้
      driver-wage/route.ts            # POST prefill ค่าเที่ยวคนขับ
  api/customers/
    route.ts                          # GET, POST
    [id]/route.ts                     # PATCH, DELETE
  api/drivers/
    route.ts                          # GET, POST
    [id]/route.ts                     # PATCH, DELETE
    [id]/bank-accounts/route.ts       # GET, POST
    [id]/bank-accounts/[accountId]/route.ts  # PATCH, DELETE
  api/locations/
    route.ts                          # GET (?type= filter), POST
    [id]/route.ts                     # PATCH, DELETE

components/jobs/
  DriverJobList.tsx                    # Card list คนขับ
  EditableJobTable.tsx                # ตารางงานหลัก (editable)
  EditableCell.tsx                    # Cell แก้ไขได้
  CustomerManager.tsx                 # CRUD ลูกค้า
  DriverManager.tsx                   # CRUD คนขับ + บัญชีธนาคาร
  LocationManager.tsx                 # CRUD สถานที่
  QuickAddModal.tsx                   # Modal เพิ่มข้อมูลจาก dropdown
  ImportJobModal.tsx                  # Modal import CSV

types/job.ts                          # TypeScript interfaces + constants
```
