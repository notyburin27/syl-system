import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/buyers/[id] - Buyer detail with stats
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const buyer = await prisma.buyer.findUnique({
      where: { id },
      include: {
        stockOuts: {
          select: { sellingPrice: true, quantity: true, invoiceId: true },
        },
        invoices: {
          select: { totalAmount: true, isPaid: true },
        },
      },
    })

    if (!buyer) {
      return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 })
    }

    const { stockOuts, invoices, ...rest } = buyer

    const totalPurchased = stockOuts.reduce((sum, so) => sum + so.sellingPrice * so.quantity, 0)
    const uninvoiced = stockOuts
      .filter(so => so.invoiceId === null)
      .reduce((sum, so) => sum + so.sellingPrice * so.quantity, 0)
    const unpaidInvoices = invoices
      .filter(inv => !inv.isPaid)
      .reduce((sum, inv) => sum + inv.totalAmount, 0)
    const paidInvoices = invoices
      .filter(inv => inv.isPaid)
      .reduce((sum, inv) => sum + inv.totalAmount, 0)

    return NextResponse.json({
      ...rest,
      totalPurchased,
      outstandingAmount: uninvoiced + unpaidInvoices,
      paidAmount: paidInvoices,
    })
  } catch (error) {
    console.error('Error fetching buyer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/stock/buyers/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    const buyer = await prisma.buyer.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.phone !== undefined && { phone: body.phone || null }),
      },
    })

    return NextResponse.json(buyer)
  } catch (error) {
    console.error('Error updating buyer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/stock/buyers/[id] - Must have no outstanding
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const buyer = await prisma.buyer.findUnique({
      where: { id },
      include: {
        stockOuts: {
          where: { invoiceId: null },
          select: { id: true },
        },
        invoices: {
          where: { isPaid: false },
          select: { id: true },
        },
      },
    })

    if (!buyer) {
      return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 })
    }

    if (buyer.stockOuts.length > 0) {
      return NextResponse.json(
        { error: 'ไม่สามารถลบได้ ยังมีรายการขายที่ยังไม่ออกใบเสร็จ' },
        { status: 400 }
      )
    }

    if (buyer.invoices.length > 0) {
      return NextResponse.json(
        { error: 'ไม่สามารถลบได้ ยังมียอดค้างชำระ' },
        { status: 400 }
      )
    }

    await prisma.buyer.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting buyer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
