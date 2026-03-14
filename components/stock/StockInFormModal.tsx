'use client'

import { useState, useEffect } from 'react'
import { Modal, Form, Select, InputNumber, DatePicker, Input, App } from 'antd'
import type { Product } from '@/types/stock'
import dayjs from 'dayjs'

interface StockInFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function StockInFormModal({ open, onClose, onSuccess }: StockInFormModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ date: dayjs() })
      fetchProducts()
    }
  }, [open, form])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/stock/products')
      if (res.ok) setProducts(await res.json())
    } catch { /* ignore */ }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: values.productId,
          purchasePrice: values.purchasePrice,
          quantity: values.quantity,
          date: (values.date as dayjs.Dayjs).toISOString(),
          note: values.note,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
        return
      }

      message.success('นำเข้าสินค้าสำเร็จ')
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
      title="นำเข้าสินค้า"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText="บันทึก"
      cancelText="ยกเลิก"
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="productId"
          label="สินค้า"
          rules={[{ required: true, message: 'กรุณาเลือกสินค้า' }]}
        >
          <Select
            showSearch
            placeholder="ค้นหาและเลือกสินค้า"
            filterOption={(input, option) =>
              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={products.map(p => ({ value: p.id, label: p.name }))}
          />
        </Form.Item>

        <Form.Item
          name="purchasePrice"
          label="ราคาซื้อต่อหน่วย (บาท)"
          rules={[{ required: true, message: 'กรุณากรอกราคาซื้อ' }]}
        >
          <InputNumber
            min={0}
            step={0.01}
            style={{ width: '100%' }}
            placeholder="0.00"
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          />
        </Form.Item>

        <Form.Item
          name="quantity"
          label="จำนวน"
          rules={[{ required: true, message: 'กรุณากรอกจำนวน' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} placeholder="จำนวน" />
        </Form.Item>

        <Form.Item
          name="date"
          label="วันที่"
          rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item name="note" label="หมายเหตุ">
          <Input.TextArea rows={2} placeholder="หมายเหตุ (ถ้ามี)" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
