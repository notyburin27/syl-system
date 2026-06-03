# PTT Fuel Price Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง script ที่ดึงราคาดีเซล B7 จาก PTT PTTOR API แล้ว upsert ลง `FuelPriceLog` โดยอัตโนมัติทุกวันผ่าน DigitalOcean Scheduled Job

**Architecture:** Script standalone `scripts/sync-fuel-price.ts` รันด้วย `npx tsx` รองรับ 2 mode — normal (เดือนปัจจุบัน) และ `--backfill` (ตั้งแต่ พค 2026 จนถึงเดือนปัจจุบัน) PTT เป็น authoritative เสมอ upsert ทับทุกกรณี DO Scheduled Job รันทุกวัน 23:00 UTC (06:00 ICT)

**Tech Stack:** TypeScript, tsx, Prisma 7, `node:https` (built-in, ไม่เพิ่ม dependency), DigitalOcean App Platform Scheduled Jobs

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/sync-fuel-price.ts` | Create | Script หลัก — เรียก PTT API, filter ดีเซล, upsert DB |
| `.do/app.yaml` | Modify | เพิ่ม jobs section สำหรับ DO Scheduled Job |

---

### Task 1: สร้าง script หลัก `scripts/sync-fuel-price.ts`

**Files:**
- Create: `scripts/sync-fuel-price.ts`

- [ ] **Step 1: สร้าง directory และไฟล์ script**

```bash
mkdir -p scripts
```

- [ ] **Step 2: เขียน script**

สร้างไฟล์ `scripts/sync-fuel-price.ts` ด้วยเนื้อหาต่อไปนี้:

```typescript
import { PrismaClient } from '../app/generated/prisma/client'

const prisma = new PrismaClient()

const PTT_API_URL = 'https://www.pttor.com/wp-admin/admin-ajax.php'
const BACKFILL_START = { year: 2026, month: 5 } // พค 2026

interface PriceEntry {
  OilTypeId: string
  Price: number
  PriceDate: string
}

interface DayRecord {
  priceDate: string
  year: number
  month: number
  day: number
  priceData: PriceEntry[]
}

interface PTTResponse {
  success: boolean
  data: DayRecord[]
}

async function fetchOilPrices(month: number, yearCE: number): Promise<DayRecord[]> {
  const yearBE = yearCE + 543
  const body = new URLSearchParams({
    action: 'fetch_oil_prices',
    province: 'กรุงเทพมหานคร',
    month: String(month),
    year: String(yearBE),
  })

  const res = await fetch(PTT_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'origin': 'https://www.pttor.com',
      'referer': 'https://www.pttor.com/th/oil_price',
      'user-agent': 'Mozilla/5.0',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    throw new Error(`PTT API HTTP error: ${res.status}`)
  }

  const json = (await res.json()) as PTTResponse

  if (!json.success) {
    throw new Error(`PTT API returned success=false for month=${month} year=${yearCE}`)
  }

  return json.data
}

async function syncMonth(month: number, yearCE: number): Promise<{ created: number; updated: number }> {
  const records = await fetchOilPrices(month, yearCE)

  let created = 0
  let updated = 0

  for (const day of records) {
    const dieselEntry = day.priceData.find((p) => p.OilTypeId === 'ดีเซล')
    if (!dieselEntry) continue

    // ตัด time ออก เก็บแค่วันที่ (priceDate format: "2026-05-30T05:00")
    const effectiveDate = new Date(day.priceDate.split('T')[0] + 'T00:00:00.000Z')

    const existing = await prisma.fuelPriceLog.findUnique({
      where: { effectiveDate },
    })

    await prisma.fuelPriceLog.upsert({
      where: { effectiveDate },
      update: {
        pricePerLiter: dieselEntry.Price,
        note: 'auto-sync from PTT',
      },
      create: {
        effectiveDate,
        pricePerLiter: dieselEntry.Price,
        note: 'auto-sync from PTT',
      },
    })

    if (existing) {
      updated++
    } else {
      created++
    }
  }

  return { created, updated }
}

async function main() {
  const isBackfill = process.argv.includes('--backfill')
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth() + 1

  if (isBackfill) {
    console.log(`[sync-fuel-price] backfill mode: ${BACKFILL_START.year}-${BACKFILL_START.month} → ${currentYear}-${currentMonth}`)

    let totalCreated = 0
    let totalUpdated = 0

    let year = BACKFILL_START.year
    let month = BACKFILL_START.month

    while (year < currentYear || (year === currentYear && month <= currentMonth)) {
      console.log(`[sync-fuel-price] syncing ${year}-${String(month).padStart(2, '0')}...`)
      const { created, updated } = await syncMonth(month, year)
      console.log(`[sync-fuel-price]   created=${created} updated=${updated}`)
      totalCreated += created
      totalUpdated += updated

      month++
      if (month > 12) {
        month = 1
        year++
      }
    }

    console.log(`[sync-fuel-price] backfill complete: total created=${totalCreated} updated=${totalUpdated}`)
  } else {
    console.log(`[sync-fuel-price] normal mode: ${currentYear}-${String(currentMonth).padStart(2, '0')}`)
    const { created, updated } = await syncMonth(currentMonth, currentYear)
    console.log(`[sync-fuel-price] done: created=${created} updated=${updated}`)
  }
}

