'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Button, Modal, Form, Select, InputNumber, App, Space, Popconfirm, Row, Col } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons'
import ImportCSVModal from './ImportCSVModal'
import type { Location } from '@/types/job'
import { JOB_TYPES, SIZE_OPTIONS } from '@/types/job'
import dayjs from 'dayjs'

interface RateTransfer {
  id: string
  jobType: string
  size: string
  pickupLocationId: string
  returnLocationId: string
  pickupFee: number
  returnFee: number
  createdAt: string
  pickupLocation: { id: string; name: string }
  returnLocation: { id: string; name: string }
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
  const [filterPickup, setFilterPickup] = useState<string | undefined>()
  const [filterReturn, setFilterReturn] = useState<string | undefined>()

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
    if (filterPickup && r.pickupLocationId !== filterPickup) return false
    if (filterReturn && r.returnLocationId !== filterReturn) return false
    return true
  }), [rates, filterJobType, filterSize, filterPickup, filterReturn])

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
    const headers = ['jobType', 'size', 'pickupLocationName', 'returnLocationName', 'pickupFee', 'returnFee']
    const labels = ['ลักษณะงาน', 'SIZE', 'สถานที่รับตู้', 'สถานที่คืนตู้', 'ค่ารับตู้', 'ค่าคืนตู้']
    const rows = filteredRates.map(r => [
      r.jobType, r.size, r.pickupLocation.name, r.returnLocation.name,
      Number(r.pickupFee), Number(r.returnFee),
    ])
    const csv = [headers.join(','), labels.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'rate_transfer.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const locOptions = generalLocations.map(l => ({ value: l.id, label: l.name }))

  const columns = [
    { title: 'ลักษณะงาน', dataIndex: 'jobType', key: 'jobType', width: 110 },
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'สถานที่รับตู้', key: 'pickup', render: (_: unknown, r: RateTransfer) => r.pickupLocation.name },
    { title: 'สถานที่คืนตู้', key: 'return', render: (_: unknown, r: RateTransfer) => r.returnLocation.name },
    { title: 'ค่ารับตู้', dataIndex: 'pickupFee', key: 'pickupFee', width: 100, render: (v: number) => Number(v).toLocaleString() },
    { title: 'ค่าคืนตู้', dataIndex: 'returnFee', key: 'returnFee', width: 100, render: (v: number) => Number(v).toLocaleString() },
    { title: 'วันที่สร้าง', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    {
      title: 'จัดการ', key: 'actions', width: 90,
      render: (_: unknown, r: RateTransfer) => (
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
        <h2 style={{ margin: 0 }}>อัตราคาดการณ์โอน</h2>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport}>Export CSV</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>เพิ่ม</Button>
        </Space>
      </div>

      {/* Filter bar */}
      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select allowClear placeholder="ลักษณะงาน" style={{ width: 130 }}
            options={JOB_TYPES.map(t => ({ value: t.value, label: t.label }))}
            value={filterJobType} onChange={setFilterJobType} />
        </Col>
        <Col>
          <Select allowClear placeholder="SIZE" style={{ width: 100 }}
            options={SIZE_OPTIONS.map(s => ({ value: s, label: s }))}
            value={filterSize} onChange={setFilterSize} />
        </Col>
        <Col>
          <Select allowClear showSearch placeholder="สถานที่รับตู้" style={{ width: 180 }}
            options={locOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={filterPickup} onChange={setFilterPickup} popupMatchSelectWidth={false} />
        </Col>
        <Col>
          <Select allowClear showSearch placeholder="สถานที่คืนตู้" style={{ width: 180 }}
            options={locOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={filterReturn} onChange={setFilterReturn} popupMatchSelectWidth={false} />
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
                <Select showSearch options={JOB_TYPES.map(t => ({ value: t.value, label: t.label }))} placeholder="เลือกลักษณะงาน" />
              </Form.Item>
              <Form.Item name="size" label="SIZE" rules={[{ required: true, message: 'กรุณาเลือก SIZE' }]}>
                <Select showSearch options={SIZE_OPTIONS.map(s => ({ value: s, label: s }))} placeholder="เลือก SIZE" />
              </Form.Item>
              <Form.Item name="pickupLocationId" label="สถานที่รับตู้" rules={[{ required: true, message: 'กรุณาเลือกสถานที่รับตู้' }]}>
                <Select showSearch options={locOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} placeholder="เลือกสถานที่รับตู้" popupMatchSelectWidth={false} />
              </Form.Item>
              <Form.Item name="returnLocationId" label="สถานที่คืนตู้" rules={[{ required: true, message: 'กรุณาเลือกสถานที่คืนตู้' }]}>
                <Select showSearch options={locOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} placeholder="เลือกสถานที่คืนตู้" popupMatchSelectWidth={false} />
              </Form.Item>
            </>
          )}
          <Form.Item name="pickupFee" label="ค่ารับตู้" rules={[{ required: true, message: 'กรุณากรอกค่ารับตู้' }]}>
            <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
          </Form.Item>
          <Form.Item name="returnFee" label="ค่าคืนตู้" rules={[{ required: true, message: 'กรุณากรอกค่าคืนตู้' }]}>
            <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
          </Form.Item>
        </Form>
      </Modal>

      <ImportCSVModal
        open={importOpen}
        title="Import อัตราคาดการณ์โอน"
        apiEndpoint="/api/rates/transfer/import"
        headers={['jobType', 'size', 'pickupLocationName', 'returnLocationName', 'pickupFee', 'returnFee']}
        headerLabels={{ jobType: 'ลักษณะงาน', size: 'SIZE', pickupLocationName: 'สถานที่รับตู้', returnLocationName: 'สถานที่คืนตู้', pickupFee: 'ค่ารับตู้', returnFee: 'ค่าคืนตู้' }}
        exampleRow={['ขาเข้า', '20DC', 'ท่าเรือแหลมฉบัง', 'ท่าเรือแหลมฉบัง', '500', '500']}
        templateFileName="rate_transfer_template.csv"
        onClose={() => setImportOpen(false)}
        onSuccess={fetchRates}
      />
    </>
  )
}
