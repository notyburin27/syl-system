import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/buyers/[id]/stock-outs - Uninvoiced stock outs for this buyer
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const stockOuts = await prisma.stockOut.findMany({
      where: {
        buyerId: id,
        invoiceId: null,
      },
      include: {
        product: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(stockOuts)
  } catch (error) {
    console.error('Error fetching buyer stock outs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
