# ระบบจัดการ Income ตามราคาน้ำมัน แบบ Upload Excel

**วันที่**: 2026-06-11
**สถานะ**: รออนุมัติ

## ปัญหา

ระบบเดิมตั้งช่วงราคาน้ำมัน → ค่าปรับ income ผ่าน modal ทีละ rate (ลักษณะงาน × SIZE × โรงงาน × ลูกค้า) และทีละช่วงราคา ถ้ามี rate หลายสิบ combination ต้องกรอกซ้ำจำนวนมาก ใช้งานยาก

## แนวทางที่เลือก

**ไม่แตะ schema** — `RateIncomeFuelSurcharge` ยังเก็บส่วนต่างจากราคาฐาน (`surcharge`) เหมือนเดิม และ API คำนวณ income ตอนสร้างงาน (`/api/jobs/calculate/income`) ไม่ต้องแก้ ผู้ใช้เห็น/กรอกเป็น **ค่าขนส่งเต็มจำนวน** เสมอ ระบบแปลงไป-กลับให้เอง:

- ตอนบันทึก: `surcharge = ค่าขนส่งในไฟล์ − ราคาฐาน`
- ตอนแสดงผล: `ค่าขนส่ง = ราคาฐาน + surcharge`
- **ราคาฐาน (`RateIncome.income`) = ค่าขนส่งของช่วงราคาน้ำมันต่ำสุด** ของแต่ละ ลักษณะงาน/SIZE ในไฟล์ (ช่วงต่ำสุดจึงมี surcharge = 0 เสมอ)

ทางเลือกที่ตัดทิ้ง: (A) เปลี่ยน schema เก็บราคาเต็มต่อช่วง — ต้อง migrate และแก้ calc API, (C) โมเดลใหม่ระดับลูกค้า+โรงงาน — เพิ่ม 2 ตาราง ซับซ้อนเกินจำเป็น

## รูปแบบไฟล์ Excel (long format)

Sheet แรก, header แถวแรก:

| ลักษณะงาน | SIZE | ช่วงราคาน้ำมัน | ค่าขนส่ง |
|----------|------|--------------|---------|
| ขาเข้า | 20DC | 30.00-34.99 | 10000 |
| ขาเข้า | 20DC | 35.00-39.99 | 10500 |
| ขาเข้า | 40HC | 30.00-34.99 | 12000 |

- ไฟล์ไม่มีคอลัมน์ลูกค้า/โรงงาน — เลือกจาก UI ก่อน upload
- ไฟล์ไม่มีคอลัมน์ราคาฐาน — คำนวณจากช่วงต่ำสุด
- **ช่วงราคาน้ำมัน**: รูปแบบ `min-max` ตีความรวมปลายทั้งสองข้าง (`35.00-39.99` = 35.00 ≤ ราคา ≤ 39.99) ตอนเก็บลง DB แปลงเป็น `fuelPriceMax = max + 0.01` ให้เข้ากับ logic เดิม (`>= min, < max`) ตอนแสดงผลแปลงกลับ (`max − 0.01`)
- ลักษณะงาน ใช้ label ภาษาไทยตาม `JOB_TYPES`, SIZE ตาม `SIZE_OPTIONS`

### Validation (ทั้งไฟล์ก่อนบันทึก — all-or-nothing)

แจ้ง error เป็นภาษาไทย ระบุเลขแถว:

- ลักษณะงาน/SIZE ไม่รู้จัก
- รูปแบบช่วงราคาผิด (ไม่ใช่ `ตัวเลข-ตัวเลข` หรือ min ≥ max)
- ช่วงราคาทับซ้อน/ซ้ำกันภายใน ลักษณะงาน/SIZE เดียวกัน
- ค่าขนส่งไม่ใช่ตัวเลข หรือติดลบ
- ไฟล์ว่าง / ไม่มี header ที่ถูกต้อง

ช่วงราคาที่มี "ช่องโหว่" (gap) ระหว่างกัน อนุญาต — ราคาน้ำมันที่ตกในช่องโหว่จะได้ราคาฐาน

## Flow การ Upload (modal ใหม่ `FuelRateUploadModal`)

1. **เลือกลูกค้า + โรงงาน** (Select 2 ตัว, บังคับเลือกก่อน)
2. ระบบ query ข้อมูลช่วงราคาเดิมของลูกค้า+โรงงานนั้น
   - มีข้อมูล → ปุ่ม **ดาวน์โหลดข้อมูลปัจจุบัน** (long format .xlsx แก้แล้ว upload กลับได้)
   - ไม่มีข้อมูล → ปุ่ม **ดาวน์โหลด template** (.xlsx มีแถวตัวอย่าง)
3. **แนบไฟล์** → แสดง **preview**: ตารางข้อมูลที่ parse แล้ว + ราคาฐานที่คำนวณได้ต่อ ลักษณะงาน/SIZE + จำนวน rate ที่จะสร้างใหม่/แก้ไข + error ถ้ามี
4. กด **บันทึก** → เรียก API import

### Semantics การบันทึก (ใน transaction เดียว)

