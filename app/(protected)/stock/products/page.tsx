'use client'

import { useState, useEffect } from 'react'
import { Table, Button, Card, App, Space } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Product } from '@/types/stock'
import ProductFormModal from '@/components/stock/ProductFormModal'
import dayjs from 'dayjs'

export default function ProductsPage() {
  const { message, modal } = App.useApp()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock/products')
      if (res.ok) {
        setProducts(await res.json())
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/stock/products/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบสินค้าสำเร็จ')
        fetchProducts()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const columns: ColumnsType<Product> = [
    {
      title: 'ชื่อสินค้า',
      dataIndex: 'name',
      key: 'name',
      // numeric: เรียง "5 กก." < "14 กก." < "40 กก." ตามตัวเลข ไม่ใช่ตามตัวอักษร
      sorter: (a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }),
    },
    {
      title: 'ราคาขาย (บาท)',
      dataIndex: 'sellingPrice',
      key: 'sellingPrice',
      sorter: (a, b) => a.sellingPrice - b.sellingPrice,
      render: (price: number) => price.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'สต็อกคงเหลือ',
      dataIndex: 'stockRemaining',
      key: 'stockRemaining',
      sorter: (a, b) => (a.stockRemaining ?? 0) - (b.stockRemaining ?? 0),
      render: (qty: number) => qty ?? 0,
      align: 'right',
    },
    {
      title: 'วันที่สร้าง',
      dataIndex: 'createdAt',
      key: 'createdAt',
      sorter: (a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf(),
      render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'การดำเนินการ',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => {
              setEditingProduct(record)
              setModalOpen(true)
            }}
          >
            แก้ไข
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            size="small"
            onClick={() =>
              modal.confirm({
                title: 'ยืนยันการลบ',
                content: `คุณแน่ใจหรือไม่ที่จะลบสินค้า "${record.name}"?`,
                okText: 'ยืนยัน',
                okButtonProps: { danger: true },
                cancelText: 'ยกเลิก',
                onOk: () => handleDelete(record.id),
              })
            }
          >
            ลบ
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card
        title="รายการสินค้า"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingProduct(null)
              setModalOpen(true)
            }}
          >
            เพิ่มสินค้า
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={products}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ defaultPageSize: 100 }}
        />
      </Card>

      <ProductFormModal
        open={modalOpen}
        product={editingProduct}
        onClose={() => {
          setModalOpen(false)
          setEditingProduct(null)
        }}
        onSuccess={fetchProducts}
      />
    </div>
  )
}
