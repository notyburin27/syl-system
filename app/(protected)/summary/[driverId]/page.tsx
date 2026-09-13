import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SummaryDetail from '@/components/summary/SummaryDetail'

export default async function SummaryDetailPage({
  params,
}: {
  params: Promise<{ driverId: string }>
}) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    redirect('/jobs')
  }
  const { driverId } = await params
  return (
    <Suspense>
      <SummaryDetail driverId={driverId} />
    </Suspense>
  )
}
