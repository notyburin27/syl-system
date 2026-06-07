import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { App } from 'antd'
import HolidayManager from '@/components/jobs/HolidayManager'

export default async function HolidaysPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (role !== 'ADMIN' && role !== 'MANAGER') redirect('/jobs')

  return (
    <App>
      <HolidayManager />
    </App>
  )
}
