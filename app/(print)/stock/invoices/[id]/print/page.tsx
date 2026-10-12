'use client'

import { useState, useEffect } from 'react'
import { Button, Spin, Result } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'
import { useParams } from 'next/navigation'
import dayjs from 'dayjs'
import type { Invoice } from '@/types/stock'
import { bahtText } from '@/lib/utils/bahtText'

const formatMoney = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function InvoicePrintPage() {
  const params = useParams()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const res = await fetch(`/api/stock/invoices/${invoiceId}`)
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'เกิดข้อผิดพลาด')
          return
        }
        setInvoice(data)
      } catch {
        setError('เกิดข้อผิดพลาด')
      }
    }
    fetchInvoice()
  }, [invoiceId])

  useEffect(() => {
    if (invoice) document.title = `ใบเสร็จ ${invoice.id.slice(-8).toUpperCase()}`
  }, [invoice])

  if (error) return <Result status="warning" title={error} />
  if (!invoice) return <Spin style={{ display: 'block', marginTop: 120 }} size="large" />

  const items = invoice.stockOuts || []

  return (
    <div className="receipt-page">
      <style>{`
        .receipt-page { background: #f0f0f0; min-height: 100vh; padding: 24px 16px; }
        .receipt-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: flex-end; }
        .receipt-paper { max-width: 210mm; margin: 0 auto; background: #fff; padding: 16mm 14mm; box-shadow: 0 2px 8px rgba(0,0,0,0.12); color: #000; }
        .receipt-paper h1 { font-size: 22px; font-weight: 600; margin: 0; text-align: center; }
        .receipt-meta { display: flex; justify-content: space-between; gap: 24px; margin: 24px 0 16px; font-size: 14px; line-height: 1.8; }
        .receipt-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .receipt-table th, .receipt-table td { border: 1px solid #000; padding: 6px 8px; }
        .receipt-table th { background: #f5f5f5; font-weight: 500; }
        .receipt-table .num { text-align: right; white-space: nowrap; }
        .receipt-table .center { text-align: center; }
        .receipt-paid { margin-top: 16px; font-size: 14px; }
        .receipt-signatures { display: flex; justify-content: space-around; margin-top: 64px; font-size: 14px; text-align: center; }
        .receipt-signatures .line { width: 200px; border-bottom: 1px dotted #000; margin-bottom: 8px; height: 32px; }
        @media print {
          @page { size: A4; margin: 0; }
          .receipt-page { background: #fff; padding: 0; }
          .receipt-toolbar { display: none; }
          .receipt-paper { box-shadow: none; max-width: none; }
          .receipt-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="receipt-toolbar">
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          พิมพ์
        </Button>
      </div>

      <div className="receipt-paper">
        <h1>ใบเสร็จรับเงิน</h1>

        <div className="receipt-meta">
          <div>
            <div><strong>ลูกค้า:</strong> {invoice.buyer?.name}</div>
            {invoice.buyer?.phone && <div><strong>โทร:</strong> {invoice.buyer.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div><strong>เลขที่:</strong> {invoice.id.slice(-8).toUpperCase()}</div>
            <div><strong>วันที่:</strong> {dayjs(invoice.createdAt).format('DD/MM/YYYY')}</div>
            {invoice.dueDate && (
              <div><strong>ครบกำหนดชำระ:</strong> {dayjs(invoice.dueDate).format('DD/MM/YYYY')}</div>
            )}
          </div>
        </div>

        <table className="receipt-table">
          <thead>
            <tr>
              <th className="center" style={{ width: 48 }}>ลำดับ</th>
              <th className="center" style={{ width: 96 }}>วันที่</th>
              <th>รายการ</th>
              <th className="num" style={{ width: 72 }}>จำนวน</th>
              <th className="num" style={{ width: 110 }}>ราคา/หน่วย</th>
              <th className="num" style={{ width: 120 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id}>
                <td className="center">{i + 1}</td>
                <td className="center">{dayjs(item.date).format('DD/MM/YYYY')}</td>
                <td>{item.product?.name}</td>
                <td className="num">{item.quantity.toLocaleString('th-TH')}</td>
                <td className="num">{formatMoney(item.sellingPrice)}</td>
                <td className="num">{formatMoney(item.sellingPrice * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="center">({bahtText(invoice.totalAmount)})</td>
              <td className="num"><strong>รวมทั้งสิ้น</strong></td>
              <td className="num"><strong>{formatMoney(invoice.totalAmount)}</strong></td>
            </tr>
          </tfoot>
        </table>

        {invoice.isPaid && invoice.paidAt && (
          <div className="receipt-paid">
            ชำระเงินแล้ว เมื่อ {dayjs(invoice.paidAt).format('DD/MM/YYYY HH:mm')}
          </div>
        )}

        <div className="receipt-signatures">
          <div>
            <div className="line" />
            ผู้รับเงิน
          </div>
          <div>
            <div className="line" />
            ผู้จ่ายเงิน
          </div>
        </div>
      </div>
    </div>
  )
}
