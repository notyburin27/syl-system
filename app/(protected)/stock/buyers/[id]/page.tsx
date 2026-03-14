'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Card, App, Space, Tag, Tabs, Statistic, Row, Col, Popconfirm } from 'antd'
import { ArrowLeftOutlined, FileTextOutlined, DollarOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { StockOut, Invoice } from '@/types/stock'
import { useRouter, useParams } from 'next/navigation'
import dayjs from 'dayjs'

interface BuyerDetail {
  id: string
  name: string
  phone: string | null
  totalPurchased: number
  outstandingAmount: number
  paidAmount: number
}

export default function BuyerDetailPage() {
  const { message } = App.useApp()
  const router = useRouter()
  const params = useParams()
  const buyerId = params.id as string

  const [buyer, setBuyer] = useState<BuyerDetail | null>(null)
  const [uninvoicedOuts, setUninvoicedOuts] = useState<StockOut[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  const fetchBuyer = useCallback(async () => {
    try {
      const res = await fetch(`/api/stock/buyers/${buyerId}`)
      if (res.ok) setBuyer(await res.json())
    } catch { /* ignore */ }
  }, [buyerId])

  const fetchUninvoiced = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/stock/buyers/${buyerId}/stock-outs`)
      if (res.ok) setUninvoicedOuts(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [buyerId])

  const fetchInvoices = useCallback(async () => {
    setInvoiceLoading(true)
    try {
      const res = await fetch(`/api/stock/invoices?buyerId=${buyerId}`)
      if (res.ok) setInvoices(await res.json())
    } catch { /* ignore */ }
    finally { setInvoiceLoading(false) }
  }, [buyerId])

  useEffect(() => {
    fetchBuyer()
    fetchUninvoiced()
    fetchInvoices()
  }, [fetchBuyer, fetchUninvoiced, fetchInvoices])

  const handleCreateInvoice = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('กรุณาเลือกรายการ')
      return
    }

    try {
      const res = await fetch('/api/stock/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId,
          stockOutIds: selectedRowKeys,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
        return
      }

      message.success('ออกใบเสร็จสำเร็จ')
      setSelectedRowKeys([])
      fetchBuyer()
      fetchUninvoiced()
      fetchInvoices()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const handlePay = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/stock/invoices/${invoiceId}/pay`, { method: 'PATCH' })
      if (res.ok) {
        message.success('บันทึกชำระเงินสำเร็จ')
        fetchBuyer()
        fetchInvoices()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/stock/invoices/${invoiceId}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบใบเสร็จสำเร็จ')
        fetchBuyer()
        fetchUninvoiced()
        fetchInvoices()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const selectedTotal = uninvoicedOuts
    .filter(so => selectedRowKeys.includes(so.id))
    .reduce((sum, so) => sum + so.sellingPrice * so.quantity, 0)

  const uninvoicedColumns: ColumnsType<StockOut> = [
    {
      title: 'วันที่',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'สินค้า',
      dataIndex: ['product', 'name'],
      key: 'product',
    },
    {
      title: 'จำนวน',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right',
    },
    {
      title: 'ราคาขาย/หน่วย',
      dataIndex: 'sellingPrice',
      key: 'sellingPrice',
      render: (price: number) => price.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'รวม (บาท)',
      key: 'total',
      render: (_, record) => (record.sellingPrice * record.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'สถานะจัดส่ง',
      key: 'delivery',
      render: (_, record) =>
        record.isDelivered ? (
          <Tag color="green">ได้รับแล้ว</Tag>
        ) : (
          <Tag color="orange">ยังไม่ได้รับ</Tag>
        ),
    },
  ]

  const invoiceColumns: ColumnsType<Invoice> = [
    {
      title: 'เลขใบเสร็จ',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => id.slice(-8).toUpperCase(),
    },
    {
      title: 'วันที่',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'ยอดรวม (บาท)',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (amount: number) => amount.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'สถานะ',
      key: 'status',
      render: (_, record) =>
        record.isPaid ? (
          <Tag color="green">ชำระแล้ว</Tag>
        ) : (
          <Tag color="red">ค้างชำระ</Tag>
        ),
    },
    {
      title: 'วันที่ชำระ',
      dataIndex: 'paidAt',
      key: 'paidAt',
      render: (date: string | null) => date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'การดำเนินการ',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {!record.isPaid && (
            <>
              <Popconfirm
                title="ยืนยันการชำระเงิน"
                description={`ยืนยันชำระเงิน ${record.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท?`}
                onConfirm={() => handlePay(record.id)}
                okText="ยืนยัน"
                cancelText="ยกเลิก"
              >
                <Button type="primary" icon={<DollarOutlined />} size="small">
                  บันทึกชำระเงิน
                </Button>
              </Popconfirm>
              <Popconfirm
                title="ยืนยันการลบ"
                description="ลบใบเสร็จนี้? รายการขายจะกลับไปเป็นรายการที่ยังไม่ออกใบเสร็จ"
                onConfirm={() => handleDeleteInvoice(record.id)}
                okText="ยืนยัน"
                cancelText="ยกเลิก"
              >
                <Button danger icon={<DeleteOutlined />} size="small">
                  ลบ
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  const expandedRowRender = (invoice: Invoice) => {
    const items = invoice.stockOuts || []
    return (
      <Table
        dataSource={items}
        rowKey="id"
        pagination={false}
        size="small"
        columns={[
          { title: 'สินค้า', dataIndex: ['product', 'name'], key: 'product' },
          { title: 'จำนวน', dataIndex: 'quantity', key: 'quantity', align: 'right' as const },
          {
            title: 'ราคา/หน่วย',
            dataIndex: 'sellingPrice',
            key: 'sellingPrice',
            render: (p: number) => p.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
            align: 'right' as const,
          },
          {
            title: 'รวม',
            key: 'total',
            render: (_: unknown, r: StockOut) => (r.sellingPrice * r.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2 }),
            align: 'right' as const,
          },
        ]}
      />
    )
  }

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        style={{ marginBottom: 16 }}
        onClick={() => router.push('/stock/buyers')}
      >
        กลับ
      </Button>

      {buyer && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>{buyer.name}</h2>
            {buyer.phone && <p style={{ color: '#666', margin: '4px 0 0' }}>โทร: {buyer.phone}</p>}
          </Card>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card>
                <Statistic
                  title="ยอดซื้อทั้งหมด"
                  value={buyer.totalPurchased}
                  precision={2}
                  suffix="บาท"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="ยอดค้างชำระ"
                  value={buyer.outstandingAmount}
                  precision={2}
                  suffix="บาท"
                  valueStyle={{ color: buyer.outstandingAmount > 0 ? '#cf1322' : '#3f8600' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="ชำระแล้ว"
                  value={buyer.paidAmount}
                  precision={2}
                  suffix="บาท"
                  valueStyle={{ color: '#3f8600' }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}

      <Card>
        <Tabs
          items={[
            {
              key: 'uninvoiced',
              label: `รายการที่ยังไม่ออกใบเสร็จ (${uninvoicedOuts.length})`,
              children: (
                <>
                  <Table
                    rowSelection={{
                      selectedRowKeys,
                      onChange: (keys) => setSelectedRowKeys(keys as string[]),
                    }}
                    columns={uninvoicedColumns}
                    dataSource={uninvoicedOuts}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    size="small"
                  />
                  {selectedRowKeys.length > 0 && (
                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>
                        เลือก {selectedRowKeys.length} รายการ | ยอดรวม:{' '}
                        <strong>{selectedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</strong>
                      </span>
                      <Button type="primary" icon={<FileTextOutlined />} onClick={handleCreateInvoice}>
                        ออกใบเสร็จ
                      </Button>
                    </div>
                  )}
                </>
              ),
            },
            {
              key: 'invoices',
              label: `ใบเสร็จทั้งหมด (${invoices.length})`,
              children: (
                <Table
                  columns={invoiceColumns}
                  dataSource={invoices}
                  rowKey="id"
                  loading={invoiceLoading}
                  pagination={{ pageSize: 10 }}
                  expandable={{ expandedRowRender }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
