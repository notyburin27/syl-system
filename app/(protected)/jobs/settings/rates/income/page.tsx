import { requireSettingsPage } from '@/lib/utils/roleGuard'
import { App } from 'antd'
import RateIncomeManager from '@/components/jobs/RateIncomeManager'

export default async function RateIncomePage() {
  await requireSettingsPage('/jobs/settings/rates/income')

  return (
    <App>
      <RateIncomeManager />
    </App>
  )
}