main()
  .catch((err) => {
    console.error('[sync-fuel-price] ERROR:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 3: ทดสอบ script รันได้โดยไม่ crash (dry run)**

```bash
npx tsx scripts/sync-fuel-price.ts --help 2>&1 || true
```

Expected: ไม่มี TypeScript compile error (script จะรันแล้วออกปกติ หรือ throw เพราะ DATABASE_URL ไม่มี)

- [ ] **Step 4: ทดสอบกับ staging DB**

```bash
make dev  # copy .env.stag → .env.local
npx tsx scripts/sync-fuel-price.ts --backfill
```

Expected output ประมาณ:
```
[sync-fuel-price] backfill mode: 2026-5 → 2026-6
[sync-fuel-price] syncing 2026-05...
[sync-fuel-price]   created=8 updated=0
[sync-fuel-price] syncing 2026-06...
[sync-fuel-price]   created=X updated=0
[sync-fuel-price] backfill complete: total created=X updated=0
```

- [ ] **Step 5: ตรวจข้อมูลใน DB**

```bash
npx prisma studio
```

เปิด `FuelPriceLog` table ตรวจว่า:
- `effectiveDate` ไม่ซ้ำกัน
- `pricePerLiter` มีค่าสมเหตุสมผล (แถว 39–43 บาท สำหรับ พค 2026)
- `note` เป็น `"auto-sync from PTT"` ทุก record

- [ ] **Step 6: ทดสอบ idempotent — รัน normal mode ซ้ำ 2 ครั้ง**

```bash
npx tsx scripts/sync-fuel-price.ts
npx tsx scripts/sync-fuel-price.ts
```

Expected: ครั้งที่สองต้องได้ `created=0 updated=N` (ไม่สร้าง record ใหม่)

- [ ] **Step 7: Commit**

```bash
git add scripts/sync-fuel-price.ts
git commit -m "feat: add PTT fuel price auto-sync script"
```

---

### Task 2: เพิ่ม DO Scheduled Job ใน `.do/app.yaml`

**Files:**
- Modify: `.do/app.yaml`

- [ ] **Step 1: เพิ่ม jobs section ต่อท้าย `.do/app.yaml`**

เปิดไฟล์ `.do/app.yaml` (ปัจจุบันมีแค่ `services` section) แล้วเพิ่มต่อท้าย:

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

ไฟล์สมบูรณ์จะหน้าตาแบบนี้:

```yaml
name: syl-transport-system
services:
  - name: web
    source_dir: /
    github:
      repo: notyburin27/syl-system
      branch: main
    build_command: npm install && npm run build
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    routes:
      - path: /
    health_check:
      http_path: /health
    envs:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "8080"
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

- [ ] **Step 2: Commit**

```bash
git add .do/app.yaml
git commit -m "feat: add DO scheduled job for PTT fuel price sync"
```

---

### Task 3: Deployment และ Backfill ครั้งแรก

**Files:** ไม่มีไฟล์เพิ่ม — ทำผ่าน DO Console

- [ ] **Step 1: Push และรอ DO build**

```bash
git push origin main
```

รอ DO App Platform build เสร็จ (ประมาณ 3-5 นาที) — Job component `sync-fuel-price` จะปรากฏใน DO Console

- [ ] **Step 2: ตั้งค่า DATABASE_URL secret ใน DO Console**

1. เปิด DO Console → Apps → syl-transport-system
2. ไปที่ Settings → sync-fuel-price (Job) → Environment Variables
3. เพิ่ม `DATABASE_URL` แบบ **Encrypted** โดย copy ค่าจาก `.env.prod`

- [ ] **Step 3: รัน backfill ครั้งแรกผ่าน DO Console**

1. ไปที่ DO Console → Apps → syl-transport-system → Jobs → sync-fuel-price
2. คลิก **"Run Job"**
3. Override run command เป็น: `npx tsx scripts/sync-fuel-price.ts --backfill`
4. คลิก Run

- [ ] **Step 4: ตรวจ log ของ backfill job**

ใน DO Console → Jobs → sync-fuel-price → ดู log ของ run ล่าสุด

Expected:
```
[sync-fuel-price] backfill mode: 2026-5 → 2026-6
...
[sync-fuel-price] backfill complete: total created=X updated=0
```

ตรวจว่า exit code = 0 (Job status = "Succeeded")

- [ ] **Step 5: ตรวจ cron schedule**

ใน DO Console ตรวจว่า Job แสดง schedule `0 23 * * *` และ "Next run" เป็นเวลาที่ถูกต้อง
