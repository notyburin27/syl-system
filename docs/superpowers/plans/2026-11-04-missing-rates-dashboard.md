# Dashboard ค่าที่ยังขาด (เดือนก่อนหน้า) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้า `/jobs/settings/rates/missing` แสดงงานเดือนก่อนหน้าที่ยังไม่มีค่าขนส่ง/ค่าเที่ยว รวมเป็นกลุ่มตาม key อัตรา ให้ตั้งอัตรา (ค่าขนส่งแบบช่วงเดี่ยวที่ระบบแนะนำ) หรือกดเติม แล้วเติมค่าให้งานในกลุ่มทันที

**Architecture:** pure logic (จัดกลุ่ม, แนะนำช่วงน้ำมัน, คำนวณ income, เดือนก่อนหน้า) อยู่ใน `lib/utils/missingRates.ts` มี unit test ; ชั้น DB (`lib/utils/missingRatesQuery.ts`) โหลดงาน/อัตรา และเติมค่าแบบเจาะกลุ่ม ; API ใหม่ 4 ตัวใต้ `/api/rates/missing` ; UI client component เดียวพร้อม modal 2 ตัว ; ไม่เปลี่ยน schema และไม่แตะ `/api/jobs/prefill-rates`

**Tech Stack:** Next.js 15 App Router, Prisma v6 (client ที่ `app/generated/prisma`), antd v5, `node:test` ผ่าน `npm run test:unit` (tsx), Playwright

**Spec:** `docs/superpowers/specs/2026-11-04-missing-rates-dashboard-design.md`

## Global Constraints

- ข้อความ UI / error ภาษาไทย ; คำตอบผู้ใช้ภาษาไทย
- สิทธิ์ **ADMIN เท่านั้น**: เพิ่ม `export const ADMIN_ROLES: readonly string[] = ['ADMIN']` ใน `lib/settingsNav.ts` ; API ใหม่ทุกตัว `const denied = await requireApiRoles(ADMIN_ROLES); if (denied) return denied;` (`lib/utils/roleGuard.ts`)
- หน้าใหม่: `await requireSettingsPage('/jobs/settings/rates/missing')` แล้วครอบ `<App>` เหมือน `app/(protected)/jobs/settings/rates/income/page.tsx`
- เดือนเป้าหมายคำนวณฝั่ง server เสมอ (client ส่งเดือนไม่ได้) ; ช่วงเดือน `[YYYY-MM-01T00:00:00.000Z, เดือนถัดไป)` เหมือน prefill-rates
- เติมเฉพาะช่องที่ยัง `null` — ห้ามทับค่าเดิม ; สร้างอัตรา + เติม อยู่ใน `prisma.$transaction` เดียว
- key ซ้ำ → 409 `{ error: 'มีข้อมูลนี้อยู่แล้ว' }`
- `<Table size="small">` ทุกตัว ; `App.useApp().message` ; ห้าม `Popconfirm` ; ห้าม `data-testid` บน `<Modal>` (ใช้ `getByRole('dialog')`) ; Button/InputNumber ใส่ `data-testid` ได้ตรง
- ไม่เปลี่ยน `prisma/schema.prisma` ; ห้ามรัน `make migrate-*`
- ก่อนแก้ symbol เดิม (เช่น `SETTINGS_GROUPS`) รัน `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .` ; ก่อน commit รัน `node .gitnexus/run.cjs detect-changes --scope staged --repo .`
- Commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- E2E: `npx playwright test e2e/jobs/missing-rates.spec.ts --workers=1` (docker `syl-e2e-db` ต้องรันอยู่)

## Review Focus

1. **ใบหลักของงานจับคู่ size 20DC** — ต้องหาอัตรา/จัดกลุ่มด้วย 2x20DC และ fill ต้องเลือกใบที่ `rateSize` ตรง key ไม่ใช่ `size` ดิบ (Task 1 test `groupMissing: ใบหลักจับคู่ใช้ 2x20DC`, Task 2 fill กรองด้วย `rateSizeOf`)
2. **ราคาน้ำมันตรงขอบช่วงพอดี (42.01)** — ต้องตกช่วง `42.01–44.01` (min รวม, max ไม่รวม) และ float ต้องไม่เพี้ยน (Task 1 test `defaultFuelRange: ขอบช่วง`)
3. **ทอยตู้ที่ยังไม่ผ่านขั้นดูดซับ** — ต้องไม่โผล่เป็น "ไม่มีค่าเที่ยว" และไม่ถูกเติม (Task 2 `wouldBeAbsorbedIds`, Task 5 Case 6)
4. **job ไม่มีราคาน้ำมัน** — ต้องไม่หายจาก suggestion; modal ต้องให้กรอกราคาฐาน และ fill ได้ราคาฐาน (Task 1 test `suggestIncomeRanges: ไม่มีราคาน้ำมัน`, Task 1 `buildIncomeRateData: basePrice`)
5. **กดบันทึกซ้ำ / มีคนสร้างอัตราไปแล้ว** — ต้องได้ 409 ไม่สร้างซ้ำ ไม่เติมซ้ำ (Task 3 ตรวจ `findUnique` ภายใน transaction ก่อน create)
6. **ช่วงที่ผู้ใช้ส่งมาทับกัน / ราคาติดลบ / ว่าง** — 400 พร้อมข้อความ (Task 1 test `validateIncomeInput`)

