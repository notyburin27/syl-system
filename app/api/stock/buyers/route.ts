import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/buyers - List buyers with outstanding amounts
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const buyers = await prisma.buyer.findMany({
      include: {
        stockOuts: {
          select: { sellingPrice: true, quantity: true, invoiceId: true },
        },
        invoices: {
          where: { isPaid: false },
          select: { totalAmount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = buyers.map(({ stockOuts, invoices, ...buyer }) => {
      // ยอมค้าง = รายการที่ยังไม่ออกใบเสร็จ + ใบเสร็จที่ยังไม่จ่าย
      const uninvoiced = stockOuts
        .filter(so => so.invoiceId === null)
        .reduce((sum, so) => sum + so.sellingPrice * so.quantity, 0)
      const unpaidInvoices = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0)

      return {
        ...buyer,
        outstandingAmount: uninvoiced + unpaidInvoices,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching buyers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/stock/buyers - Create buyer
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, phone } = body

    if (!name) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อลูกค้า' }, { status: 400 })
    }

    const buyer = await prisma.buyer.create({
      data: { name, phone: phone || null },
    })

    return NextResponse.json(buyer)
  } catch (error) {
    console.error('Error creating buyer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
