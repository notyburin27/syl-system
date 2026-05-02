'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Button, Modal, Form, Select, InputNumber, App, Space, Popconfirm, Row, Col } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons'
import ImportCSVModal from './ImportCSVModal'
import type { Location } from '@/types/job'
import { JOB_TYPES, SIZE_OPTIONS, getJobTypeLabel } from '@/types/job'

const DRIVER_WAGE_JOB_TYPES = JOB_TYPES.filter(t => t.value !== 'advance')

function getSizeOptions(jobType?: string): string[] {
  if (jobType === 'flatbed') return ['truck']
  return SIZE_OPTIONS.filter(s => s !== 'truck')
}
import dayjs from 'dayjs'

interface RateDriverWage {
  id: string
  jobType: string
  size: string
  factoryLocationId: string | null
  driverWage: number
  createdAt: string
  factoryLocation: { id: string; name: string } | null
}

const TOWING_JOB_TYPE = 'towing'

export default function RateDriverWageManager() {
  const { message } = App.useApp()
  const [rates, setRates] = useState<RateDriverWage[]>([])
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<RateDriverWage | null>(null)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedJobType, setSelectedJobType] = useState<string | undefined>()

  // Filters
  const [filterJobType, setFilterJobType] = useState<string | undefined>()
  const [filterSize, setFilterSize] = useState<string | undefined>()
  const [filterFactory, setFilterFactory] = useState<string | undefined>()

  const fetchRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rates/driver-wage')
      if (res.ok) setRates(await res.json())
    } catch { message.error('เกิดข้อผิดพลาดในการดึงข้อมูล') }
    finally { setLoading(false) }
  }, [message])

  const fetchLocations = useCallback(async () => {
    const res = await fetch('/api/locations')
    if (res.ok) setLocations(await res.json())
  }, [])

  useEffect(() => { fetchRates(); fetchLocations() }, [fetchRates, fetchLocations])

  const factoryLocations = useMemo(() => locations.filter(l => l.type === 'factory'), [locations])

  const filteredRates = useMemo(() => rates.filter(r => {
    if (filterJobType && r.jobType !== filterJobType) return false
    if (filterSize && r.size !== filterSize) return false
    if (filterFactory && r.factoryLocationId !== filterFactory) return false
    return true
  }), [rates, filterJobType, filterSize, filterFactory])

  const handleOpenModal = (rate?: RateDriverWage) => {
    if (rate) {
      setEditingRate(rate)
      setSelectedJobType(rate.jobType)
      form.setFieldsValue({ driverWage: Number(rate.driverWage) })
    } else {
      setEditingRate(null)
      setSelectedJobType(undefined)
      form.resetFields()
    }
    setModalOpen(true)
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitLoading(true)
    try {
      const url = editingRate ? `/api/rates/driver-wage/${editingRate.id}` : '/api/rates/driver-wage'
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
    const res = await fetch(`/api/rates/driver-wage/${id}`, { method: 'DELETE' })
    if (res.ok) { message.success('ลบสำเร็จ'); fetchRates() }
    else message.error((await res.json()).error || 'เกิดข้อผิดพลาด')
  }

  const handleExport = () => {
    const headers = ['jobType', 'size', 'factoryLocationName', 'driverWage']
    const labels = ['ลักษณะงาน', 'SIZE', 'โรงงาน', 'ค่าเที่ยว']
    const rows = filteredRates.map(r => [r.jobType, r.size, r.factoryLocation?.name ?? '', Number(r.driverWage)])
    const csv = [headers.join(','), labels.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'rate_driver_wage.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const factoryOptions = factoryLocations.map(l => ({ value: l.id, label: l.name }))

  const columns = [
    { title: 'ลักษณะงาน', dataIndex: 'jobType', key: 'jobType', width: 110, render: (v: string) => getJobTypeLabel(v) },
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'โรงงาน', key: 'factory', render: (_: unknown, r: RateDriverWage) => r.factoryLocation?.name ?? '-' },
    { title: 'ค่าเที่ยว', dataIndex: 'driverWage', key: 'driverWage', width: 110, render: (v: number) => Number(v).toLocaleString() },
    { title: 'วันที่สร้าง', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    {
      title: 'จัดการ', key: 'actions', width: 90,
      render: (_: unknown, r: RateDriverWage) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(r)} data-testid={`rate-driver-wage-edit-btn-${r.id}`} />
          <Popconfirm title="ยืนยันการลบ" onConfirm={() => handleDelete(r.id)} okText="ลบ" cancelText="ยกเลิก">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} data-testid={`rate-driver-wage-delete-btn-${r.id}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>อัตราค่าเที่ยวคนขับ</h2>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport}>Export CSV</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()} data-testid="rate-driver-wage-add-btn">เพิ่ม</Button>
        </Space>
      </div>

      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select allowClear placeholder="ลักษณะงาน" style={{ width: 130 }}
            options={DRIVER_WAGE_JOB_TYPES.map(t => ({ value: t.value, label: t.label }))}
            value={filterJobType} onChange={setFilterJobType} />
        </Col>
        <Col>
          <Select allowClear placeholder="SIZE" style={{ width: 100 }}
            options={SIZE_OPTIONS.map(s => ({ value: s, label: s }))}
            value={filterSize} onChange={setFilterSize} />
        </Col>
        <Col>
          <Select allowClear showSearch placeholder="โรงงาน" style={{ width: 180 }}
            options={factoryOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={filterFactory} onChange={setFilterFactory} popupMatchSelectWidth={false} />
        </Col>
      </Row>

      <Table columns={columns} dataSource={filteredRates} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <Modal
        title={editingRate ? 'แก้ไขอัตราค่าเที่ยว' : 'เพิ่มอัตราค่าเที่ยว'}
        open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} confirmLoading={submitLoading}
        okText={editingRate ? 'บันทึก' : 'เพิ่ม'} cancelText="ยกเลิก"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editingRate && (
            <>
              <Form.Item name="jobType" label="ลักษณะงาน" rules={[{ required: true, message: 'กรุณาเลือกลักษณะงาน' }]}>
                <Select id="rate-driver-wage-job-type" showSearch options={DRIVER_WAGE_JOB_TYPES.map(t => ({ value: t.value, label: t.label }))} placeholder="เลือกลักษณะงาน"
                  onChange={(v) => { setSelectedJobType(v); form.setFieldsValue({ factoryLocationId: undefined, size: undefined }) }} />
              </Form.Item>
              <Form.Item name="size" label="SIZE" rules={[{ required: true, message: 'กรุณาเลือก SIZE' }]}>
                <Select id="rate-driver-wage-size" showSearch options={getSizeOptions(selectedJobType).map(s => ({ value: s, label: s }))} placeholder="เลือก SIZE" />
              </Form.Item>
              {selectedJobType !== TOWING_JOB_TYPE && (
                <Form.Item name="factoryLocationId" label="โรงงาน" rules={[{ required: true, message: 'กรุณาเลือกโรงงาน' }]}>
                  <Select id="rate-driver-wage-factory" showSearch options={factoryOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} placeholder="เลือกโรงงาน" popupMatchSelectWidth={false} />
                </Form.Item>
              )}
            </>
          )}
          <Form.Item name="driverWage" label="ค่าเที่ยว" rules={[{ required: true, message: 'กรุณากรอกค่าเที่ยว' }]}>
            <InputNumber style={{ width: '100%' }} min={0} placeholder="0" data-testid="rate-driver-wage-amount-input" />
          </Form.Item>
        </Form>
      </Modal>

      <ImportCSVModal
        open={importOpen}
        title="Import อัตราค่าเที่ยว"
        apiEndpoint="/api/rates/driver-wage/import"
        headers={['jobType', 'size', 'factoryLocationName', 'driverWage']}
        headerLabels={{ jobType: 'ลักษณะงาน', size: 'SIZE', factoryLocationName: 'โรงงาน', driverWage: 'ค่าเที่ยว' }}
        exampleRow={['ขาเข้า', '20DC', 'โรงงาน ABC', '2000']}
        templateFileName="rate_driver_wage_template.csv"
        onClose={() => setImportOpen(false)}
        onSuccess={fetchRates}
      />
    </>
  )
}