---

## File Structure

| File | หน้าที่ |
|---|---|
| `lib/utils/missingRates.ts` (new) | pure: types, `previousMonth`, key builders, `rateSizeOf`, `fuelPriceAt`, `defaultFuelRange`, `pickCustomerRanges`, `suggestIncomeRanges`, `buildIncomeRateData`, `incomeForRate`, `validateIncomeInput`, `groupMissing` |
| `lib/utils/__tests__/missingRates.test.ts` (new) | unit tests |
| `lib/utils/missingRatesQuery.ts` (new) | DB: `monthBounds`, `loadMissingRates`, `fillIncomeGroup`, `fillWageGroup` |
| `app/api/rates/missing/route.ts` (new) | GET dashboard data |
| `app/api/rates/missing/income/route.ts` (new) | POST สร้าง RateIncome จากช่วง + เติม |
| `app/api/rates/missing/driver-wage/route.ts` (new) | POST สร้าง RateDriverWage + เติม |
| `app/api/rates/missing/fill/route.ts` (new) | POST เติมจากอัตราที่มี |
| `lib/settingsNav.ts` | เพิ่มหน้า "ค่าที่ยังขาด" ในกลุ่ม "อัตรา" |
| `app/(protected)/jobs/settings/rates/missing/page.tsx` (new) | server page |
| `components/jobs/MissingRatesDashboard.tsx` (new) | การ์ด + Segmented + ตาราง + modal รายการงาน |
| `components/jobs/MissingRateModals.tsx` (new) | `MissingIncomeRateModal`, `MissingWageRateModal` |
| `e2e/scripts/seed-missing-rates.ts`, `e2e/scripts/cleanup-missing-rates.ts` (new) | seed/cleanup |
| `e2e/jobs/missing-rates.spec.ts` (new) | E2E |

---

### Task 1: Pure logic `lib/utils/missingRates.ts`

**Files:**
- Create: `lib/utils/missingRates.ts`
- Test: `lib/utils/__tests__/missingRates.test.ts`

**Interfaces:**
- Consumes: `getPairedSize`, `isTowingJobType` จาก `@/types/job`
- Produces (export ทั้งหมด):

```ts
export interface FuelRange { fuelPriceMin: number; fuelPriceMax: number }
export interface PricedRange extends FuelRange { price: number }
export type MissingStatus = 'noRate' | 'hasRate' | 'incomplete'
export type MissingField = 'customer' | 'factory' | 'size'

export interface MissingJobInput {
  id: string; jobNumber: string; jobDate: string /* YYYY-MM-DD */
  jobType: string; size: string | null
  customerId: string | null; customerName: string | null
  factoryLocationId: string | null; factoryName: string | null
  driverName: string | null; vehicleNumber: string | null
  income: number | null; driverWage: number | null
  isCancelled: boolean; isTowingAbsorbed: boolean
  pairRole: 'primary' | 'secondary' | null
  fuelPrice: number | null   // ราคาน้ำมัน ณ วันงาน (query layer ใส่ให้)
}
export interface MissingJobView { id; jobNumber; jobDate; driverName; vehicleNumber; fuelPrice: number | null }

export interface IncomeGroup {
  key: string; status: MissingStatus; missingFields: MissingField[]
  jobType: string; size: string | null   // size = rateSize
  customerId: string | null; customerName: string | null
  factoryLocationId: string | null; factoryName: string | null
  jobs: MissingJobView[]
  fuelPriceMin: number | null; fuelPriceMax: number | null
  suggestedRanges: FuelRange[]; hasMissingFuelPrice: boolean
}
export interface WageGroup {
  key: string; status: MissingStatus; missingFields: MissingField[]
  jobType: string; size: string | null
  factoryLocationId: string | null; factoryName: string | null
  jobs: MissingJobView[]
}
export interface MissingRatesData { month: string; income: IncomeGroup[]; driverWage: WageGroup[] }

export function previousMonth(now: Date): string                  // 'YYYY-MM' ตามเวลา Asia/Bangkok (UTC+7)
export function incomeKey(jobType: string, size: string, factoryLocationId: string, customerId: string): string  // `${jobType}|${size}|${factoryLocationId}|${customerId}`
export function wageKey(jobType: string, size: string, factoryLocationId: string | null): string               // `${jobType}|${size}|${factoryLocationId ?? ''}`
export function rateSizeOf(size: string | null, pairRole: 'primary' | 'secondary' | null): string | null       // primary → getPairedSize(size) ?? size
export function fuelPriceAt(logsDesc: { effectiveDate: Date; pricePerLiter: number }[], jobDate: Date): number | null
export function defaultFuelRange(price: number): FuelRange
export function pickCustomerRanges(rates: { customerId: string; jobType: string; updatedAt: Date; ranges: FuelRange[] }[], customerId: string, jobType: string): FuelRange[] | null
export function suggestIncomeRanges(prices: (number | null)[], customerRanges: FuelRange[] | null): { ranges: FuelRange[]; hasMissingFuelPrice: boolean }
export function buildIncomeRateData(ranges: PricedRange[], basePrice: number | null): { income: number; surcharges: { fuelPriceMin: number; fuelPriceMax: number; surcharge: number }[] }
export function incomeForRate(rate: { income: number; surcharges: { fuelPriceMin: number; fuelPriceMax: number; surcharge: number }[] }, fuelPrice: number | null): number
export function validateIncomeInput(ranges: PricedRange[], basePrice: number | null): string | null  // null = ผ่าน
export function groupMissing(input: {
  month: string; jobs: MissingJobInput[]
  incomeRateKeys: Set<string>; wageRateKeys: Set<string>
  customerRanges: (customerId: string, jobType: string) => FuelRange[] | null
}): MissingRatesData
```

