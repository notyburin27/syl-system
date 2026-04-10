import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { App } from 'antd'
import RateDriverWageManager from '@/components/jobs/RateDriverWageManager'

export default async function RateDriverWagePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  if (!isAdmin) redirect('/jobs')

  return (
    <App>
      <RateDriverWageManager />
    </App>
  )
}
