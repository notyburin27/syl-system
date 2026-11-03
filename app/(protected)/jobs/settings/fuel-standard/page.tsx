import { requireSettingsPage } from '@/lib/utils/roleGuard'
import { App } from 'antd'
import FuelStandardManager from '@/components/jobs/FuelStandardManager'

export default async function FuelStandardPage() {
  await requireSettingsPage('/jobs/settings/fuel-standard')

  return (
    <App>
      <FuelStandardManager />
    </App>
  )
}