กฎ (จาก spec):
- `defaultFuelRange`: ขั้นละ 2 บาท ขอบ `.01` ที่เลขคู่ คำนวณเป็นสตางค์จำนวนเต็มกัน float: `c = Math.round(price*100); k = Math.floor((c-1)/200); min = (k*200+1)/100; max = (k*200+201)/100`
- `pickCustomerRanges`: เฉพาะอัตราที่ `ranges.length > 0` ของลูกค้านั้น ; jobType เดียวกันก่อน ไม่มีค่อยใช้ jobType ใดก็ได้ ; ในกลุ่มที่เลือกเอา `updatedAt` ล่าสุด ; ไม่มีเลย → `null`
- `suggestIncomeRanges`: ต่อราคา (ไม่ null) หาช่วงใน `customerRanges` ที่ `min <= p < max` ไม่เจอหรือไม่มีตาราง → `defaultFuelRange(p)` ; unique, เรียง min น้อยไปมาก ; มี null → `hasMissingFuelPrice: true`
- `buildIncomeRateData`: `income = basePrice ?? min(price)` ; surcharge = `price - income` ปัด 2 ตำแหน่ง
- `incomeForRate`: `income + surcharge ของช่วงแรกที่ min <= p < max` ; p null หรือไม่ตก → `income`
- `validateIncomeInput` ข้อความ: ไม่มีทั้งช่วงและ basePrice → `กรุณากรอกราคา` ; ราคาใดไม่ใช่ตัวเลข finite หรือ < 0 → `ราคาต้องไม่ติดลบ` ; `min >= max` → `ช่วงราคาน้ำมันไม่ถูกต้อง` ; ช่วงทับกัน (หลังเรียง `prev.max > next.min`) → `ช่วงราคาน้ำมันทับกัน`
- `groupMissing` การนับ: ข้าม `isCancelled`, `jobType` ∈ {`advance`,`noJob`}, `pairRole === 'secondary'`
  - income: `income === null` และ `jobType !== 'towing'` ; ขาด customer/factory/rateSize → `incomplete` + `missingFields` (ลำดับ customer, factory, size) ; key ครบ → `hasRate` ถ้า `incomeRateKeys.has(key)` ไม่งั้น `noRate`
  - wage: `driverWage === null` และ `!isTowingAbsorbed` ; ขาด rateSize หรือ (`!isTowingJobType && !factoryLocationId`) → `incomplete` ; key = `wageKey(jobType, rateSize, factoryLocationId)`
  - กลุ่ม incomplete จัดกลุ่มด้วย `incomplete|${jobType}|${size ?? ''}|${factoryLocationId ?? ''}|${customerId ?? ''}` (ค่าเที่ยวไม่ใช้ customer)
  - `suggestedRanges`/`hasMissingFuelPrice` คำนวณเฉพาะกลุ่ม `noRate` (กลุ่มอื่น `[]`, `false`) ; `fuelPriceMin/Max` = min/max ของราคาน้ำมัน job ที่ไม่ null
  - jobs ในกลุ่มเรียงตาม `jobDate` ; กลุ่มเรียง: status (`noRate`, `hasRate`, `incomplete`) แล้วจำนวน job มากไปน้อย แล้วชื่อลูกค้า/โรงงาน

- [ ] **Step 1: เขียน test (ล้มก่อน)** — ใช้ `node:test` + `assert/strict` แบบ `lib/utils/__tests__/towingAbsorb.test.ts` พร้อม helper `job(over)` คืน `MissingJobInput` ค่า default (outbound, 20DC, customer `c1`, factory `f1`, income/driverWage null) อย่างน้อยต้องมี:

