import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/stock/export/[id]/deliver - Mark as delivered
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const stockOut = await prisma.stockOut.update({
      where: { id },
      data: {
        isDelivered: true,
        deliveredAt: new Date(),
      },
      include: {
        product: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(stockOut)
  } catch (error) {
    console.error('Error marking as delivered:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
