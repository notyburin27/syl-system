import { requireSettingsPage } from '@/lib/utils/roleGuard'
import { App } from 'antd'
import RateDriverWageManager from '@/components/jobs/RateDriverWageManager'

export default async function RateDriverWagePage() {
  await requireSettingsPage('/jobs/settings/rates/driver-wage')

  return (
    <App>
      <RateDriverWageManager />
    </App>
  )
}
