import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/products - List active products with stock remaining
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        stockIns: { select: { quantity: true } },
        stockOuts: { select: { quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = products.map(({ stockIns, stockOuts, ...product }) => ({
      ...product,
      stockRemaining:
        stockIns.reduce((sum, si) => sum + si.quantity, 0) -
        stockOuts.reduce((sum, so) => sum + so.quantity, 0),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/stock/products - Create product
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, sellingPrice } = body

    if (!name || sellingPrice == null) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อสินค้าและราคาขาย' }, { status: 400 })
    }

    const product = await prisma.product.create({
      data: { name, sellingPrice },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