```ts
test('previousMonth: ตามเวลาไทย', () => {
  assert.equal(previousMonth(new Date('2026-11-04T03:00:00Z')), '2026-10')
  assert.equal(previousMonth(new Date('2026-01-15T00:00:00Z')), '2025-12')
  assert.equal(previousMonth(new Date('2026-10-31T18:00:00Z')), '2026-10') // = 1 พ.ย. 01:00 น. ไทย
  assert.equal(previousMonth(new Date('2026-10-31T16:00:00Z')), '2026-09') // = 31 ต.ค. 23:00 น. ไทย
})
test('defaultFuelRange: ขั้น 2 บาท', () => {
  assert.deepEqual(defaultFuelRange(41.44), { fuelPriceMin: 40.01, fuelPriceMax: 42.01 })
  assert.deepEqual(defaultFuelRange(43.54), { fuelPriceMin: 42.01, fuelPriceMax: 44.01 })
})
test('defaultFuelRange: ขอบช่วง', () => {
  assert.deepEqual(defaultFuelRange(42.01), { fuelPriceMin: 42.01, fuelPriceMax: 44.01 })
  assert.deepEqual(defaultFuelRange(42.0), { fuelPriceMin: 40.01, fuelPriceMax: 42.01 })
})
test('suggestIncomeRanges: ครอบทุก job ไม่ซ้ำ เรียง', () => {
  assert.deepEqual(suggestIncomeRanges([43.54, 41.44, 42.19, 41.44], null), {
    ranges: [{ fuelPriceMin: 40.01, fuelPriceMax: 42.01 }, { fuelPriceMin: 42.01, fuelPriceMax: 44.01 }],
    hasMissingFuelPrice: false,
  })
})
test('suggestIncomeRanges: ใช้ตารางของลูกค้า และ fallback เมื่อนอกตาราง', () => {
  const table = [{ fuelPriceMin: 41.01, fuelPriceMax: 42.01 }, { fuelPriceMin: 42.01, fuelPriceMax: 43.01 }]
  assert.deepEqual(suggestIncomeRanges([41.44, 55], table).ranges,
    [{ fuelPriceMin: 41.01, fuelPriceMax: 42.01 }, { fuelPriceMin: 54.01, fuelPriceMax: 56.01 }])
})
test('suggestIncomeRanges: ไม่มีราคาน้ำมัน', () => {
  assert.deepEqual(suggestIncomeRanges([null], null), { ranges: [], hasMissingFuelPrice: true })
})
test('pickCustomerRanges: jobType เดียวกันก่อน แล้วล่าสุด', () => { /* 3 rates: c1/outbound เก่า, c1/outbound ใหม่, c1/inbound ใหม่สุด → ได้ ranges ของ c1/outbound ใหม่ ; jobType ไม่ตรงเลย → ได้ c1/inbound ; c2 → null */ })
test('buildIncomeRateData: ราคาต่ำสุดเป็นฐาน', () => {
  assert.deepEqual(buildIncomeRateData([
    { fuelPriceMin: 42.01, fuelPriceMax: 44.01, price: 6300 },
    { fuelPriceMin: 40.01, fuelPriceMax: 42.01, price: 6000 },
  ], null), { income: 6000, surcharges: [
    { fuelPriceMin: 42.01, fuelPriceMax: 44.01, surcharge: 300 },
    { fuelPriceMin: 40.01, fuelPriceMax: 42.01, surcharge: 0 },
  ] })
})
test('buildIncomeRateData: basePrice', () => {
  assert.equal(buildIncomeRateData([{ fuelPriceMin: 40.01, fuelPriceMax: 42.01, price: 6000 }], 5800).surcharges[0].surcharge, 200)
  assert.deepEqual(buildIncomeRateData([], 5800), { income: 5800, surcharges: [] })
})
test('incomeForRate', () => {
  const rate = { income: 6000, surcharges: [{ fuelPriceMin: 42.01, fuelPriceMax: 44.01, surcharge: 300 }] }
  assert.equal(incomeForRate(rate, 43.54), 6300)
  assert.equal(incomeForRate(rate, 42.01), 6300)
  assert.equal(incomeForRate(rate, 44.01), 6000)
  assert.equal(incomeForRate(rate, null), 6000)
})
test('validateIncomeInput', () => {
  assert.equal(validateIncomeInput([], null), 'กรุณากรอกราคา')
  assert.equal(validateIncomeInput([{ fuelPriceMin: 40.01, fuelPriceMax: 42.01, price: -1 }], null), 'ราคาต้องไม่ติดลบ')
  assert.equal(validateIncomeInput([{ fuelPriceMin: 42.01, fuelPriceMax: 40.01, price: 1 }], null), 'ช่วงราคาน้ำมันไม่ถูกต้อง')
  assert.equal(validateIncomeInput([
    { fuelPriceMin: 40.01, fuelPriceMax: 42.5, price: 1 }, { fuelPriceMin: 42.01, fuelPriceMax: 44.01, price: 1 },
  ], null), 'ช่วงราคาน้ำมันทับกัน')
  assert.equal(validateIncomeInput([{ fuelPriceMin: 40.01, fuelPriceMax: 42.01, price: 6000 }], null), null)
})
```

  test ของ `groupMissing` (ชื่อ test ตามนี้):
  - `groupMissing: ข้ามยกเลิก/เบิก/ไม่มีงาน/ใบรอง` → ทั้งสองฝั่งว่าง
  - `groupMissing: ทอยตู้ปกติไม่นับค่าขนส่งแต่นับค่าเที่ยว` → towing ไม่มีใน `income`, อยู่ใน `driverWage` (ไม่มีโรงงานก็ไม่ incomplete) ; `towingHeavy` นับทั้งสอง
  - `groupMissing: ทอยที่ถูกดูดซับไม่นับค่าเที่ยว`
  - `groupMissing: ใบหลักจับคู่ใช้ 2x20DC` → group.size `'2x20DC'`, key `incomeKey('outbound','2x20DC','f1','c1')`
  - `groupMissing: รวมกลุ่มตาม key และแนะนำช่วง` → 2 job ราคา 41.44 / 43.54 กลุ่มเดียว `jobs.length 2`, `suggestedRanges` 2 ช่วง, `fuelPriceMin 41.44`, `fuelPriceMax 43.54`
  - `groupMissing: hasRate เมื่อมีอัตราตรง key` → `status 'hasRate'`, `suggestedRanges []`
  - `groupMissing: incomplete ระบุช่องที่ขาด` → customerId null + factory null → `missingFields ['customer','factory']`
  - `groupMissing: job ที่มีค่าแล้วไม่ถูกนับ` → income 5000 ไม่อยู่ฝั่ง income แต่ยังอยู่ฝั่ง wage ถ้า driverWage null

