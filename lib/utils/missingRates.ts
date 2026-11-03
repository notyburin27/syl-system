// Pure logic: จัดกลุ่มงานที่ยังขาดค่าขนส่ง/ค่าเที่ยว — ห้าม import prisma (ใช้ฝั่ง client ด้วย)
import { getPairedSize, isTowingJobType } from '@/types/job'

export interface FuelRange { fuelPriceMin: number; fuelPriceMax: number }
export interface PricedRange extends FuelRange { price: number }
export type MissingStatus = 'noRate' | 'hasRate' | 'incomplete'
export type MissingField = 'customer' | 'factory' | 'size'

export interface MissingJobInput {
  id: string; jobNumber: string; jobDate: string
  jobType: string; size: string | null
  customerId: string | null; customerName: string | null
  factoryLocationId: string | null; factoryName: string | null
  driverName: string | null; vehicleNumber: string | null
  income: number | null; driverWage: number | null
  isCancelled: boolean; isTowingAbsorbed: boolean
  pairRole: 'primary' | 'secondary' | null
  fuelPrice: number | null
}
export interface MissingJobView {
  id: string; jobNumber: string; jobDate: string
  driverName: string | null; vehicleNumber: string | null
  fuelPrice: number | null
}

export interface IncomeGroup {
  key: string; status: MissingStatus; missingFields: MissingField[]
  jobType: string; size: string | null
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

type Surcharge = { fuelPriceMin: number; fuelPriceMax: number; surcharge: number }

const round2 = (n: number) => Math.round(n * 100) / 100

/** 'YYYY-MM' ของเดือนก่อนหน้า ตามเวลา Asia/Bangkok (UTC+7) */
export function previousMonth(now: Date): string {
  const th = new Date(now.getTime() + 7 * 3600 * 1000)
  let y = th.getUTCFullYear()
  let m = th.getUTCMonth() // 0-based = เดือนก่อนหน้าแบบ 1-based
  if (m === 0) { y -= 1; m = 12 }
  return `${y}-${String(m).padStart(2, '0')}`
}

export function incomeKey(jobType: string, size: string, factoryLocationId: string, customerId: string): string {
  return `${jobType}|${size}|${factoryLocationId}|${customerId}`
}

export function wageKey(jobType: string, size: string, factoryLocationId: string | null): string {
  return `${jobType}|${size}|${factoryLocationId ?? ''}`
}

export function rateSizeOf(size: string | null, pairRole: 'primary' | 'secondary' | null): string | null {
  if (pairRole === 'primary') return getPairedSize(size) ?? size
  return size
}

export function fuelPriceAt(
  logsDesc: { effectiveDate: Date; pricePerLiter: number }[],
  jobDate: Date,
): number | null {
  const hit = logsDesc.find((l) => l.effectiveDate.getTime() <= jobDate.getTime())
  return hit ? hit.pricePerLiter : null
}

export function defaultFuelRange(price: number): FuelRange {
  const c = Math.round(price * 100)
  const k = Math.floor((c - 1) / 200)
  return { fuelPriceMin: (k * 200 + 1) / 100, fuelPriceMax: (k * 200 + 201) / 100 }
}

export function pickCustomerRanges(
  rates: { customerId: string; jobType: string; updatedAt: Date; ranges: FuelRange[] }[],
  customerId: string,
  jobType: string,
): FuelRange[] | null {
  const mine = rates.filter((r) => r.customerId === customerId && r.ranges.length > 0)
  const same = mine.filter((r) => r.jobType === jobType)
  const pool = same.length > 0 ? same : mine
  if (pool.length === 0) return null
  const latest = pool.reduce((a, b) => (b.updatedAt.getTime() > a.updatedAt.getTime() ? b : a))
  return latest.ranges
}

// ช่วง default ของราคา p ที่ตัดไม่ให้ทับช่วงในตารางของลูกค้า (ตารางอาจไม่ตรงขั้น 2 บาท)
function clippedDefaultRange(p: number, table: FuelRange[] | null): FuelRange {
  const d = defaultFuelRange(p)
  if (!table || table.length === 0) return d
  const lows = table.filter((r) => r.fuelPriceMax <= p).map((r) => r.fuelPriceMax)
  const highs = table.filter((r) => r.fuelPriceMin > p).map((r) => r.fuelPriceMin)
  return {
    fuelPriceMin: round2(Math.max(d.fuelPriceMin, ...lows)),
    fuelPriceMax: round2(Math.min(d.fuelPriceMax, ...highs)),
  }
}

export function suggestIncomeRanges(
  prices: (number | null)[],
  customerRanges: FuelRange[] | null,
): { ranges: FuelRange[]; hasMissingFuelPrice: boolean } {
  const seen = new Map<string, FuelRange>()
  let hasMissingFuelPrice = false
  for (const p of prices) {
    if (p === null) { hasMissingFuelPrice = true; continue }
    const found = customerRanges?.find((r) => r.fuelPriceMin <= p && p < r.fuelPriceMax)
    const range = found
      ? { fuelPriceMin: found.fuelPriceMin, fuelPriceMax: found.fuelPriceMax }
      : clippedDefaultRange(p, customerRanges)
    seen.set(`${range.fuelPriceMin}|${range.fuelPriceMax}`, range)
  }
  const ranges = [...seen.values()].sort((a, b) => a.fuelPriceMin - b.fuelPriceMin)
  return { ranges, hasMissingFuelPrice }
}

export function buildIncomeRateData(
  ranges: PricedRange[],
  basePrice: number | null,
): { income: number; surcharges: Surcharge[] } {
  const income = basePrice ?? (ranges.length > 0 ? Math.min(...ranges.map((r) => r.price)) : 0)
  return {
    income,
    surcharges: ranges.map((r) => ({
      fuelPriceMin: r.fuelPriceMin,
      fuelPriceMax: r.fuelPriceMax,
      surcharge: round2(r.price - income),
    })),
  }
}

export function incomeForRate(rate: { income: number; surcharges: Surcharge[] }, fuelPrice: number | null): number {
  if (fuelPrice === null) return rate.income
  const hit = rate.surcharges.find((s) => s.fuelPriceMin <= fuelPrice && fuelPrice < s.fuelPriceMax)
  return hit ? rate.income + hit.surcharge : rate.income
}

export function validateIncomeInput(ranges: PricedRange[], basePrice: number | null): string | null {
  if (ranges.length === 0 && basePrice === null) return 'กรุณากรอกราคา'
  const bad = (n: number) => typeof n !== 'number' || !Number.isFinite(n) || n < 0
  if (basePrice !== null && bad(basePrice)) return 'ราคาต้องไม่ติดลบ'
  for (const r of ranges) {
    if (bad(r.price) || bad(r.fuelPriceMin) || bad(r.fuelPriceMax)) return 'ราคาต้องไม่ติดลบ'
  }
  for (const r of ranges) {
    if (r.fuelPriceMin >= r.fuelPriceMax) return 'ช่วงราคาน้ำมันไม่ถูกต้อง'
  }
  const sorted = [...ranges].sort((a, b) => a.fuelPriceMin - b.fuelPriceMin)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].fuelPriceMax > sorted[i].fuelPriceMin) return 'ช่วงราคาน้ำมันทับกัน'
  }
  return null
}

