export interface Product {
  id: string
  name: string
  sellingPrice: number
  image: string | null
  isActive: boolean
  stockRemaining?: number
  createdAt: string
  updatedAt: string
}

export interface Buyer {
  id: string
  name: string
  phone: string | null
  outstandingAmount?: number
  createdAt: string
  updatedAt: string
}

export interface StockIn {
  id: string
  productId: string
  product?: Product
  purchasePrice: number
  quantity: number
  date: string
  note: string | null
  createdAt: string
}

export interface StockOut {
  id: string
  productId: string
  product?: Product
  buyerId: string
  buyer?: Buyer
  quantity: number
  sellingPrice: number
  date: string
  isDelivered: boolean
  deliveredAt: string | null
  invoiceId: string | null
  invoice?: Invoice
  note: string | null
  createdAt: string
}

export interface Invoice {
  id: string
  buyerId: string
  buyer?: Buyer
  totalAmount: number
  isPaid: boolean
  paidAt: string | null
  note: string | null
  createdAt: string
  stockOuts?: StockOut[]
}

export interface MonthlySummary {
  year: number
  month: number
  revenue: number
  cost: number
  profit: number
  totalOutstanding: number
  details: {
    productId: string
    productName: string
    quantitySold: number
    revenue: number
    quantityPurchased: number
    cost: number
  }[]
}
