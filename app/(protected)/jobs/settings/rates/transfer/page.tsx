import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { App } from 'antd'
import RateTransferManager from '@/components/jobs/RateTransferManager'

export default async function RateTransferPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  if (!isAdmin) redirect('/jobs')

  return (
    <App>
      <RateTransferManager />
    </App>
  )
}
