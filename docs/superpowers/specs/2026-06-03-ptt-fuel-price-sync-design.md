# PTT Fuel Price Auto-Sync — Design Spec

**Date:** 2026-06-03  
**Status:** Approved

## Overview

ระบบดึงราคาน้ำมันดีเซล B7 จาก PTT API โดยอัตโนมัติทุกวัน และ upsert ลงตาราง `FuelPriceLog` ที่มีอยู่แล้ว ไม่ต้องมีคนกดปุ่ม

## Goals

- ดึงราคาดีเซล B7 (`OilTypeId: "ดีเซล"`) จาก PTT PTTOR API ทุกวันโดยอัตโนมัติ
- รองรับ backfill ครั้งแรกตั้งแต่ 1 พค 2026 จนถึงเดือนปัจจุบัน
- ไม่ต้อง migrate schema — ใช้ `FuelPriceLog` model เดิม

## Non-Goals

- ไม่ดึงน้ำมันประเภทอื่น (เบนซิน, B20 ฯลฯ)
- ไม่มี UI ปุ่มสำหรับดึงมือ
- ไม่มี retry logic ซับซ้อน — fail fast แล้วให้ DO Job retry เอง

## Architecture

```
DO Scheduled Job (ทุกวัน 23:00 UTC = 06:00 ICT)
  → npx tsx scripts/sync-fuel-price.ts
    → เรียก PTT PTTOR API (POST admin-ajax.php)
    → filter OilTypeId === "ดีเซล"
    → upsert ลง FuelPriceLog (unique key: effectiveDate)
    → log ผลลัพธ์ แล้ว process.exit(0)
```

## Components

### 1. `scripts/sync-fuel-price.ts`

Standalone script รันได้ด้วย `npx tsx` ไม่ depend on Next.js runtime

**Two modes:**

| Mode | Command | Behavior |
|------|---------|----------|
| Normal (cron) | `npx tsx scripts/sync-fuel-price.ts` | ดึงเดือนปัจจุบันเท่านั้น |
| Backfill | `npx tsx scripts/sync-fuel-price.ts --backfill` | ดึงตั้งแต่ พค 2026 จนถึงเดือนปัจจุบัน loop ทีละเดือน |

**Normal mode logic:**
1. คำนวณ month/year ปัจจุบัน (Buddhist Era year = CE + 543)
2. POST ไป `https://www.pttor.com/wp-admin/admin-ajax.php` พร้อม `action=fetch_oil_prices&province=กรุงเทพมหานคร&month=M&year=YYYY`
3. ตรวจ `response.success === true`
4. จาก `response.data[]` แต่ละ record ดึง priceData ที่ `OilTypeId === "ดีเซล"`
5. `upsert` ลง `FuelPriceLog` โดย `effectiveDate` เป็น unique key, `note = "auto-sync from PTT"` — ทับทุกกรณี (PTT เป็น authoritative เสมอ รวมถึง record ที่กรอกมือ)
6. log จำนวน created/updated แล้ว `prisma.$disconnect()` + exit 0

**Backfill mode logic:**
1. กำหนด start = พค 2026 (month=5, year CE=2026)
2. Loop ทีละเดือนจาก start จนถึงเดือนปัจจุบัน
3. แต่ละเดือนรัน logic เดียวกับ normal mode
4. log summary รวม แล้ว exit 0

**PTT API details:**
- URL: `POST https://www.pttor.com/wp-admin/admin-ajax.php`
- Content-Type: `application/x-www-form-urlencoded`
- Body: `action=fetch_oil_prices&province=%E0%B8%81%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B9%80%E0%B8%97%E0%B8%9E%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%99%E0%B8%84%E0%B8%A3&month=M&year=YYYY_BE`
- year ส่งเป็น Buddhist Era (CE + 543) ตาม API ของ PTT
- Headers ที่จำเป็น: `x-requested-with: XMLHttpRequest`, `origin: https://www.pttor.com`, `referer: https://www.pttor.com/th/oil_price`

### 2. `.do/app.yaml` — เพิ่ม jobs section

เพิ่มต่อจาก services ที่มีอยู่:

```yaml
jobs:
  - name: sync-fuel-price
    kind: SCHEDULED
    run_command: npx tsx scripts/sync-fuel-price.ts
    schedule: "0 23 * * *"
    instance_count: 1
    instance_size_slug: basic-xxs
    envs:
      - key: DATABASE_URL
        scope: RUN_TIME
        type: SECRET
```

> `DATABASE_URL` ต้องตั้งค่าใน DO Console ด้วยมือ (ไม่ commit ลง repo)

## Error Handling

| Scenario | Action |
|----------|--------|
| PTT API network error | log error + `process.exit(1)` → DO marks job failed |
| `response.success === false` | log error + `process.exit(1)` |
| ไม่มีข้อมูล "ดีเซล" ในเดือนนั้น | log warning + `process.exit(0)` (ไม่ใช่ error) |
| Duplicate effectiveDate | upsert ทับเสมอ — PTT authoritative ทั้ง auto-sync และ record ที่กรอกมือ |
| Prisma error | log error + `process.exit(1)` |

## Data Mapping

PTT API response → `FuelPriceLog`:

| PTT field | FuelPriceLog field | Note |
|-----------|-------------------|------|
| `priceDate` (e.g. `"2026-05-30T05:00"`) | `effectiveDate` | ตัด time ออก เก็บแค่วันที่ |
| `Price` (ของ OilTypeId "ดีเซล") | `pricePerLiter` | Decimal |
| — | `note` | `"auto-sync from PTT"` |

## Testing

- รัน `npx tsx scripts/sync-fuel-price.ts --backfill` บน local กับ staging DB เพื่อตรวจ data
- ตรวจใน DB ว่า effectiveDate ไม่ซ้ำ และ pricePerLiter ถูกต้อง
- รัน normal mode ซ้ำ 2 ครั้ง ตรวจว่า row count ไม่เพิ่ม (idempotent)

## Deployment Steps

1. merge code เข้า main
2. DO rebuild app อัตโนมัติ — Job component จะถูกสร้าง
3. ตั้งค่า `DATABASE_URL` secret ใน DO Console สำหรับ job
4. รัน backfill ด้วยมือครั้งเดียวผ่าน DO Console (Run Job with override command)
5. ปล่อย cron รันอัตโนมัติต่อไป
