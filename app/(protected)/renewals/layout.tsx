import { redirect } from 'next/navigation'
import { App } from 'antd'
import { auth } from '@/lib/auth'
import { isRenewalRole } from '@/lib/renewals/constants'

// guard ชั้นที่สอง (ชั้นแรกคือ middleware) — กันกรณีถอด JWT ใน middleware ไม่ได้
export default async function RenewalsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isRenewalRole(session.user.role)) redirect('/jobs')
  return <App>{children}</App>
}
