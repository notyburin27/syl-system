import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isValidDueDay } from '@/lib/utils/dueDate'

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
          select: { totalAmount: true, dueDate: true },
        },
      },
    })

    const result = buyers.map(({ stockOuts, invoices, ...buyer }) => {
      // ยอมค้าง = รายการที่ยังไม่ออกใบเสร็จ + ใบเสร็จที่ยังไม่จ่าย
      const uninvoiced = stockOuts
        .filter(so => so.invoiceId === null)
        .reduce((sum, so) => sum + so.sellingPrice * so.quantity, 0)
      const unpaidInvoices = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
      // วันครบกำหนดที่ใกล้ที่สุดของใบเสร็จที่ยังไม่จ่าย
      const dueTimes = invoices.flatMap(inv => (inv.dueDate ? [inv.dueDate.getTime()] : []))

      return {
        ...buyer,
        outstandingAmount: uninvoiced + unpaidInvoices,
        nextDueDate: dueTimes.length ? new Date(Math.min(...dueTimes)) : null,
      }
    })
    // เรียงชื่อใน JS ด้วย locale ไทย — collation ของ DB ไม่รับประกันลำดับภาษาไทย (สระหน้า เ แ โ ใ ไ)
    result.sort((a, b) => a.name.localeCompare(b.name, 'th'))

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
    const { name, phone, defaultDueDay } = body

    if (!name) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อลูกค้า' }, { status: 400 })
    }
    if (!isValidDueDay(defaultDueDay)) {
      return NextResponse.json({ error: 'วันครบกำหนดชำระต้องเป็นวันที่ 1–31' }, { status: 400 })
    }

    const buyer = await prisma.buyer.create({
      data: { name, phone: phone || null, defaultDueDay: defaultDueDay ?? null },
    })

    return NextResponse.json(buyer)
  } catch (error) {
    console.error('Error creating buyer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
