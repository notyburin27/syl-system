'use client'

import { useState, useEffect } from 'react'
import { Table, Button, Card, App, Space, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Buyer } from '@/types/stock'
import BuyerFormModal from '@/components/stock/BuyerFormModal'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'

export default function BuyersPage() {
  const { message } = App.useApp()
  const router = useRouter()
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBuyer, setEditingBuyer] = useState<Buyer | null>(null)

  const fetchBuyers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock/buyers')
      if (res.ok) {
        setBuyers(await res.json())
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBuyers()
  }, [])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/stock/buyers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบลูกค้าสำเร็จ')
        fetchBuyers()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const columns: ColumnsType<Buyer> = [
    {
      title: 'ชื่อลูกค้า',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'เบอร์โทร',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string | null) => phone || '-',
    },
    {
      title: 'ยอดค้างชำระ (บาท)',
      dataIndex: 'outstandingAmount',
      key: 'outstandingAmount',
      render: (amount: number) => (
        <span style={{ color: amount > 0 ? '#cf1322' : '#3f8600', fontWeight: 500 }}>
          {(amount ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
        </span>
      ),
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
            icon={<EyeOutlined />}
            size="small"
            type="primary"
            onClick={() => router.push(`/stock/buyers/${record.id}`)}
          >
            ดูรายละเอียด
          </Button>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => {
              setEditingBuyer(record)
              setModalOpen(true)
            }}
          >
            แก้ไข
          </Button>
          <Popconfirm
            title="ยืนยันการลบ"
            description="คุณแน่ใจหรือไม่ที่จะลบลูกค้านี้?"
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
        title="รายการลูกค้า"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingBuyer(null)
              setModalOpen(true)
            }}
          >
            เพิ่มลูกค้า
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={buyers}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <BuyerFormModal
        open={modalOpen}
        buyer={editingBuyer}
        onClose={() => {
          setModalOpen(false)
          setEditingBuyer(null)
        }}
        onSuccess={fetchBuyers}
      />
    </div>
  )
}
