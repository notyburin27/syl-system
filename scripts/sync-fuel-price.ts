import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: {
      rejectUnauthorized: false,
    },
  })
  return new PrismaClient({ adapter })
}

const prisma = createPrismaClient()

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
    signal: AbortSignal.timeout(15_000),
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

async function syncMonth(month: number, yearCE: number): Promise<{ count: number }> {
  const records = await fetchOilPrices(month, yearCE)

  let count = 0

  for (const day of records) {
    const dieselEntry = day.priceData.find((p) => p.OilTypeId === 'ดีเซล')
    if (!dieselEntry) {
      console.warn(`[sync-fuel-price] no diesel entry for ${day.priceDate} — available types: ${day.priceData.map(p => p.OilTypeId).join(', ')}`)
      continue
    }

    // Stored as UTC midnight so the DATE column always yields the correct calendar date
    const effectiveDate = new Date(day.priceDate.split('T')[0] + 'T00:00:00.000Z')

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

    count++
  }

  if (count === 0) {
    console.warn(`[sync-fuel-price] WARNING: no diesel data found for ${yearCE}-${String(month).padStart(2, '0')}`)
  }

  return { count }
}

async function main() {
  const isBackfill = process.argv.includes('--backfill')
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth() + 1

  if (isBackfill) {
    console.log(`[sync-fuel-price] backfill mode: ${BACKFILL_START.year}-${BACKFILL_START.month} → ${currentYear}-${currentMonth}`)

    let totalCount = 0

    let year = BACKFILL_START.year
    let month = BACKFILL_START.month

    while (year < currentYear || (year === currentYear && month <= currentMonth)) {
      console.log(`[sync-fuel-price] syncing ${year}-${String(month).padStart(2, '0')}...`)
      const { count } = await syncMonth(month, year)
      console.log(`[sync-fuel-price]   upserted=${count}`)
      totalCount += count

      month++
      if (month > 12) {
        month = 1
        year++
      }
    }

    console.log(`[sync-fuel-price] backfill complete: total upserted=${totalCount}`)
  } else {
    console.log(`[sync-fuel-price] normal mode: ${currentYear}-${String(currentMonth).padStart(2, '0')}`)
    const { count } = await syncMonth(currentMonth, currentYear)
    console.log(`[sync-fuel-price] done: upserted=${count}`)
  }
}

main()
  .catch((err) => {
    console.error('[sync-fuel-price] ERROR:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
