'use client'

import { useState, useEffect } from 'react'
import { Table, Button, Card, App, Space, Popconfirm, Image } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Product } from '@/types/stock'
import ProductFormModal from '@/components/stock/ProductFormModal'
import dayjs from 'dayjs'

export default function ProductsPage() {
  const { message } = App.useApp()
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
      title: 'รูปภาพ',
      dataIndex: 'image',
      key: 'image',
      width: 80,
      render: (image: string | null) =>
        image ? (
          <Image src={image} alt="product" width={50} height={50} style={{ objectFit: 'cover', borderRadius: 4 }} />
        ) : (
          <div style={{ width: 50, height: 50, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>
            ไม่มีรูป
          </div>
        ),
    },
    {
      title: 'ชื่อสินค้า',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'ราคาขาย (บาท)',
      dataIndex: 'sellingPrice',
      key: 'sellingPrice',
      render: (price: number) => price.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'สต็อกคงเหลือ',
      dataIndex: 'stockRemaining',
      key: 'stockRemaining',
      render: (qty: number) => qty ?? 0,
      align: 'right',
    },
    {
      title: 'วันที่สร้าง',
      dataIndex: 'createdAt',
      key: 'createdAt',
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
          <Popconfirm
            title="ยืนยันการลบ"
            description="คุณแน่ใจหรือไม่ที่จะลบสินค้านี้?"
            onConfirm={() => handleDelete(record.id)}
            okText="ยืนยัน"
            cancelText="ยกเลิก"
          >
            <Button danger icon={<DeleteOutlined />} size="small">
              ลบ
            </Button>
          </Popconfirm>
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
          pagination={{ pageSize: 10 }}
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
