import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/products/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        stockIns: { select: { quantity: true } },
        stockOuts: { select: { quantity: true } },
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 })
    }

    const { stockIns, stockOuts, ...rest } = product
    return NextResponse.json({
      ...rest,
      stockRemaining:
        stockIns.reduce((sum, si) => sum + si.quantity, 0) -
        stockOuts.reduce((sum, so) => sum + so.quantity, 0),
    })
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/stock/products/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.sellingPrice !== undefined && { sellingPrice: body.sellingPrice }),
      },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/stock/products/[id] - Soft delete (requires stock = 0)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        stockIns: { select: { quantity: true } },
        stockOuts: { select: { quantity: true } },
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 })
    }

    const stockRemaining =
      product.stockIns.reduce((sum, si) => sum + si.quantity, 0) -
      product.stockOuts.reduce((sum, so) => sum + so.quantity, 0)

    if (stockRemaining > 0) {
      return NextResponse.json(
        { error: `ไม่สามารถลบได้ ยังมีสินค้าคงเหลือใน stock ${stockRemaining} ชิ้น` },
        { status: 400 }
      )
    }

    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
