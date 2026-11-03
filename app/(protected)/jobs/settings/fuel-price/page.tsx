import { requireSettingsPage } from '@/lib/utils/roleGuard'
import { App } from 'antd'
import FuelPriceLogManager from '@/components/jobs/FuelPriceLogManager'

export default async function FuelPricePage() {
  await requireSettingsPage('/jobs/settings/fuel-price')

  return (
    <App>
      <FuelPriceLogManager />
    </App>
  )
}
