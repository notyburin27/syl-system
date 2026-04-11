'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Modal, Form, DatePicker, InputNumber, Input, App, Space, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

interface FuelPriceLog {
  id: string
  effectiveDate: string
  pricePerLiter: number
  note: string | null
  createdAt: string
}

export default function FuelPriceLogManager() {
  const { message } = App.useApp()
  const [logs, setLogs] = useState<FuelPriceLog[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLog, setEditingLog] = useState<FuelPriceLog | null>(null)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fuel-price-log')
      if (res.ok) setLogs(await res.json())
    } catch { message.error('เกิดข้อผิดพลาดในการดึงข้อมูล') }
    finally { setLoading(false) }
  }, [message])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleOpenModal = (log?: FuelPriceLog) => {
    if (log) {
      setEditingLog(log)
      form.setFieldsValue({
        effectiveDate: dayjs(log.effectiveDate),
        pricePerLiter: Number(log.pricePerLiter),
        note: log.note,
      })
    } else {
      setEditingLog(null)
      form.resetFields()
    }
    setModalOpen(true)
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitLoading(true)
    try {
      const payload = {
        effectiveDate: dayjs(values.effectiveDate as string).format('YYYY-MM-DD'),
        pricePerLiter: values.pricePerLiter,
        note: values.note,
      }
      const url = editingLog ? `/api/fuel-price-log/${editingLog.id}` : '/api/fuel-price-log'
      const method = editingLog ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { message.error((await res.json()).error || 'เกิดข้อผิดพลาด'); return }
      message.success(editingLog ? 'แก้ไขสำเร็จ' : 'เพิ่มสำเร็จ')
      setModalOpen(false)
      fetchLogs()
    } catch { message.error('เกิดข้อผิดพลาด') }
    finally { setSubmitLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/fuel-price-log/${id}`, { method: 'DELETE' })
    if (res.ok) { message.success('ลบสำเร็จ'); fetchLogs() }
    else message.error((await res.json()).error || 'เกิดข้อผิดพลาด')
  }

  const columns = [
    {
      title: 'วันที่มีผล',
      dataIndex: 'effectiveDate',
      key: 'effectiveDate',
      width: 130,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'ราคาน้ำมัน (บาท/ลิตร)',
      dataIndex: 'pricePerLiter',
      key: 'pricePerLiter',
      width: 180,
      render: (v: number) => Number(v).toFixed(2),
    },
    {
      title: 'หมายเหตุ',
      dataIndex: 'note',
      key: 'note',
      render: (v: string | null) => v || '-',
    },
    {
      title: 'วันที่บันทึก',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 90,
      render: (_: unknown, r: FuelPriceLog) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(r)} />
          <Popconfirm title="ยืนยันการลบ" onConfirm={() => handleDelete(r.id)} okText="ลบ" cancelText="ยกเลิก">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>บันทึกราคาน้ำมัน</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>เพิ่ม</Button>
      </div>

      <Table columns={columns} dataSource={logs} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <Modal
        title={editingLog ? 'แก้ไขราคาน้ำมัน' : 'เพิ่มราคาน้ำมัน'}
        open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} confirmLoading={submitLoading}
        okText={editingLog ? 'บันทึก' : 'เพิ่ม'} cancelText="ยกเลิก"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="effectiveDate" label="วันที่มีผล" rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="เลือกวันที่" />
          </Form.Item>
          <Form.Item name="pricePerLiter" label="ราคาน้ำมัน (บาท/ลิตร)" rules={[{ required: true, message: 'กรุณากรอกราคาน้ำมัน' }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="note" label="หมายเหตุ">
            <Input placeholder="หมายเหตุ (ถ้ามี)" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
