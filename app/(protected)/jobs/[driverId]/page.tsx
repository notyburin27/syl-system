import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import EditableJobTable from '@/components/jobs/EditableJobTable'
import dayjs from 'dayjs'

interface Props {
  params: Promise<{ driverId: string }>
  searchParams: Promise<{ month?: string }>
}

export default async function DriverJobPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { driverId } = await params
  const { month } = await searchParams

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { name: true },
  })

  if (!driver) redirect('/jobs')

  const currentMonth = month || dayjs().format('YYYY-MM')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'

  return (
    <EditableJobTable
      driverId={driverId}
      driverName={driver.name}
      month={currentMonth}
      isAdmin={isAdmin}
    />
  )
}
