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
  const userName = session.user?.name || session.user?.username || 'User'

  return (
    <ProtectedLayoutClient userName={userName} isAdmin={isAdmin}>
      {children}
    </ProtectedLayoutClient>
  )
}
