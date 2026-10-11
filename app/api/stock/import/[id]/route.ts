import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/stock/import/[id] - Edit stock import
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { productId, purchasePrice, quantity, date, note } = body

    if (!productId || purchasePrice == null || !quantity || !date) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    const existing = await prisma.stockIn.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบรายการนำเข้า' }, { status: 404 })
    }

    const stockIn = await prisma.stockIn.update({
      where: { id },
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
    console.error('Error updating stock import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/stock/import/[id]
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    await prisma.stockIn.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting stock import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