- [ ] **Step 2: รัน `npx tsx --test lib/utils/__tests__/missingRates.test.ts`** — Expected: FAIL (module ไม่มี)
- [ ] **Step 3: implement `lib/utils/missingRates.ts`** ตาม Interfaces และกฎด้านบน
- [ ] **Step 4: รัน test ไฟล์นี้ แล้ว `npm run test:unit`** — Expected: PASS ทั้งหมด
- [ ] **Step 5: Commit** `feat(missing-rates): pure logic จัดกลุ่มค่าที่ยังขาดและแนะนำช่วงน้ำมัน`

---

### Task 2: DB layer `lib/utils/missingRatesQuery.ts` + GET API

**Files:**
- Create: `lib/utils/missingRatesQuery.ts`, `app/api/rates/missing/route.ts`
- Modify: `lib/settingsNav.ts` — เพิ่ม `export const ADMIN_ROLES: readonly string[] = ['ADMIN']` (ยังไม่เพิ่มเมนู)

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1 ; `prisma` จาก `@/lib/prisma` ; type `Prisma.TransactionClient` จาก `@/app/generated/prisma/client` (ดูการ import ที่ไฟล์อื่นใช้)
- Produces:

```ts
export function monthBounds(month: string): { start: Date; end: Date }
export async function loadMissingRates(month: string): Promise<MissingRatesData>
export async function fillIncomeGroup(tx: Prisma.TransactionClient, month: string,
  key: { jobType: string; size: string; factoryLocationId: string; customerId: string }): Promise<number>  // จำนวน job ที่เติม
export async function fillWageGroup(tx: Prisma.TransactionClient, month: string,
  key: { jobType: string; size: string; factoryLocationId: string | null }): Promise<number>
```

- `loadMissingRates`: query job ในเดือน `isCancelled false`, `jobType notIn [advance, noJob]`, `OR [{income null},{driverWage null}]` select ฟิลด์ที่ `MissingJobInput` ต้องใช้ (customer.name, factoryLocation.name, driver.name/vehicleNumber, `pairLinkAsPrimary {id}`, `pairLinkAsSecondary {id}` → pairRole) ; โหลด `rateIncome` (select key + updatedAt + fuelSurcharges), `rateDriverWage`, `fuelPriceLog` เรียง `effectiveDate desc` ; แปลง Decimal → number ; `jobDate` → `toISOString().slice(0,10)` ; ส่ง `customerRanges` = closure ของ `pickCustomerRanges`
- **ทอยที่จะถูกดูดซับ**: โหลดงานเดือนนั้นแบบเดียวกับขั้น "ดูดซับทอยตู้" ใน `app/api/jobs/prefill-rates/route.ts` (monthJobs: ไม่ยกเลิก, `clearStatus false`, jobType ∈ inbound/outbound/towing/towingHeavy, `pickupLocation.name`, pair links) ; absorbers = inbound/outbound ที่ `isAbsorbPickupName(pickupLocation.name)` ; ทอยที่ `!isTowingAbsorbed && !hasPairLink && absorbers.some(m => isAbsorbedBy(tj, m))` → ใส่ `isTowingAbsorbed: true` ใน `MissingJobInput` ที่ส่งให้ `groupMissing` ; แยกเป็น helper `wouldBeAbsorbedIds(month, tx?): Promise<Set<string>>` ในไฟล์นี้ ใช้ทั้ง load และ `fillWageGroup` (fill ข้าม id ในเซ็ตนี้) — **ห้าม** import `towingAbsorb.ts` ใน `missingRates.ts` เพราะไฟล์นั้น import prisma และ `missingRates.ts` ถูก import ฝั่ง client
- `fillIncomeGroup`: หา rate ด้วย `findUnique` key (ไม่เจอ → 0) ; ดึง job เดือนนั้นที่ jobType/factory/customer ตรง, `income null`, `isCancelled false`, `pairLinkAsSecondary null`, jobType ≠ towing ; กรองใน JS ด้วย `rateSizeOf(size, pairRole) === key.size` ; income = `incomeForRate(rate, fuelPriceAt(logs, jobDate))` ; `tx.job.update` ทีละใบ (ใส่ `where: { id, income: null }` ผ่าน `updateMany` เพื่อกันทับ) ; คืนจำนวนที่อัปเดต
- `fillWageGroup`: แบบเดียวกัน — `driverWage null`, `isTowingAbsorbed false`, ไม่อยู่ใน `wouldBeAbsorbedIds`, `factoryLocationId` ตรง (null ได้), ใช้ `rate.driverWage`
- GET route: `requireApiRoles(ADMIN_ROLES)` → `NextResponse.json(await loadMissingRates(previousMonth(new Date())))` ; catch → 500 `เกิดข้อผิดพลาด`

