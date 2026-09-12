import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SummaryDriverList from '@/components/summary/SummaryDriverList'

export default async function SummaryPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    redirect('/jobs')
  }
  return (
    <Suspense>
      <SummaryDriverList />
    </Suspense>
  )
}
