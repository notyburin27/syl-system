import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/import - List stock imports
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const productId = searchParams.get('productId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const where: Record<string, unknown> = {}
    if (productId) where.productId = productId
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
    }

    const stockIns = await prisma.stockIn.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(stockIns)
  } catch (error) {
    console.error('Error fetching stock imports:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/stock/import - Record stock import
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { productId, purchasePrice, quantity, date, note } = body

    if (!productId || purchasePrice == null || !quantity || !date) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    const stockIn = await prisma.stockIn.create({
      data: {
        productId,
        purchasePrice,
        quantity,
        date: new Date(date),
        note: note || null,
      },
      include: {
        product: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(stockIn)
  } catch (error) {
    console.error('Error creating stock import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
