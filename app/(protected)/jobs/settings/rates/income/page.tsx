import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { App } from 'antd'
import RateIncomeManager from '@/components/jobs/RateIncomeManager'

export default async function RateIncomePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  if (!isAdmin) redirect('/jobs')

  return (
    <App>
      <RateIncomeManager />
    </App>
  )
}
