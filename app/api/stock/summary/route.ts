import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stock/summary?year=2026&month=2 - Monthly profit summary
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)

    // Fetch sales and purchases for the month
    const [sales, purchases, totalOutstandingData, productCount, allPurchases, soldTotals] = await Promise.all([
      prisma.stockOut.findMany({
        where: { date: { gte: startDate, lt: endDate } },
        include: { product: { select: { id: true, name: true } } },
      }),
      prisma.stockIn.findMany({
        where: { date: { gte: startDate, lt: endDate } },
        include: { product: { select: { id: true, name: true } } },
      }),
      // Total outstanding = uninvoiced + unpaid invoices
      Promise.all([
        prisma.stockOut.findMany({
          where: { invoiceId: null },
          select: { sellingPrice: true, quantity: true },
        }),
        prisma.invoice.findMany({
          where: { isPaid: false },
          select: { totalAmount: true },
        }),
      ]),
      prisma.product.count({ where: { isActive: true } }),
      // ทุกรายการซื้อ/ขายตลอดอายุ — ใช้คิดต้นทุนเฉลี่ยและสต๊อกคงค้าง
      prisma.stockIn.findMany({ select: { productId: true, purchasePrice: true, quantity: true } }),
      prisma.stockOut.groupBy({ by: ['productId'], _sum: { quantity: true } }),
    ])

    // ต้นทุนเฉลี่ยถ่วงน้ำหนักต่อหน่วยของแต่ละสินค้า = ยอดซื้อรวม / จำนวนซื้อรวม
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

    // มูลค่าสต๊อกคงค้าง (ราคาทุน) = จำนวนคงเหลือ × ต้นทุนเฉลี่ย
    const soldQuantity = new Map(soldTotals.map(s => [s.productId, s._sum.quantity ?? 0]))
    let stockValue = 0
    for (const [productId, t] of purchaseTotals) {
      const remaining = t.quantity - (soldQuantity.get(productId) ?? 0)
      if (remaining > 0) stockValue += remaining * avgCost(productId)
    }

    // Calculate revenue per product
    const productSalesMap = new Map<string, { name: string; quantitySold: number; revenue: number }>()
    for (const sale of sales) {
      const existing = productSalesMap.get(sale.productId)
      if (existing) {
        existing.quantitySold += sale.quantity
        existing.revenue += sale.sellingPrice * sale.quantity
      } else {
        productSalesMap.set(sale.productId, {
          name: sale.product.name,
          quantitySold: sale.quantity,
          revenue: sale.sellingPrice * sale.quantity,
        })
      }
    }

    // Purchased quantity per product (info only — not used for profit)
    const productPurchaseMap = new Map<string, { name: string; quantityPurchased: number }>()
    for (const purchase of purchases) {
      const existing = productPurchaseMap.get(purchase.productId)
      if (existing) {
        existing.quantityPurchased += purchase.quantity
      } else {
        productPurchaseMap.set(purchase.productId, {
          name: purchase.product.name,
          quantityPurchased: purchase.quantity,
        })
      }
    }

    // Merge into details
    // กำไรคิดเฉพาะสินค้าที่ขายในเดือน: cost = จำนวนขาย × ต้นทุนเฉลี่ย
    const allProductIds = new Set([...productSalesMap.keys(), ...productPurchaseMap.keys()])
    const details = Array.from(allProductIds).map(productId => {
      const salesData = productSalesMap.get(productId)
      const purchaseData = productPurchaseMap.get(productId)
      const quantitySold = salesData?.quantitySold || 0
      return {
        productId,
        productName: salesData?.name || purchaseData?.name || '',
        quantitySold,
        revenue: salesData?.revenue || 0,
        quantityPurchased: purchaseData?.quantityPurchased || 0,
        cost: quantitySold * avgCost(productId),
      }
    })

    const revenue = details.reduce((sum, d) => sum + d.revenue, 0)
    const cost = details.reduce((sum, d) => sum + d.cost, 0)

    const [uninvoicedOuts, unpaidInvoices] = totalOutstandingData
    const totalOutstanding =
      uninvoicedOuts.reduce((sum, so) => sum + so.sellingPrice * so.quantity, 0) +
      unpaidInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)

    return NextResponse.json({
      year,
      month,
      revenue,
      cost,
      profit: revenue - cost,
      totalOutstanding,
      stockValue,
      productCount,
      details,
    })
  } catch (error) {
    console.error('Error fetching summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
