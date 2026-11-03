import { requireSettingsPage } from '@/lib/utils/roleGuard'
import { App } from 'antd'
import MissingRatesDashboard from '@/components/jobs/MissingRatesDashboard'

export default async function MissingRatesPage() {
  await requireSettingsPage('/jobs/settings/rates/missing')

  return (
    <App>
      <MissingRatesDashboard />
    </App>
  )
}
