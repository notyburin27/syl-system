import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// DELETE /api/stock/export/[id]
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const stockOut = await prisma.stockOut.findUnique({ where: { id } })
    if (!stockOut) {
      return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 })
    }

    if (stockOut.invoiceId) {
      return NextResponse.json({ error: 'ไม่สามารถลบได้ รายการนี้ออกใบเสร็จแล้ว' }, { status: 400 })
    }

    await prisma.stockOut.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting stock export:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
