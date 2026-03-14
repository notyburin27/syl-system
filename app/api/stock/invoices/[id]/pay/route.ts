import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/stock/invoices/[id]/pay - Mark invoice as paid
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        isPaid: true,
        paidAt: new Date(),
      },
      include: {
        buyer: { select: { id: true, name: true } },
        stockOuts: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error marking invoice as paid:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
