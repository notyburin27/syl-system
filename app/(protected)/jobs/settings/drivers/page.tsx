import { auth } from '@/lib/auth'
import DriverManager from '@/components/jobs/DriverManager'

export default async function DriversPage() {
  const session = await auth()
  const isAdmin = (session?.user as { role?: string })?.role === 'ADMIN'
  return <DriverManager isAdmin={isAdmin} />
}
