import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

// ข้าวสาร = สินค้าที่ชื่อขึ้นต้นด้วย "ข้าว" (เกณฑ์เดียวกับการ์ดกำไรข้าวในหน้าภาพรวม)
const isRice = (productName: string) => productName.trim().startsWith('ข้าว')

// GET /api/stock/summary/receipts?year=2026&month=10
// สรุปยอดขาย/กำไรรายเดือน อ้างอิงใบเสร็จที่วันครบกำหนดชำระอยู่ในเดือนนั้น (เวลาไทย)
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') || '')
    const month = parseInt(searchParams.get('month') || '')
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'กรุณาระบุปีและเดือนให้ถูกต้อง' }, { status: 400 })
    }

    // dueDate เก็บเป็นเที่ยงคืนเวลาไทย → ขอบเขตเดือนต้องคิดตามเวลาไทย ไม่ใช่ timezone ของเซิร์ฟเวอร์
    const startDate = new Date(Date.UTC(year, month - 1, 1) - BANGKOK_OFFSET_MS)
    const endDate = new Date(Date.UTC(year, month, 1) - BANGKOK_OFFSET_MS)

    const [invoices, allPurchases] = await Promise.all([
      prisma.invoice.findMany({
        where: { dueDate: { gte: startDate, lt: endDate } },
        include: {
          buyer: { select: { name: true } },
          stockOuts: { include: { product: { select: { name: true } } } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.stockIn.findMany({ select: { productId: true, purchasePrice: true, quantity: true } }),
    ])

    // ต้นทุนเฉลี่ยถ่วงน้ำหนักต่อหน่วย = ยอดซื้อรวม / จำนวนซื้อรวม (เหมือนหน้าภาพรวม)
    const purchaseTotals = new Map<string, { quantity: number; amount: number }>()
    for (const p of allPurchases) {
      const t = purchaseTotals.get(p.productId) ?? { quantity: 0, amount: 0 }
      t.quantity += p.quantity
      t.amount += p.purchasePrice * p.quantity
      purchaseTotals.set(p.productId, t)
    }
    const avgCost = (productId: string) => {
      const t = purchaseTotals.get(productId)
      return t && t.quantity > 0 ? t.amount / t.quantity : 0
    }

    const productMap = new Map<string, { productName: string; quantity: number; revenue: number; cost: number }>()
    for (const invoice of invoices) {
      for (const so of invoice.stockOuts) {
        const d = productMap.get(so.productId) ?? { productName: so.product.name, quantity: 0, revenue: 0, cost: 0 }
        d.quantity += so.quantity
        d.revenue += so.sellingPrice * so.quantity
        d.cost += so.quantity * avgCost(so.productId)
        productMap.set(so.productId, d)
      }
    }

    const details = Array.from(productMap, ([productId, d]) => ({
      productId,
      ...d,
      profit: d.revenue - d.cost,
      isRice: isRice(d.productName),
    })).sort((a, b) => b.revenue - a.revenue)

    const revenue = details.reduce((sum, d) => sum + d.revenue, 0)
    const cost = details.reduce((sum, d) => sum + d.cost, 0)
    const riceProfit = details.filter(d => d.isRice).reduce((sum, d) => sum + d.profit, 0)
    const productProfit = details.filter(d => !d.isRice).reduce((sum, d) => sum + d.profit, 0)

    return NextResponse.json({
      year,
      month,
      revenue,
      cost,
      profit: revenue - cost,
      riceProfit,
      productProfit,
      details,
      invoices: invoices.map(inv => ({
        id: inv.id,
        buyerName: inv.buyer.name,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount,
        isPaid: inv.isPaid,
      })),
    })
  } catch (error) {
    console.error('Error fetching receipt summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