- [ ] **Step 1: implement `monthBounds` + `loadMissingRates` + `fillIncomeGroup` + `fillWageGroup`**
- [ ] **Step 2: implement GET route**
- [ ] **Step 3: `npx tsc --noEmit -p .`** — Expected: ไม่มี error ในไฟล์ใหม่
- [ ] **Step 4: Commit** `feat(missing-rates): query และ GET /api/rates/missing`

(ตรวจพฤติกรรม DB จริงใน E2E Task 5)

---

### Task 3: POST APIs (สร้างอัตรา + เติม, เติมจากอัตราที่มี)

**Files:**
- Create: `app/api/rates/missing/income/route.ts`, `app/api/rates/missing/driver-wage/route.ts`, `app/api/rates/missing/fill/route.ts`

**Interfaces:**
- Consumes: `validateIncomeInput`, `buildIncomeRateData`, `previousMonth` (Task 1) ; `fillIncomeGroup`, `fillWageGroup` (Task 2)
- Produces (request/response ที่ UI ใช้):
  - `POST /api/rates/missing/income` body `{ jobType, size, factoryLocationId, customerId, ranges: PricedRange[], basePrice: number | null }` → 201 `{ filled: number }`
  - `POST /api/rates/missing/driver-wage` body `{ jobType, size, factoryLocationId: string | null, driverWage: number }` → 201 `{ filled }`
  - `POST /api/rates/missing/fill` body `{ kind: 'income', jobType, size, factoryLocationId, customerId } | { kind: 'driverWage', jobType, size, factoryLocationId: string | null }` → 200 `{ filled }`

ทุก route:
- key ไม่ครบ (income: ทั้ง 4 ; wage: jobType+size, factory ต้องมีถ้าไม่ใช่ทอย) → 400 `กรุณากรอกข้อมูลให้ครบ`
- income: `validateIncomeInput` ไม่ผ่าน → 400 ข้อความนั้น ; wage: `driverWage` ไม่ใช่ตัวเลข ≥ 0 → 400 `ค่าเที่ยวต้องไม่ติดลบ`
- `prisma.$transaction(async tx => { ... })`: `findUnique`/`findFirst` key ก่อน → มี → throw/return 409 `มีข้อมูลนี้อยู่แล้ว` ; `tx.rateIncome.create({ data: { ...key, income, fuelSurcharges: { create: surcharges } } })` / `tx.rateDriverWage.create` ; แล้ว `fill*Group(tx, previousMonth(new Date()), key)`
- fill route: ไม่มีอัตรา → 404 `ไม่พบอัตรา`
- จับ Prisma `P2002` (unique ชน) → 409 ข้อความเดียวกัน ; อื่นๆ → 500 `เกิดข้อผิดพลาด`

- [ ] **Step 1: implement 3 routes**
- [ ] **Step 2: `npx tsc --noEmit -p .`** — Expected: ไม่มี error ในไฟล์ใหม่
- [ ] **Step 3: Commit** `feat(missing-rates): API ตั้งอัตราจากหน้าค่าที่ยังขาดแล้วเติมงาน`

---

### Task 4: หน้า UI + เมนู

**Files:**
- Modify: `lib/settingsNav.ts` (กลุ่ม `'อัตรา'` เพิ่มท้าย `{ href: '/jobs/settings/rates/missing', label: 'ค่าที่ยังขาด', roles: ADMIN_ROLES }` — `ADMIN_ROLES` ถูกสร้างใน Task 2)
- Create: `app/(protected)/jobs/settings/rates/missing/page.tsx`, `components/jobs/MissingRatesDashboard.tsx`, `components/jobs/MissingRateModals.tsx`

