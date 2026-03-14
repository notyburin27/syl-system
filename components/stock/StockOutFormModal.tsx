'use client'

import { useState, useEffect } from 'react'
import { Modal, Form, Select, InputNumber, DatePicker, Input, App } from 'antd'
import type { Product, Buyer } from '@/types/stock'
import dayjs from 'dayjs'

interface StockOutFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function StockOutFormModal({ open, onClose, onSuccess }: StockOutFormModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ date: dayjs() })
      setSelectedProduct(null)
      fetchProducts()
      fetchBuyers()
    }
  }, [open, form])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/stock/products')
      if (res.ok) setProducts(await res.json())
    } catch { /* ignore */ }
  }

  const fetchBuyers = async () => {
    try {
      const res = await fetch('/api/stock/buyers')
      if (res.ok) setBuyers(await res.json())
    } catch { /* ignore */ }
  }

  const handleProductChange = (productId: string) => {
    const product = products.find(p => p.id === productId) || null
    setSelectedProduct(product)
    if (product) {
      form.setFieldsValue({ sellingPrice: product.sellingPrice })
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: values.productId,
          buyerId: values.buyerId,
          quantity: values.quantity,
          sellingPrice: values.sellingPrice,
          date: (values.date as dayjs.Dayjs).toISOString(),
          note: values.note,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
        return
      }

      message.success('ขายสินค้าสำเร็จ')
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
      title="ขายสินค้า"
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
            onChange={handleProductChange}
            filterOption={(input, option) =>
              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={products.map(p => ({
              value: p.id,
              label: `${p.name} (คงเหลือ: ${p.stockRemaining ?? 0})`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="buyerId"
          label="ผู้ซื้อ"
          rules={[{ required: true, message: 'กรุณาเลือกผู้ซื้อ' }]}
        >
          <Select
            showSearch
            placeholder="ค้นหาและเลือกผู้ซื้อ"
            filterOption={(input, option) =>
              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={buyers.map(b => ({ value: b.id, label: b.name }))}
          />
        </Form.Item>

        <Form.Item
          name="quantity"
          label={`จำนวน${selectedProduct ? ` (คงเหลือ: ${selectedProduct.stockRemaining ?? 0})` : ''}`}
          rules={[{ required: true, message: 'กรุณากรอกจำนวน' }]}
        >
          <InputNumber
            min={1}
            max={selectedProduct?.stockRemaining ?? undefined}
            style={{ width: '100%' }}
            placeholder="จำนวน"
          />
        </Form.Item>

        <Form.Item
          name="sellingPrice"
          label="ราคาขายต่อหน่วย (บาท)"
          rules={[{ required: true, message: 'กรุณากรอกราคาขาย' }]}
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
