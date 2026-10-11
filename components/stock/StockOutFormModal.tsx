'use client'

import { useState, useEffect } from 'react'
import { Modal, Form, Select, InputNumber, DatePicker, Input, App, Button } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { Product, Buyer } from '@/types/stock'
import dayjs from 'dayjs'

interface StockOutFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface SaleItem {
  productId?: string
  quantity?: number
  sellingPrice?: number
}

const formatMoney = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// สินค้า | จำนวน | ราคา/หน่วย | รวม | ลบ
const ROW_GRID = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px 120px 100px 32px', gap: 8, alignItems: 'start' } as const

export default function StockOutFormModal({ open, onClose, onSuccess }: StockOutFormModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const items: SaleItem[] = Form.useWatch('items', form) ?? []

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ date: dayjs(), items: [{}] })
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

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId)
    if (product) {
      form.setFieldValue(['items', index, 'sellingPrice'], product.sellingPrice)
    }
  }

  const rowTotal = (item?: SaleItem) =>
    item?.quantity && item.sellingPrice != null ? item.quantity * item.sellingPrice : null

  const grandTotal = items.reduce((sum, item) => sum + (rowTotal(item) ?? 0), 0)

  const handleSubmit = async (values: { buyerId: string; date: dayjs.Dayjs; note?: string; items: SaleItem[] }) => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId: values.buyerId,
          date: values.date.toISOString(),
          note: values.note,
          items: values.items,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
        return
      }

      message.success(`ขายสินค้าสำเร็จ ${values.items.length} รายการ`)
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
      okText={`บันทึก ${items.length} รายการ`}
      cancelText="ยกเลิก"
      width={760}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: 16 }}>
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
            name="date"
            label="วันที่"
            rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </div>

        <div style={{ ...ROW_GRID, fontWeight: 500, marginBottom: 8 }}>
          <span><span style={{ color: '#ff4d4f' }}>* </span>สินค้า</span>
          <span style={{ textAlign: 'right' }}>จำนวน</span>
          <span style={{ textAlign: 'right' }}>ราคา/หน่วย</span>
          <span style={{ textAlign: 'right' }}>รวม</span>
          <span />
        </div>

        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => {
                const item = items[name]
                const product = products.find(p => p.id === item?.productId)
                const total = rowTotal(item)
                return (
                  <div key={key} style={ROW_GRID}>
                    <Form.Item
                      name={[name, 'productId']}
                      rules={[{ required: true, message: 'กรุณาเลือกสินค้า' }]}
                    >
                      <Select
                        showSearch
                        placeholder="ค้นหาและเลือกสินค้า"
                        onChange={(value: string) => handleProductChange(name, value)}
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
                      name={[name, 'quantity']}
                      rules={[{ required: true, message: 'กรอกจำนวน' }]}
                    >
                      <InputNumber
                        min={1}
                        max={product?.stockRemaining ?? undefined}
                        style={{ width: '100%' }}
                        placeholder="จำนวน"
                      />
                    </Form.Item>
                    <Form.Item
                      name={[name, 'sellingPrice']}
                      rules={[{ required: true, message: 'กรอกราคา' }]}
                    >
                      <InputNumber
                        min={0}
                        step={0.01}
                        style={{ width: '100%' }}
                        placeholder="0.00"
                        formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      />
                    </Form.Item>
                    <div style={{ textAlign: 'right', lineHeight: '32px' }}>
                      {total == null ? '-' : formatMoney(total)}
                    </div>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label="ลบรายการ"
                      disabled={fields.length === 1}
                      onClick={() => remove(name)}
                    />
                  </div>
                )
              })}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({})} style={{ marginBottom: 16 }}>
                เพิ่มรายการ
              </Button>
            </>
          )}
        </Form.List>

        <Form.Item name="note" label="หมายเหตุ">
          <Input.TextArea rows={2} placeholder="หมายเหตุ (ถ้ามี)" />
        </Form.Item>

        <div style={{ textAlign: 'right', fontSize: 16 }}>
          รวมทั้งสิ้น <strong>{formatMoney(grandTotal)}</strong> บาท
        </div>
      </Form>
    </Modal>
  )
}