**Interfaces:**
- Consumes: types `MissingRatesData`, `IncomeGroup`, `WageGroup`, `PricedRange` (Task 1) ; APIs (Task 2–3) ; `getJobTypeLabel` จาก `@/types/job` ; รูปแบบวันที่ไทยจาก `lib/utils/thaiDate.ts` (ดูว่ามี helper ไหนที่ FuelSegmentsView ใช้)
- Produces (testid ที่ E2E ใช้):
  - การ์ด: `missing-card-income`, `missing-card-wage`, `missing-card-hasrate`, `missing-card-incomplete` (ค่าตัวเลขอยู่ใน `Statistic` ภายใน — E2E ใช้ `toContainText`)
  - ปุ่มในแถว: `missing-setup-btn`, `missing-fill-btn`, `missing-jobs-btn`
  - modal ค่าขนส่ง: InputNumber `missing-range-price-0`, `missing-range-price-1`, ... , `missing-base-price` (แสดงเมื่อ `hasMissingFuelPrice`) ; modal ค่าเที่ยว: `missing-wage-input` ; ปุ่มบันทึกคือ OK ของ Modal ข้อความ `บันทึก`

รายละเอียดหน้าจอตาม spec หัวข้อ "หน้าจอ":
- หัว `ค่าที่ยังขาด · <ชื่อเดือนไทย> <ปี พ.ศ.>` + ปุ่ม `รีเฟรช`
- การ์ด 4 ใบ (จำนวน **job**): ไม่มีค่าขนส่ง (income noRate), ไม่มีค่าเที่ยว (wage noRate), มีอัตราแล้ว ยังไม่เติม (hasRate ทั้งสองฝั่ง), ข้อมูลไม่ครบ (incomplete ทั้งสองฝั่ง)
- Segmented หลัก `ค่าขนส่ง (n กลุ่ม)` / `ค่าเที่ยว (n กลุ่ม)` ; Segmented ย่อย `ทั้งหมด` / `ไม่มีอัตรา` / `มีอัตราแล้ว` / `ข้อมูลไม่ครบ`
- ตารางค่าขนส่ง: ลูกค้า | โรงงาน | ลักษณะงาน | SIZE | จำนวน job (`missing-jobs-btn` "N งาน") | ราคาน้ำมัน (`41.44–43.54`, เท่ากันแสดงค่าเดียว, null แสดง `-`) | สถานะ (Tag: noRate orange `ไม่มีอัตรา`, hasRate blue `มีอัตราแล้ว`, incomplete gold `ข้อมูลไม่ครบ`) | action ชิดขวา
- ตารางค่าเที่ยว: โรงงาน (null → `—`) | ลักษณะงาน | SIZE | จำนวน job | สถานะ | action
- action: noRate → `ตั้งค่า` ; hasRate → `เติมเลย` (loading ระหว่างเรียก) ; incomplete → `<Typography.Text type="warning">job กรอกข้อมูลไม่ครบ (ไม่มี ลูกค้า/โรงงาน/SIZE)</Typography.Text>` เฉพาะช่องที่ขาด
- modal รายการงาน (ปุ่ม N งาน): Table small — เลขงาน, วันที่, คนขับ, เบอร์รถ, ราคาน้ำมัน
- ไม่มีกลุ่มเลยทั้งสองฝั่ง → `<Empty description="งานเดือนนี้มีค่าครบแล้ว" />`
- `MissingIncomeRateModal` props `{ group: IncomeGroup | null; onClose(): void; onSaved(filled: number): void }` — หัวกลุ่ม, ตาราง `ราคาน้ำมัน min – max` | `จำนวน job` (นับ job ในช่วง) | InputNumber ราคา (required ทุกช่อง) ; ถ้า `hasMissingFuelPrice` แสดง Alert warning `มี N งานที่ไม่มีราคาน้ำมัน ณ วันงาน — ใช้ราคาฐาน` + `missing-base-price` (required) ; POST แล้ว `message.success(\`บันทึกและเติมค่าขนส่ง ${filled} งาน\`)` ; error แสดง `message.error(error)`
- `MissingWageRateModal` props `{ group: WageGroup | null; onClose; onSaved }` — InputNumber `missing-wage-input` ; success `บันทึกและเติมค่าเที่ยว ${filled} งาน`
- `เติมเลย` success `เติมค่า ${filled} งาน` ; ทุก success → refetch

- [ ] **Step 1: GitNexus impact `SETTINGS_GROUPS`** แล้วเพิ่ม entry
- [ ] **Step 2: page + components**
- [ ] **Step 3: `npx tsc --noEmit -p .` และ `npm run lint`** — Expected: ไม่มี error ในไฟล์ใหม่/ไฟล์ที่แก้
- [ ] **Step 4: Commit** `feat(missing-rates): หน้า dashboard ค่าที่ยังขาด`

---

### Task 5: E2E

