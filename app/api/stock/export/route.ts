import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/export - List stock exports
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const buyerId = searchParams.get('buyerId')
    const productId = searchParams.get('productId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const where: Record<string, unknown> = {}
    if (buyerId) where.buyerId = buyerId
    if (productId) where.productId = productId
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
    }

    const stockOuts = await prisma.stockOut.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(stockOuts)
  } catch (error) {
    console.error('Error fetching stock exports:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/stock/export - Record stock export (sale) with stock validation
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { productId, buyerId, quantity, sellingPrice, date, note } = body

    if (!productId || !buyerId || !quantity || sellingPrice == null || !date) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    // Use transaction to prevent race condition
    const stockOut = await prisma.$transaction(async (tx) => {
      const stockIns = await tx.stockIn.findMany({
        where: { productId },
        select: { quantity: true },
      })
      const stockOuts = await tx.stockOut.findMany({
        where: { productId },
        select: { quantity: true },
      })

      const stockRemaining =
        stockIns.reduce((sum, si) => sum + si.quantity, 0) -
        stockOuts.reduce((sum, so) => sum + so.quantity, 0)

      if (quantity > stockRemaining) {
        throw new Error(`สินค้าคงเหลือไม่เพียงพอ (คงเหลือ ${stockRemaining} ชิ้น)`)
      }

      return tx.stockOut.create({
        data: {
          productId,
          buyerId,
          quantity,
          sellingPrice,
          date: new Date(date),
          note: note || null,
        },
        include: {
          product: { select: { id: true, name: true } },
          buyer: { select: { id: true, name: true } },
        },
      })
    })

    return NextResponse.json(stockOut)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    if (errorMessage.includes('คงเหลือไม่เพียงพอ')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    console.error('Error creating stock export:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
