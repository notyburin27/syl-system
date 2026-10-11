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
// รับได้ 2 แบบ: รายการเดียว { productId, buyerId, quantity, sellingPrice, date, note }
// หรือหลายรายการ { buyerId, date, note, items: [{ productId, quantity, sellingPrice }] } — บันทึกทั้งชุดหรือไม่บันทึกเลย
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { buyerId, date, note } = body
    const isBatch = Array.isArray(body.items)
    const items: { productId: string; quantity: number; sellingPrice: number }[] = isBatch
      ? body.items
      : [{ productId: body.productId, quantity: body.quantity, sellingPrice: body.sellingPrice }]

    if (
      !buyerId || !date || items.length === 0 ||
      items.some(item => !item.productId || !item.quantity || item.sellingPrice == null)
    ) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    // Use transaction to prevent race condition
    const stockOuts = await prisma.$transaction(async (tx) => {
      // สินค้าเดียวกันอาจอยู่หลายแถว — รวมจำนวนก่อนเทียบกับคงเหลือ
      const requested = new Map<string, number>()
      for (const item of items) {
        requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity)
      }

      for (const [productId, quantity] of requested) {
        const [stockIns, existingOuts, product] = await Promise.all([
          tx.stockIn.findMany({ where: { productId }, select: { quantity: true } }),
          tx.stockOut.findMany({ where: { productId }, select: { quantity: true } }),
          tx.product.findUnique({ where: { id: productId }, select: { name: true } }),
        ])

        const stockRemaining =
          stockIns.reduce((sum, si) => sum + si.quantity, 0) -
          existingOuts.reduce((sum, so) => sum + so.quantity, 0)

        if (quantity > stockRemaining) {
          const label = isBatch && product ? ` "${product.name}" ` : ''
          throw new Error(`สินค้า${label}คงเหลือไม่เพียงพอ (คงเหลือ ${stockRemaining} ชิ้น)`)
        }
      }

      return Promise.all(items.map(item =>
        tx.stockOut.create({
          data: {
            productId: item.productId,
            buyerId,
            quantity: item.quantity,
            sellingPrice: item.sellingPrice,
            date: new Date(date),
            note: note || null,
          },
          include: {
            product: { select: { id: true, name: true } },
            buyer: { select: { id: true, name: true } },
          },
        })
      ))
    })

    return NextResponse.json(isBatch ? stockOuts : stockOuts[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    if (errorMessage.includes('คงเหลือไม่เพียงพอ')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    console.error('Error creating stock export:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
