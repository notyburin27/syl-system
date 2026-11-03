import { Suspense } from 'react'
import dayjs from 'dayjs'
import { App } from 'antd'
import { requirePageRoles } from '@/lib/utils/roleGuard'
import { RATE_ROLES } from '@/lib/settingsNav'
import FuelSegmentsView from '@/components/summary/FuelSegmentsView'

interface Props {
  params: Promise<{ driverId: string }>
  searchParams: Promise<{ month?: string }>
}

export default async function DriverFuelSegmentsPage({ params, searchParams }: Props) {
  await requirePageRoles(RATE_ROLES)
  const { driverId } = await params
  const { month } = await searchParams
  const validMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : dayjs().subtract(1, 'month').format('YYYY-MM')

  return (
    <Suspense>
      <App>
        <FuelSegmentsView driverId={driverId} month={validMonth} />
      </App>
    </Suspense>
  )
}
