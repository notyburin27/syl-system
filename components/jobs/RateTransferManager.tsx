'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Button, Modal, Form, Select, InputNumber, App, Space, Popconfirm, Row, Col } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons'
import ImportCSVModal from './ImportCSVModal'
import type { Location } from '@/types/job'
import { JOB_TYPES, SIZE_OPTIONS, getJobTypeLabel } from '@/types/job'
import dayjs from 'dayjs'

interface RateTransfer {
  id: string
  jobType: string
  size: string
  locationId: string
  pickupFee: number
  returnFee: number
  createdAt: string
  location: { id: string; name: string }
}

export default function RateTransferManager() {
  const { message } = App.useApp()
  const [rates, setRates] = useState<RateTransfer[]>([])
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<RateTransfer | null>(null)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Filters
  const [filterJobType, setFilterJobType] = useState<string | undefined>()
  const [filterSize, setFilterSize] = useState<string | undefined>()
  const [filterLocation, setFilterLocation] = useState<string | undefined>()

  const fetchRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rates/transfer')
      if (res.ok) setRates(await res.json())
    } catch { message.error('เกิดข้อผิดพลาดในการดึงข้อมูล') }
    finally { setLoading(false) }
  }, [message])

  const fetchLocations = useCallback(async () => {
    const res = await fetch('/api/locations')
    if (res.ok) setLocations(await res.json())
  }, [])

  useEffect(() => { fetchRates(); fetchLocations() }, [fetchRates, fetchLocations])

  const generalLocations = useMemo(() => locations.filter(l => l.type === 'general'), [locations])

  const filteredRates = useMemo(() => rates.filter(r => {
    if (filterJobType && r.jobType !== filterJobType) return false
    if (filterSize && r.size !== filterSize) return false
    if (filterLocation && r.locationId !== filterLocation) return false
    return true
  }), [rates, filterJobType, filterSize, filterLocation])

  const handleOpenModal = (rate?: RateTransfer) => {
    if (rate) {
      setEditingRate(rate)
      form.setFieldsValue({ pickupFee: Number(rate.pickupFee), returnFee: Number(rate.returnFee) })
    } else {
      setEditingRate(null)
      form.resetFields()
    }
    setModalOpen(true)
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitLoading(true)
    try {
      const url = editingRate ? `/api/rates/transfer/${editingRate.id}` : '/api/rates/transfer'
      const method = editingRate ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) { message.error((await res.json()).error || 'เกิดข้อผิดพลาด'); return }
      message.success(editingRate ? 'แก้ไขสำเร็จ' : 'เพิ่มสำเร็จ')
      setModalOpen(false)
      fetchRates()
    } catch { message.error('เกิดข้อผิดพลาด') }
    finally { setSubmitLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/rates/transfer/${id}`, { method: 'DELETE' })
    if (res.ok) { message.success('ลบสำเร็จ'); fetchRates() }
    else message.error((await res.json()).error || 'เกิดข้อผิดพลาด')
  }

  const handleExport = () => {
    const headers = ['jobType', 'size', 'locationName', 'pickupFee', 'returnFee']
    const labels = ['ลักษณะงาน', 'SIZE', 'สถานที่', 'ค่ารับตู้', 'ค่าคืนตู้']
    const rows = filteredRates.map(r => [
      r.jobType, r.size, r.location.name,
      Number(r.pickupFee), Number(r.returnFee),
    ])
    const csv = [headers.join(','), labels.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'rate_transfer.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const locOptions = generalLocations.map(l => ({ value: l.id, label: l.name }))

  const columns = [
    { title: 'ลักษณะงาน', dataIndex: 'jobType', key: 'jobType', width: 110, render: (v: string) => getJobTypeLabel(v) },
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'สถานที่', key: 'location', render: (_: unknown, r: RateTransfer) => r.location.name },
    { title: 'ค่ารับตู้', dataIndex: 'pickupFee', key: 'pickupFee', width: 100, render: (v: number) => Number(v).toLocaleString() },
    { title: 'ค่าคืนตู้', dataIndex: 'returnFee', key: 'returnFee', width: 100, render: (v: number) => Number(v).toLocaleString() },
    { title: 'วันที่สร้าง', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    {
      title: 'จัดการ', key: 'actions', width: 90,
      render: (_: unknown, r: RateTransfer) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(r)} data-testid={`rate-transfer-edit-btn-${r.id}`} />
          <Popconfirm title="ยืนยันการลบ" onConfirm={() => handleDelete(r.id)} okText="ลบ" cancelText="ยกเลิก">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} data-testid={`rate-transfer-delete-btn-${r.id}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>อัตราคาดการณ์โอน</h2>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport}>Export CSV</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()} data-testid="rate-transfer-add-btn">เพิ่ม</Button>
        </Space>
      </div>

      {/* Filter bar */}
      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select id="rate-transfer-filter-job-type" allowClear placeholder="ลักษณะงาน" style={{ width: 130 }}
            options={JOB_TYPES.map(t => ({ value: t.value, label: t.label }))}
            value={filterJobType} onChange={setFilterJobType} />
        </Col>
        <Col>
          <Select allowClear placeholder="SIZE" style={{ width: 100 }}
            options={SIZE_OPTIONS.map(s => ({ value: s, label: s }))}
            value={filterSize} onChange={setFilterSize} />
        </Col>
        <Col>
          <Select allowClear showSearch placeholder="สถานที่" style={{ width: 180 }}
            options={locOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={filterLocation} onChange={setFilterLocation} popupMatchSelectWidth={false} />
        </Col>
      </Row>

      <Table columns={columns} dataSource={filteredRates} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <Modal
        title={editingRate ? 'แก้ไขอัตราคาดการณ์โอน' : 'เพิ่มอัตราคาดการณ์โอน'}
        open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} confirmLoading={submitLoading}
        okText={editingRate ? 'บันทึก' : 'เพิ่ม'} cancelText="ยกเลิก"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editingRate && (
            <>
              <Form.Item name="jobType" label="ลักษณะงาน" rules={[{ required: true, message: 'กรุณาเลือกลักษณะงาน' }]}>
                <Select id="rate-transfer-job-type" showSearch options={JOB_TYPES.map(t => ({ value: t.value, label: t.label }))} placeholder="เลือกลักษณะงาน" />
              </Form.Item>
              <Form.Item name="size" label="SIZE" rules={[{ required: true, message: 'กรุณาเลือก SIZE' }]}>
                <Select id="rate-transfer-size" showSearch options={SIZE_OPTIONS.map(s => ({ value: s, label: s }))} placeholder="เลือก SIZE" />
              </Form.Item>
              <Form.Item name="locationId" label="สถานที่" rules={[{ required: true, message: 'กรุณาเลือกสถานที่' }]}>
                <Select id="rate-transfer-location" showSearch options={locOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} placeholder="เลือกสถานที่" popupMatchSelectWidth={false} />
              </Form.Item>
            </>
          )}
          <Form.Item name="pickupFee" label="ค่ารับตู้" rules={[{ required: true, message: 'กรุณากรอกค่ารับตู้' }]}>
            <InputNumber style={{ width: '100%' }} min={0} placeholder="0" data-testid="rate-transfer-pickup-fee-input" />
          </Form.Item>
          <Form.Item name="returnFee" label="ค่าคืนตู้" rules={[{ required: true, message: 'กรุณากรอกค่าคืนตู้' }]}>
            <InputNumber style={{ width: '100%' }} min={0} placeholder="0" data-testid="rate-transfer-return-fee-input" />
          </Form.Item>
        </Form>
      </Modal>

      <ImportCSVModal
        open={importOpen}
        title="Import อัตราคาดการณ์โอน"
        apiEndpoint="/api/rates/transfer/import"
        headers={['jobType', 'size', 'locationName', 'pickupFee', 'returnFee']}
        headerLabels={{ jobType: 'ลักษณะงาน', size: 'SIZE', locationName: 'สถานที่', pickupFee: 'ค่ารับตู้', returnFee: 'ค่าคืนตู้' }}
        exampleRow={['ขาเข้า', '20DC', 'ท่าเรือแหลมฉบัง', '500', '500']}
        templateFileName="rate_transfer_template.csv"
        onClose={() => setImportOpen(false)}
        onSuccess={fetchRates}
      />
    </>
  )
}
