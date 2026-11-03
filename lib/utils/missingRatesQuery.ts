// DB layer ของหน้าค่าที่ยังขาด — server only (import prisma / towingAbsorb)
import type { Prisma } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { isAbsorbPickupName, isAbsorbedBy, type AbsorbJob } from '@/lib/utils/towingAbsorb'
import {
  fuelPriceAt, groupMissing, incomeForRate, incomeKey, pickCustomerRanges, rateSizeOf, wageKey,
  type MissingJobInput, type MissingRatesData,
} from '@/lib/utils/missingRates'

type Db = Prisma.TransactionClient | typeof prisma

export function monthBounds(month: string): { start: Date; end: Date } {
  const start = new Date(`${month}-01T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  return { start, end }
}

const hasLink = (j: { pairLinkAsPrimary: { id: string } | null; pairLinkAsSecondary: { id: string } | null }) =>
  !!j.pairLinkAsPrimary || !!j.pairLinkAsSecondary

// mirror ของขั้น "ดูดซับทอยตู้" ใน app/api/jobs/prefill-rates/route.ts (ต้นแบบที่ถูกต้อง) — แก้สองที่พร้อมกัน
/** id ของทอยตู้ที่ขั้น "ดูดซับทอยตู้" (prefill-rates) จะดูดซับในเดือนนี้ แต่ยังไม่ได้ถูกดูดซับ */
export async function wouldBeAbsorbedIds(month: string, tx?: Prisma.TransactionClient): Promise<Set<string>> {
  const db: Db = tx ?? prisma
  const { start, end } = monthBounds(month)
  const monthJobs = await db.job.findMany({
    where: {
      jobDate: { gte: start, lt: end },
      isCancelled: false,
      clearStatus: false,
      jobType: { in: ['inbound', 'outbound', 'towing', 'towingHeavy'] },
    },
    select: {
      id: true, jobDate: true, jobType: true, size: true, driverId: true, customerId: true,
      createdAt: true, isCancelled: true, clearStatus: true, isTowingAbsorbed: true,
      pickupLocation: { select: { name: true } },
      pairLinkAsPrimary: { select: { id: true } },
      pairLinkAsSecondary: { select: { id: true } },
    },
  })
  const toAbsorbJob = (j: (typeof monthJobs)[number]): AbsorbJob => ({
    id: j.id, jobDate: j.jobDate, jobType: j.jobType, size: j.size, driverId: j.driverId,
    customerId: j.customerId, createdAt: j.createdAt, isCancelled: j.isCancelled,
    clearStatus: j.clearStatus, hasPairLink: hasLink(j),
  })
  const absorbers = monthJobs
    .filter((j) => (j.jobType === 'inbound' || j.jobType === 'outbound') && isAbsorbPickupName(j.pickupLocation?.name))
    .map(toAbsorbJob)
  const ids = new Set<string>()
  for (const j of monthJobs) {
    if (j.jobType !== 'towing' && j.jobType !== 'towingHeavy') continue
    if (j.isTowingAbsorbed || hasLink(j)) continue
    const tj = toAbsorbJob(j)
    if (absorbers.some((m) => isAbsorbedBy(tj, m))) ids.add(j.id)
  }
  return ids
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

async function loadFuelLogs(db: Db) {
  const logs = await db.fuelPriceLog.findMany({ orderBy: { effectiveDate: 'desc' } })
  return logs.map((l) => ({ effectiveDate: l.effectiveDate, pricePerLiter: Number(l.pricePerLiter) }))
}

export async function loadMissingRates(month: string): Promise<MissingRatesData> {
  const { start, end } = monthBounds(month)
  const [jobs, incomeRates, wageRates, fuelLogs, absorbedIds] = await Promise.all([
    prisma.job.findMany({
      where: {
        jobDate: { gte: start, lt: end },
        isCancelled: false,
        jobType: { notIn: ['advance', 'noJob'] },
        OR: [{ income: null }, { driverWage: null }],
      },
      select: {
        id: true, jobNumber: true, jobDate: true, jobType: true, size: true,
        customerId: true, factoryLocationId: true, income: true, driverWage: true,
        isCancelled: true, isTowingAbsorbed: true,
        customer: { select: { name: true } },
        factoryLocation: { select: { name: true } },
        driver: { select: { name: true, vehicleNumber: true } },
        pairLinkAsPrimary: { select: { id: true } },
        pairLinkAsSecondary: { select: { id: true } },
      },
    }),
    prisma.rateIncome.findMany({
      select: {
        jobType: true, size: true, factoryLocationId: true, customerId: true, updatedAt: true,
        fuelSurcharges: { select: { fuelPriceMin: true, fuelPriceMax: true } },
      },
    }),
    prisma.rateDriverWage.findMany({ select: { jobType: true, size: true, factoryLocationId: true } }),
    loadFuelLogs(prisma),
    wouldBeAbsorbedIds(month),
  ])

  const inputs: MissingJobInput[] = jobs.map((j) => ({
    id: j.id, jobNumber: j.jobNumber, jobDate: iso(j.jobDate),
    jobType: j.jobType, size: j.size,
    customerId: j.customerId, customerName: j.customer?.name ?? null,
    factoryLocationId: j.factoryLocationId, factoryName: j.factoryLocation?.name ?? null,
    driverName: j.driver?.name ?? null, vehicleNumber: j.driver?.vehicleNumber ?? null,
    income: j.income === null ? null : Number(j.income),
    driverWage: j.driverWage === null ? null : Number(j.driverWage),
    isCancelled: j.isCancelled,
    isTowingAbsorbed: j.isTowingAbsorbed || absorbedIds.has(j.id),
    pairRole: j.pairLinkAsPrimary ? 'primary' : j.pairLinkAsSecondary ? 'secondary' : null,
    fuelPrice: fuelPriceAt(fuelLogs, j.jobDate),
  }))

  const custRates = incomeRates.map((r) => ({
    customerId: r.customerId, jobType: r.jobType, updatedAt: r.updatedAt,
    ranges: r.fuelSurcharges.map((s) => ({ fuelPriceMin: Number(s.fuelPriceMin), fuelPriceMax: Number(s.fuelPriceMax) })),
  }))

  return groupMissing({
    month,
    jobs: inputs,
    incomeRateKeys: new Set(incomeRates.map((r) => incomeKey(r.jobType, r.size, r.factoryLocationId, r.customerId))),
    wageRateKeys: new Set(wageRates.map((r) => wageKey(r.jobType, r.size, r.factoryLocationId))),
    customerRanges: (customerId, jobType) => pickCustomerRanges(custRates, customerId, jobType),
  })
}

export async function fillIncomeGroup(
  tx: Prisma.TransactionClient,
  month: string,
  key: { jobType: string; size: string; factoryLocationId: string; customerId: string },
): Promise<number> {
  if (key.jobType === 'towing') return 0 // ทอยไม่มีค่าขนส่ง
  const rateRow = await tx.rateIncome.findUnique({
    where: {
      jobType_size_factoryLocationId_customerId: {
        jobType: key.jobType, size: key.size, factoryLocationId: key.factoryLocationId, customerId: key.customerId,
      },
    },
    include: { fuelSurcharges: true },
  })
  if (!rateRow) return 0
  const rate = {
    income: Number(rateRow.income),
    surcharges: rateRow.fuelSurcharges.map((s) => ({
      fuelPriceMin: Number(s.fuelPriceMin), fuelPriceMax: Number(s.fuelPriceMax), surcharge: Number(s.surcharge),
    })),
  }
  const { start, end } = monthBounds(month)
  const [jobs, logs] = await Promise.all([
    tx.job.findMany({
      where: {
        jobDate: { gte: start, lt: end },
        jobType: key.jobType,
        factoryLocationId: key.factoryLocationId,
        customerId: key.customerId,
        income: null,
        isCancelled: false,
        pairLinkAsSecondary: null,
      },
      select: { id: true, jobDate: true, size: true, pairLinkAsPrimary: { select: { id: true } } },
    }),
    loadFuelLogs(tx),
  ])
  const idsByIncome = new Map<number, string[]>()
  for (const j of jobs) {
    if (rateSizeOf(j.size, j.pairLinkAsPrimary ? 'primary' : null) !== key.size) continue
    const income = incomeForRate(rate, fuelPriceAt(logs, j.jobDate))
    const list = idsByIncome.get(income)
    if (list) list.push(j.id)
    else idsByIncome.set(income, [j.id])
  }
  let filled = 0
  for (const [income, ids] of idsByIncome) {
    const r = await tx.job.updateMany({ where: { id: { in: ids }, income: null }, data: { income } })
    filled += r.count
  }
  return filled
}

export async function fillWageGroup(
  tx: Prisma.TransactionClient,
  month: string,
  key: { jobType: string; size: string; factoryLocationId: string | null },
): Promise<number> {
  // unique ที่มี NULL ใช้ findUnique ไม่ได้
  const rateRow = await tx.rateDriverWage.findFirst({
    where: { jobType: key.jobType, size: key.size, factoryLocationId: key.factoryLocationId },
  })
  if (!rateRow) return 0
  const driverWage = Number(rateRow.driverWage)
  const { start, end } = monthBounds(month)
  const [jobs, absorbed] = await Promise.all([
    tx.job.findMany({
      where: {
        jobDate: { gte: start, lt: end },
        jobType: key.jobType,
        factoryLocationId: key.factoryLocationId,
        driverWage: null,
        isCancelled: false,
        isTowingAbsorbed: false,
        pairLinkAsSecondary: null,
      },
      select: { id: true, size: true, pairLinkAsPrimary: { select: { id: true } } },
    }),
    wouldBeAbsorbedIds(month, tx),
  ])
  const ids = jobs
    .filter((j) => !absorbed.has(j.id) && rateSizeOf(j.size, j.pairLinkAsPrimary ? 'primary' : null) === key.size)
    .map((j) => j.id)
  if (ids.length === 0) return 0
  const r = await tx.job.updateMany({ where: { id: { in: ids }, driverWage: null }, data: { driverWage } })
  return r.count
}
