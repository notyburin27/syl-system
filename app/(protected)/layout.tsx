import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProtectedLayoutClient from '@/components/ProtectedLayoutClient'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  const isAdmin = session.user?.role === 'ADMIN'
  const isManager = session.user?.role === 'MANAGER'
  const isSeniorStaff = session.user?.role === 'SENIOR_STAFF'
  const userName = session.user?.name || session.user?.username || 'User'
  const userRole = session.user?.role || 'USER'

  return (
    <ProtectedLayoutClient
      userName={userName}
      isAdmin={isAdmin}
      isManager={isManager}
      isSeniorStaff={isSeniorStaff}
      userRole={userRole}
    >
      {children}
    </ProtectedLayoutClient>
  )
}
