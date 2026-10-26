import { requireSettingsPage } from '@/lib/utils/roleGuard'
import { App } from 'antd'
import HolidayManager from '@/components/jobs/HolidayManager'

export default async function HolidaysPage() {
  await requireSettingsPage('/jobs/settings/holidays')

  return (
    <App>
      <HolidayManager />
    </App>
  )
}
