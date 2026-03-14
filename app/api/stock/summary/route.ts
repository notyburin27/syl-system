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
    const [sales, purchases, totalOutstandingData, productCount] = await Promise.all([
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
    ])

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

    // Calculate cost per product
    const productCostMap = new Map<string, { name: string; quantityPurchased: number; cost: number }>()
    for (const purchase of purchases) {
      const existing = productCostMap.get(purchase.productId)
      if (existing) {
        existing.quantityPurchased += purchase.quantity
        existing.cost += purchase.purchasePrice * purchase.quantity
      } else {
        productCostMap.set(purchase.productId, {
          name: purchase.product.name,
          quantityPurchased: purchase.quantity,
          cost: purchase.purchasePrice * purchase.quantity,
        })
      }
    }

    // Merge into details
    const allProductIds = new Set([...productSalesMap.keys(), ...productCostMap.keys()])
    const details = Array.from(allProductIds).map(productId => {
      const salesData = productSalesMap.get(productId)
      const costData = productCostMap.get(productId)
      return {
        productId,
        productName: salesData?.name || costData?.name || '',
        quantitySold: salesData?.quantitySold || 0,
        revenue: salesData?.revenue || 0,
        quantityPurchased: costData?.quantityPurchased || 0,
        cost: costData?.cost || 0,
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
      productCount,
      details,
    })
  } catch (error) {
    console.error('Error fetching summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