**Files:**
- Create: `e2e/scripts/seed-missing-rates.ts`, `e2e/scripts/cleanup-missing-rates.ts`, `e2e/jobs/missing-rates.spec.ts`

**Interfaces:**
- Consumes: testid จาก Task 4 ; รูปแบบ seed/cleanup/login จาก `e2e/scripts/seed-fuel-summary.ts` และ `e2e/summary/fuel-standard-summary.spec.ts`

Seed (`MISSING_MONTH=YYYY-MM` = `dayjs().subtract(1,'month')`, ชื่อทุกอย่างขึ้นต้น `E2E_MISS_`):
- customer `E2E_MISS_C1` ; locations factory `E2E_MISS_F1`, `E2E_MISS_F2` ; driver `E2E_MISS Driver` vehicleNumber `MISS-01`
- fuel_price_log: วันที่ 1 ของเดือน = 41.44, วันที่ 20 = 43.54 (`note: 'E2E_MISS'`, upsert ตาม effectiveDate)
- J1 outbound 20DC C1/F1 วันที่ 5 ; J2 outbound 20DC C1/F1 วันที่ 25 → กลุ่ม noRate ค่าขนส่ง 2 ช่วง + กลุ่ม noRate ค่าเที่ยว
- J3 inbound 40DC C1/F2 วันที่ 10 + `rateIncome` (inbound, 40DC, F2, C1, income 4000, ไม่มี surcharge) + `rateDriverWage` (inbound, 40DC, F2, 350) → กลุ่ม hasRate ทั้งสองฝั่ง
- J4 outbound 20DC C1 ไม่มีโรงงาน วันที่ 12 → incomplete
- cleanup: ลบ job ของ driver นั้น, rate ของ customer/location `E2E_MISS_%`, fuel log `note = 'E2E_MISS'`, customer/location/driver

Cases (`test.describe.serial`, beforeEach cleanup+seed, afterEach cleanup, login `testadmin`):
1. `Case 1: ตั้งค่าค่าขนส่งแบบช่วงเดี่ยวแล้วเติมงาน` — แถว `E2E_MISS_F1` ฝั่งค่าขนส่งแสดง `41.44–43.54` ; กด `ตั้งค่า` → dialog มีช่วง `40.01 – 42.01` และ `42.01 – 44.01` ; กรอก 6000 / 6300 → บันทึก → message `บันทึกและเติมค่าขนส่ง 2 งาน` ; DB (query ด้วย prisma ใน spec หรือ script) J1.income = 6000, J2.income = 6300 ; แถวหายจากกลุ่ม noRate
2. `Case 2: ตั้งค่าค่าเที่ยวแล้วเติมงาน` — Segmented `ค่าเที่ยว` → แถว F1 `ตั้งค่า` → 500 → `บันทึกและเติมค่าเที่ยว 2 งาน`
3. `Case 3: เติมเลยจากอัตราที่มีอยู่` — แถว F2 `เติมเลย` → `เติมค่า 1 งาน` ; J3.income = 4000
4. `Case 4: งานข้อมูลไม่ครบแสดงข้อความแทนปุ่ม` — มีข้อความ `job กรอกข้อมูลไม่ครบ (ไม่มี โรงงาน)`
5. `Case 5: MANAGER เข้าหน้านี้ไม่ได้` — login `testmanager` (role MANAGER จาก `e2e/scripts/seed.ts`) เปิด `/jobs/settings/rates/missing` แล้วถูก redirect ไป `/jobs` และเมนู `ค่าที่ยังขาด` ไม่แสดง
6. `Case 6: ทอยที่จะถูกดูดซับไม่อยู่ในค่าเที่ยว` — seed เพิ่ม J5 towing 20DC C1 วันที่ 15 (สร้างก่อน) + J6 outbound 20DC C1/F1 วันที่ 15 pickup location `คาหาง` (upsert ตามชื่อ — cleanup ห้ามลบถ้ามีอยู่ก่อน ; สร้าง job หลัง, driverWage 500, income 5000) ; ฝั่งค่าเที่ยวต้องไม่มีกลุ่ม towing 20DC

- [ ] **Step 1: seed + cleanup scripts**
- [ ] **Step 2: spec**
- [ ] **Step 3: `npx playwright test e2e/jobs/missing-rates.spec.ts --workers=1`** — Expected: 6 passed (แก้โค้ด Task 2–4 ถ้า fail เพราะ bug จริง)
- [ ] **Step 4: `npx playwright test e2e/jobs/settings-access.spec.ts e2e/jobs/settings.spec.ts --workers=1`** — Expected: pass (เมนูใหม่ไม่ทำของเดิมพัง ; "อัตราค่าเที่ยวคนขับ Case 1" ใน settings.spec เป็น flaky ที่รู้อยู่แล้วเมื่อรันต่อจาก test อื่น)
- [ ] **Step 5: `npm run build`** — Expected: สำเร็จ
- [ ] **Step 6: Commit** `test(missing-rates): e2e หน้าค่าที่ยังขาด`