const STATUS_ORDER: Record<MissingStatus, number> = { noRate: 0, hasRate: 1, incomplete: 2 }

const toView = (j: MissingJobInput): MissingJobView => ({
  id: j.id, jobNumber: j.jobNumber, jobDate: j.jobDate,
  driverName: j.driverName, vehicleNumber: j.vehicleNumber, fuelPrice: j.fuelPrice,
})

const byDate = (a: MissingJobInput, b: MissingJobInput) =>
  a.jobDate < b.jobDate ? -1 : a.jobDate > b.jobDate ? 1 : 0

function cmpGroups(
  a: { status: MissingStatus; jobs: unknown[] }, an: string,
  b: { status: MissingStatus; jobs: unknown[] }, bn: string,
): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || b.jobs.length - a.jobs.length
    || an.localeCompare(bn, 'th')
}

export function groupMissing(input: {
  month: string
  jobs: MissingJobInput[]
  incomeRateKeys: Set<string>
  wageRateKeys: Set<string>
  customerRanges: (customerId: string, jobType: string) => FuelRange[] | null
}): MissingRatesData {
  const counted = input.jobs
    .filter((j) => !j.isCancelled && j.jobType !== 'advance' && j.jobType !== 'noJob' && j.pairRole !== 'secondary')
    .sort(byDate)

  // ---- income ----
  const incomeBuckets = new Map<string, { sample: MissingJobInput; rateSize: string | null; jobs: MissingJobInput[]; status: MissingStatus; missing: MissingField[]; key: string }>()
  for (const j of counted) {
    if (j.income !== null || j.jobType === 'towing') continue
    const rateSize = rateSizeOf(j.size, j.pairRole)
    const missing: MissingField[] = []
    if (!j.customerId) missing.push('customer')
    if (!j.factoryLocationId) missing.push('factory')
    if (!rateSize) missing.push('size')
    let status: MissingStatus
    let key: string
    if (missing.length > 0) {
      status = 'incomplete'
      key = `incomplete|${j.jobType}|${j.size ?? ''}|${j.factoryLocationId ?? ''}|${j.customerId ?? ''}`
    } else {
      key = incomeKey(j.jobType, rateSize!, j.factoryLocationId!, j.customerId!)
      status = input.incomeRateKeys.has(key) ? 'hasRate' : 'noRate'
    }
    const b = incomeBuckets.get(key)
    if (b) b.jobs.push(j)
    else incomeBuckets.set(key, { sample: j, rateSize, jobs: [j], status, missing, key })
  }
  const income: IncomeGroup[] = [...incomeBuckets.values()].map((b) => {
    const prices = b.jobs.map((j) => j.fuelPrice)
    const known = prices.filter((p): p is number => p !== null)
    const sug = b.status === 'noRate'
      ? suggestIncomeRanges(prices, input.customerRanges(b.sample.customerId!, b.sample.jobType))
      : { ranges: [], hasMissingFuelPrice: false }
    return {
      key: b.key, status: b.status, missingFields: b.missing,
      jobType: b.sample.jobType, size: b.status === 'incomplete' ? b.sample.size : b.rateSize,
      customerId: b.sample.customerId, customerName: b.sample.customerName,
      factoryLocationId: b.sample.factoryLocationId, factoryName: b.sample.factoryName,
      jobs: b.jobs.map(toView),
      fuelPriceMin: known.length ? Math.min(...known) : null,
      fuelPriceMax: known.length ? Math.max(...known) : null,
      suggestedRanges: sug.ranges, hasMissingFuelPrice: sug.hasMissingFuelPrice,
    }
  }).sort((a, b) => cmpGroups(a, `${a.customerName ?? ''}${a.factoryName ?? ''}`, b, `${b.customerName ?? ''}${b.factoryName ?? ''}`))

  // ---- driver wage ----
  const wageBuckets = new Map<string, { sample: MissingJobInput; rateSize: string | null; jobs: MissingJobInput[]; status: MissingStatus; missing: MissingField[]; key: string }>()
  for (const j of counted) {
    if (j.driverWage !== null || j.isTowingAbsorbed) continue
    const rateSize = rateSizeOf(j.size, j.pairRole)
    const missing: MissingField[] = []
    if (!j.factoryLocationId && !isTowingJobType(j.jobType)) missing.push('factory')
    if (!rateSize) missing.push('size')
    let status: MissingStatus
    let key: string
    if (missing.length > 0) {
      status = 'incomplete'
      key = `incomplete|${j.jobType}|${j.size ?? ''}|${j.factoryLocationId ?? ''}|`
    } else {
      key = wageKey(j.jobType, rateSize!, j.factoryLocationId)
      status = input.wageRateKeys.has(key) ? 'hasRate' : 'noRate'
    }
    const b = wageBuckets.get(key)
    if (b) b.jobs.push(j)
    else wageBuckets.set(key, { sample: j, rateSize, jobs: [j], status, missing, key })
  }
  const driverWage: WageGroup[] = [...wageBuckets.values()].map((b) => ({
    key: b.key, status: b.status, missingFields: b.missing,
    jobType: b.sample.jobType, size: b.status === 'incomplete' ? b.sample.size : b.rateSize,
    factoryLocationId: b.sample.factoryLocationId, factoryName: b.sample.factoryName,
    jobs: b.jobs.map(toView),
  })).sort((a, b) => cmpGroups(a, a.factoryName ?? '', b, b.factoryName ?? ''))

  return { month: input.month, income, driverWage }
}
