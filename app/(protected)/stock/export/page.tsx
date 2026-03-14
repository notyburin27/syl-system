'use client'

import { useState, useEffect } from 'react'
import { Table, Button, Card, App, Space, Popconfirm, Tag } from 'antd'
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { StockOut } from '@/types/stock'
import StockOutFormModal from '@/components/stock/StockOutFormModal'
import dayjs from 'dayjs'

export default function StockExportPage() {
  const { message } = App.useApp()
  const [stockOuts, setStockOuts] = useState<StockOut[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchStockOuts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock/export')
      if (res.ok) setStockOuts(await res.json())
    } catch {
      message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStockOuts()
  }, [])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/stock/export/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบรายการสำเร็จ')
        fetchStockOuts()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const handleDeliver = async (id: string) => {
    try {
      const res = await fetch(`/api/stock/export/${id}/deliver`, { method: 'PATCH' })
      if (res.ok) {
        message.success('ยืนยันรับสินค้าสำเร็จ')
        fetchStockOuts()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const columns: ColumnsType<StockOut> = [
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
      title: 'ผู้ซื้อ',
      dataIndex: ['buyer', 'name'],
      key: 'buyer',
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
    {
      title: 'ใบเสร็จ',
      key: 'invoice',
      render: (_, record) =>
        record.invoiceId ? (
          <Tag color="blue">ออกใบเสร็จแล้ว</Tag>
        ) : (
          <Tag>ยังไม่ออก</Tag>
        ),
    },
    {
      title: 'การดำเนินการ',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {!record.isDelivered && (
            <Button
              icon={<CheckCircleOutlined />}
              size="small"
              type="primary"
              ghost
              onClick={() => handleDeliver(record.id)}
            >
              ยืนยันรับสินค้า
            </Button>
          )}
          {!record.invoiceId && (
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
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card
        title="ขายสินค้า"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            ขายสินค้า
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={stockOuts}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <StockOutFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchStockOuts}
      />
    </div>
  )
}
