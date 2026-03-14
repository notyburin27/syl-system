import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/invoices/[id] - Invoice detail
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        buyer: { select: { id: true, name: true } },
        stockOuts: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'ไม่พบใบเสร็จ' }, { status: 404 })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error fetching invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/stock/invoices/[id] - Delete invoice (unlink stock outs)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const invoice = await prisma.invoice.findUnique({ where: { id } })
    if (!invoice) {
      return NextResponse.json({ error: 'ไม่พบใบเสร็จ' }, { status: 404 })
    }

    if (invoice.isPaid) {
      return NextResponse.json({ error: 'ไม่สามารถลบใบเสร็จที่ชำระแล้ว' }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.stockOut.updateMany({
        where: { invoiceId: id },
        data: { invoiceId: null },
      }),
      prisma.invoice.delete({ where: { id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
