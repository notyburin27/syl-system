'use client'

import { useState, useEffect } from 'react'
import { Modal, Form, Input, App } from 'antd'
import type { Buyer } from '@/types/stock'

interface BuyerFormModalProps {
  open: boolean
  buyer: Buyer | null
  onClose: () => void
  onSuccess: () => void
}

export default function BuyerFormModal({ open, buyer, onClose, onSuccess }: BuyerFormModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      if (buyer) {
        form.setFieldsValue({ name: buyer.name, phone: buyer.phone })
      } else {
        form.resetFields()
      }
    }
  }, [open, buyer, form])

  const handleSubmit = async (values: { name: string; phone?: string }) => {
    setLoading(true)
    try {
      const url = buyer ? `/api/stock/buyers/${buyer.id}` : '/api/stock/buyers'
      const method = buyer ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      if (!res.ok) {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
        return
      }

      message.success(buyer ? 'แก้ไขลูกค้าสำเร็จ' : 'เพิ่มลูกค้าสำเร็จ')
      onSuccess()
      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={buyer ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText={buyer ? 'บันทึก' : 'เพิ่ม'}
      cancelText="ยกเลิก"
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="name"
          label="ชื่อลูกค้า"
          rules={[{ required: true, message: 'กรุณากรอกชื่อลูกค้า' }]}
        >
          <Input placeholder="ชื่อลูกค้า" />
        </Form.Item>

        <Form.Item name="phone" label="เบอร์โทร">
          <Input placeholder="เบอร์โทร" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
