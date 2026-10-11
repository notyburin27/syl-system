import type { DashboardItemDto } from '@/types/renewals'
import type { CoverageTypeKey, DueBucket } from './constants'
import { normalizePlate } from './plate'

export interface DashboardFilters {
  type: CoverageTypeKey | 'ALL'
  owner?: string
  status?: 'PENDING' | 'IN_PROGRESS'
  q?: string
}

export interface DashboardSummary {
  buckets: Record<DueBucket, number>
  inProgress: number
  byType: Record<CoverageTypeKey | 'ALL', number>
  totals: { amount: number; serviceFee: number }
}

/** ignoreType ใช้นับตัวเลขบนแท็บ (ตัวกรองอื่นยังมีผล) */
export function filterDashboardItems(
  items: DashboardItemDto[],
  filters: DashboardFilters,
  options: { ignoreType?: boolean } = {},
): DashboardItemDto[] {
  const q = filters.q ? normalizePlate(filters.q).toLowerCase() : ''
  return items.filter((item) => {
    if (!options.ignoreType && filters.type !== 'ALL' && item.type !== filters.type) return false
    if (filters.owner && item.vehicle.ownerName !== filters.owner) return false
    if (filters.status && item.renewalStatus !== filters.status) return false
    if (
      q &&
      !item.vehicle.plate.toLowerCase().includes(q) &&
      !(item.vehicle.fleetNumber ?? '').toLowerCase().includes(q)
    ) {
      return false
    }
    return true
  })
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function summarizeDashboard(items: DashboardItemDto[]): DashboardSummary {
  const summary: DashboardSummary = {
    buckets: { OVERDUE: 0, THIS_MONTH: 0, NEXT_MONTH: 0, LATER: 0 },
    inProgress: 0,
    byType: { ALL: 0, PRB: 0, TAX: 0, MOTOR_INSURANCE: 0, CARGO_INSURANCE: 0 },
    totals: { amount: 0, serviceFee: 0 },
  }
  for (const item of items) {
    summary.buckets[item.bucket]++
    if (item.renewalStatus === 'IN_PROGRESS') summary.inProgress++
    summary.byType.ALL++
    summary.byType[item.type]++
    summary.totals.amount = round2(summary.totals.amount + (item.amount ?? 0))
    summary.totals.serviceFee = round2(summary.totals.serviceFee + (item.serviceFee ?? 0))
  }
  return summary
}
