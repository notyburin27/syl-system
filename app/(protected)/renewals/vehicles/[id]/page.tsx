import VehicleDetail from '@/components/renewals/VehicleDetail'

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <VehicleDetail id={id} />
}
