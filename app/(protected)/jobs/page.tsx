import { auth } from '@/lib/auth'
import DriverJobList from '@/components/jobs/DriverJobList'

export default async function JobsPage() {
  const session = await auth()
  const isAdmin = (session?.user as { role?: string })?.role === 'ADMIN'
  return <DriverJobList isAdmin={isAdmin} />
}
