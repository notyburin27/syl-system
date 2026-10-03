import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { App } from 'antd'
import FuelStandardManager from '@/components/jobs/FuelStandardManager'

export default async function FuelStandardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  if (!isAdmin) redirect('/jobs')

  return (
    <App>
      <FuelStandardManager />
    </App>
  )
}
