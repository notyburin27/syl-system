import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/invoices - List invoices (optionally filtered by buyerId)
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const buyerId = searchParams.get('buyerId')

    const where: Record<string, unknown> = {}
    if (buyerId) where.buyerId = buyerId

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        buyer: { select: { id: true, name: true } },
        stockOuts: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/stock/invoices - Create invoice from selected stock outs
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { buyerId, stockOutIds, note } = body as {
      buyerId: string
      stockOutIds: string[]
      note?: string
    }

    if (!buyerId || !stockOutIds || stockOutIds.length === 0) {
      return NextResponse.json({ error: 'กรุณาเลือกรายการขาย' }, { status: 400 })
    }

    const invoice = await prisma.$transaction(async (tx) => {
      // Verify all stock outs belong to this buyer and are uninvoiced
      const stockOuts = await tx.stockOut.findMany({
        where: {
          id: { in: stockOutIds },
          buyerId,
          invoiceId: null,
        },
      })

      if (stockOuts.length !== stockOutIds.length) {
        throw new Error('บางรายการไม่ถูกต้องหรือออกใบเสร็จแล้ว')
      }

      const totalAmount = stockOuts.reduce(
        (sum, so) => sum + so.sellingPrice * so.quantity,
        0
      )

      const newInvoice = await tx.invoice.create({
        data: {
          buyerId,
          totalAmount,
          note: note || null,
        },
      })

      await tx.stockOut.updateMany({
        where: { id: { in: stockOutIds } },
        data: { invoiceId: newInvoice.id },
      })

      return tx.invoice.findUnique({
        where: { id: newInvoice.id },
        include: {
          buyer: { select: { id: true, name: true } },
          stockOuts: {
            include: {
              product: { select: { id: true, name: true } },
            },
          },
        },
      })
    })

    return NextResponse.json(invoice)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    if (errorMessage.includes('ไม่ถูกต้อง')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    console.error('Error creating invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