- Upsert `RateIncome` ต่อ ลักษณะงาน/SIZE ในไฟล์: สร้างใหม่ถ้าไม่มี, อัปเดต `income` = ราคาฐานที่คำนวณ
- ลบ `RateIncomeFuelSurcharge` เดิม**ทั้งหมด**ของลูกค้า+โรงงานนั้น แล้วสร้างใหม่ตามไฟล์ (ไฟล์ = ความจริงทั้งชุดของช่วงราคาน้ำมันของลูกค้า+โรงงานนั้น)
- `RateIncome` เดิมที่ไม่อยู่ในไฟล์: ราคาฐานไม่ถูกแตะ แต่ช่วงราคาน้ำมัน (ถ้าเคยมี) ถูกล้างตามข้อข้างบน

## หน้าอัตราค่าขนส่ง (`/jobs/settings/rates/income`) — ปรับปรุง

- หัวตารางแสดง **⛽ ราคาน้ำมันปัจจุบัน** (จาก `FuelPriceLog` ล่าสุดที่ `effectiveDate <= วันนี้`)
- คอลัมน์ **ค่าขนส่ง** แสดงราคา effective ตามราคาน้ำมันปัจจุบัน (ฐาน + surcharge ของช่วงที่ตรง) — ไม่มีบันทึกราคาน้ำมัน/นอกช่วง/ไม่มีช่วง → แสดงราคาฐาน
- rate ที่มีช่วงราคาน้ำมัน: คลิกดูได้ผ่าน **modal ดูช่วงราคา (read-only)** แสดง ช่วงราคาน้ำมัน | ค่าขนส่งเต็ม พร้อม highlight ช่วงที่ตรงราคาปัจจุบัน (แก้ไข = upload ทับเท่านั้น)
- ปุ่ม **Upload Excel** เปิด `FuelRateUploadModal`
- ปุ่ม **Export Excel** แทน Export CSV เดิม — export ข้อมูลตามตารางที่กรองอยู่เป็น .xlsx (ลูกค้า, โรงงาน, ลักษณะงาน, SIZE, ราคาฐาน, ค่าขนส่ง ณ ราคาน้ำมันปัจจุบัน)
- modal เพิ่ม/แก้ rate เดี่ยว (ราคาฐาน) **คงไว้เหมือนเดิม** สำหรับ rate ที่ไม่ผูกราคาน้ำมัน

### ของที่ลบ

- `RateIncomeFuelSurchargeManager` (modal จัดการช่วงราคาเดิม) + ปุ่มฟันเฟืองรายแถว
- API `/api/rates/income/surcharge` และ `/api/rates/income/surcharge/[id]`
- ปุ่ม Import CSV + การใช้ `ImportCSVModal` ในหน้านี้ + API `/api/rates/income/import` (ตัว component `ImportCSVModal` คงไว้ — manager อื่นยังใช้)
- ปุ่ม Export CSV (แทนด้วย Export Excel)

## API

### `POST /api/rates/income/fuel-table/import`

- Body: `multipart/form-data` — `file` (.xlsx), `customerId`, `factoryLocationId`
- Auth: เหมือน endpoint rates income เดิม
- ตอบ: สรุปผล (จำนวน rate สร้างใหม่/อัปเดต, จำนวนช่วงราคา) หรือ error รายแถว `{ errors: [{ row, message }] }` status 400

### `GET /api/rates/income` (ปรับ)

- เพิ่ม `fuelSurcharges` ของแต่ละ rate และราคาน้ำมันปัจจุบันใน response — ตารางคำนวณราคา effective และ modal ดูช่วงได้โดยไม่ยิง API เพิ่ม

### ไม่แก้

- `POST /api/jobs/calculate/income` — logic ฐาน + surcharge ตามช่วง ใช้ได้เดิม (นอกช่วง → surcharge 0 → ราคาฐาน ตาม requirement)

## โครงสร้างโค้ด

- `lib/utils/fuelRateExcel.ts` — pure functions: parse ไฟล์ (ผ่าน lib `xlsx` ที่มีอยู่แล้ว), validate, คำนวณราคาฐาน+surcharge, generate template/export — แยกจาก React/API เพื่อ unit test ได้
- `components/jobs/FuelRateUploadModal.tsx` — modal upload (ขั้นตอน เลือก → ดาวน์โหลด → แนบ+preview → บันทึก)
- `components/jobs/FuelRateViewModal.tsx` — modal ดูช่วงราคา read-only
- แก้ `components/jobs/RateIncomeManager.tsx` — ราคา effective, ปุ่มใหม่, ลบของเก่า

## ข้อมูลใน Production

ตรวจแล้ว (2026-06-11): `rate_income_fuel_surcharge` มี 1 แถว, `rate_income` มี 2 แถว (ข้อมูลทดลอง) — ไม่ต้อง migrate ข้อมูล แถว surcharge เดิมที่ค้างอยู่ความหมายยังถูกต้อง (เป็นส่วนต่างเหมือนเดิม)

## การทดสอบ

- **Unit test** (`lib/utils/fuelRateExcel.ts`): parse ถูก/ผิด format, ช่วงทับซ้อน, คำนวณราคาฐานจากช่วงต่ำสุด, แปลง max+0.01 ไป-กลับ, round-trip export → parse
- **E2E (Playwright)**: upload happy path (เลือกลูกค้า+โรงงาน → แนบไฟล์ → preview → บันทึก → ตารางอัปเดต), ไฟล์ผิด format แสดง error, ราคา effective ในตารางเปลี่ยนตามราคาน้ำมัน, modal ดูช่วงราคา
