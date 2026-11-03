import { requireSettingsPage } from '@/lib/utils/roleGuard'
import { App } from 'antd'
import RateTransferManager from '@/components/jobs/RateTransferManager'

export default async function RateTransferPage() {
  await requireSettingsPage('/jobs/settings/rates/transfer')

  return (
    <App>
      <RateTransferManager />
    </App>
  )
}
