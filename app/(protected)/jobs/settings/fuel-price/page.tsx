import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { App } from 'antd'
import FuelPriceLogManager from '@/components/jobs/FuelPriceLogManager'

export default async function FuelPricePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  if (!isAdmin) redirect('/jobs')

  return (
    <App>
      <FuelPriceLogManager />
    </App>
  )
}
