'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Card, App, Space, Popconfirm, DatePicker, Select } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { StockIn, Product } from '@/types/stock'
import StockInFormModal from '@/components/stock/StockInFormModal'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export default function StockImportPage() {
  const { message } = App.useApp()
  const [stockIns, setStockIns] = useState<StockIn[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [filterProductId, setFilterProductId] = useState<string | undefined>()
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

  const fetchStockIns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterProductId) params.set('productId', filterProductId)
      if (filterDateRange) {
        params.set('dateFrom', filterDateRange[0].startOf('day').toISOString())
        params.set('dateTo', filterDateRange[1].endOf('day').toISOString())
      }
      const res = await fetch(`/api/stock/import?${params.toString()}`)
      if (res.ok) setStockIns(await res.json())
    } catch {
      message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [filterProductId, filterDateRange, message])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/stock/products')
      if (res.ok) setProducts(await res.json())
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    fetchStockIns()
  }, [fetchStockIns])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/stock/import/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบรายการสำเร็จ')
        fetchStockIns()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const columns: ColumnsType<StockIn> = [
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
      title: 'ราคาซื้อ/หน่วย',
      dataIndex: 'purchasePrice',
      key: 'purchasePrice',
      render: (price: number) => price.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'จำนวน',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right',
    },
    {
      title: 'รวม (บาท)',
      key: 'total',
      render: (_, record) => (record.purchasePrice * record.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'หมายเหตุ',
      dataIndex: 'note',
      key: 'note',
      render: (note: string | null) => note || '-',
    },
    {
      title: 'การดำเนินการ',
      key: 'actions',
      render: (_, record) => (
        <Popconfirm
          title="ยืนยันการลบ"
          description="คุณแน่ใจหรือไม่ที่จะลบรายการนี้?"
          onConfirm={() => handleDelete(record.id)}
          okText="ยืนยัน"
          cancelText="ยกเลิก"
        >
          <Button danger icon={<DeleteOutlined />} size="small">
            ลบ
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <Card
        title="นำเข้าสินค้า"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            นำเข้าสินค้า
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <RangePicker
            format="DD/MM/YYYY"
            placeholder={['วันที่เริ่ม', 'วันที่สิ้นสุด']}
            onChange={(dates) => setFilterDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Select
            allowClear
            showSearch
            placeholder="เลือกสินค้า"
            style={{ width: 200 }}
            onChange={(value) => setFilterProductId(value)}
            filterOption={(input, option) =>
              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={products.map(p => ({ value: p.id, label: p.name }))}
          />
        </Space>
        <Table
          columns={columns}
          dataSource={stockIns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <StockInFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchStockIns}
      />
    </div>
  )
}
