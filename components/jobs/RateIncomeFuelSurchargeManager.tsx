'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Modal, Form, InputNumber, App, Space, Popconfirm, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'

interface Surcharge {
  id: string
  rateIncomeId: string
  fuelPriceMin: number
  fuelPriceMax: number
  surcharge: number
}

interface RateIncomeFuelSurchargeManagerProps {
  open: boolean
  onClose: () => void
  rateIncomeId: string
  rateIncomeLabel: string // เช่น "ขาเข้า / 20DC / โรงงาน ABC / บริษัท XYZ"
}

export default function RateIncomeFuelSurchargeManager({
  open,
  onClose,
  rateIncomeId,
  rateIncomeLabel,
}: RateIncomeFuelSurchargeManagerProps) {
  const { message } = App.useApp()
  const [surcharges, setSurcharges] = useState<Surcharge[]>([])
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Surcharge | null>(null)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)

  const fetchSurcharges = useCallback(async () => {
    if (!rateIncomeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/rates/income/surcharge?rateIncomeId=${rateIncomeId}`)
      if (res.ok) setSurcharges(await res.json())
    } catch { message.error('เกิดข้อผิดพลาดในการดึงข้อมูล') }
    finally { setLoading(false) }
  }, [rateIncomeId, message])

  useEffect(() => {
    if (open) fetchSurcharges()
  }, [open, fetchSurcharges])

  const handleOpenForm = (item?: Surcharge) => {
    if (item) {
      setEditingItem(item)
      form.setFieldsValue({
        fuelPriceMin: Number(item.fuelPriceMin),
        fuelPriceMax: Number(item.fuelPriceMax),
        surcharge: Number(item.surcharge),
      })
    } else {
      setEditingItem(null)
      form.resetFields()
    }
    setFormOpen(true)
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitLoading(true)
    try {
      const url = editingItem
        ? `/api/rates/income/surcharge/${editingItem.id}`
        : '/api/rates/income/surcharge'
      const method = editingItem ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, rateIncomeId }),
      })
      if (!res.ok) { message.error((await res.json()).error || 'เกิดข้อผิดพลาด'); return }
      message.success(editingItem ? 'แก้ไขสำเร็จ' : 'เพิ่มสำเร็จ')
      setFormOpen(false)
      fetchSurcharges()
    } catch { message.error('เกิดข้อผิดพลาด') }
    finally { setSubmitLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/rates/income/surcharge/${id}`, { method: 'DELETE' })
    if (res.ok) { message.success('ลบสำเร็จ'); fetchSurcharges() }
    else message.error((await res.json()).error || 'เกิดข้อผิดพลาด')
  }

  const columns = [
    {
      title: 'ราคาน้ำมัน ≥ (บาท/ลิตร)',
      dataIndex: 'fuelPriceMin',
      key: 'fuelPriceMin',
      render: (v: number) => Number(v).toFixed(2),
    },
    {
      title: 'ราคาน้ำมัน < (บาท/ลิตร)',
      dataIndex: 'fuelPriceMax',
      key: 'fuelPriceMax',
      render: (v: number) => Number(v).toFixed(2),
    },
    {
      title: 'ค่าปรับ income (บาท)',
      dataIndex: 'surcharge',
      key: 'surcharge',
      render: (v: number) => {
        const n = Number(v)
        return <span style={{ color: n >= 0 ? '#389e0d' : '#cf1322' }}>{n >= 0 ? '+' : ''}{n.toLocaleString()}</span>
      },
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 90,
      render: (_: unknown, r: Surcharge) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenForm(r)} data-testid={`surcharge-edit-btn-${r.id}`} />
          <Popconfirm title="ยืนยันการลบ" onConfirm={() => handleDelete(r.id)} okText="ลบ" cancelText="ยกเลิก">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} data-testid={`surcharge-delete-btn-${r.id}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Modal
        title="ช่วงราคาน้ำมัน → ค่าปรับ Income"
        open={open}
        onCancel={onClose}
        footer={null}
        width={620}
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {rateIncomeLabel}
        </Typography.Text>
        <div style={{ marginBottom: 12, textAlign: 'right' }}>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleOpenForm()} data-testid="surcharge-add-btn">เพิ่มช่วงราคา</Button>
        </div>
        <Table
          columns={columns}
          dataSource={surcharges}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
        />
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          * ราคา income ที่ใช้จริง = ราคาฐาน + ค่าปรับ ตามช่วงราคาน้ำมัน ณ วันที่งาน
        </Typography.Text>
      </Modal>

      <Modal
        title={editingItem ? 'แก้ไขช่วงราคาน้ำมัน' : 'เพิ่มช่วงราคาน้ำมัน'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={submitLoading}
        okText={editingItem ? 'บันทึก' : 'เพิ่ม'}
        cancelText="ยกเลิก"
        width={400}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="fuelPriceMin"
            label="ราคาน้ำมัน ≥ (บาท/ลิตร)"
            rules={[{ required: true, message: 'กรุณากรอกราคาต่ำสุด' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} placeholder="เช่น 30.00" data-testid="surcharge-fuel-min-input" />
          </Form.Item>
          <Form.Item
            name="fuelPriceMax"
            label="ราคาน้ำมัน < (บาท/ลิตร)"
            rules={[{ required: true, message: 'กรุณากรอกราคาสูงสุด' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} placeholder="เช่น 35.00" data-testid="surcharge-fuel-max-input" />
          </Form.Item>
          <Form.Item
            name="surcharge"
            label="ค่าปรับ income (บาท) — ใส่ - หากลดราคา"
            rules={[{ required: true, message: 'กรุณากรอกค่าปรับ' }]}
          >
            <InputNumber style={{ width: '100%' }} step={100} placeholder="เช่น 500 หรือ -200" data-testid="surcharge-amount-input" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
