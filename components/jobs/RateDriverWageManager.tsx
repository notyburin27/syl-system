'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Button, Modal, Form, Select, InputNumber, App, Space, Popconfirm, Row, Col, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined, CopyOutlined } from '@ant-design/icons'
import ImportCSVModal from './ImportCSVModal'
import type { Location } from '@/types/job'
import { RATE_JOB_TYPES, SIZE_OPTIONS, getJobTypeLabel } from '@/types/job'

interface RateDriverWage {
  id: string
  jobType: string
  size: string
  factoryLocationId: string | null
  driverWage: number
  createdAt: string
  factoryLocation: { id: string; name: string } | null
}

/** ข้อความ error จาก API เมื่อ combination นั้นมีอยู่แล้ว */
const DUPLICATE_ERROR = 'มีข้อมูลนี้อยู่แล้ว'

/** ทอยตู้ตั้งอัตราแบบไม่ระบุโรงงาน (ตรงกับเงื่อนไขใน POST /api/rates/driver-wage) */
const isTowingJobType = (jobType: string) => jobType === 'towing'

/** จำนวนรายการที่จะถูกสร้างจาก combination ที่เลือกไว้ */
function comboCount(v: Partial<DriverWageFormValues>): number {
  const towingCount = (v.jobTypes ?? []).filter(isTowingJobType).length
  const otherCount = (v.jobTypes ?? []).length - towingCount
  const sizeCount = v.sizes?.length ?? 0
  const factoryCount = v.factoryLocationIds?.length ?? 0
  // ทอยตู้ไม่ผูกกับโรงงาน — นับเป็น 1 รายการต่อ SIZE
  return sizeCount * (towingCount + otherCount * factoryCount)
}

interface DriverWageFormValues {
  jobTypes: string[]
  sizes: string[]
  factoryLocationIds: string[]
  driverWage: number
}

export default function RateDriverWageManager() {
  const { message } = App.useApp()
  const [rates, setRates] = useState<RateDriverWage[]>([])
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<RateDriverWage | null>(null)
  const [copyingRate, setCopyingRate] = useState(false)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

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
  const factoryNameById = useMemo(() => new Map(factoryLocations.map(l => [l.id, l.name])), [factoryLocations])

  const filteredRates = useMemo(() => rates.filter(r => {
    if (filterJobType && r.jobType !== filterJobType) return false
    if (filterSize && r.size !== filterSize) return false
    if (filterFactory && r.factoryLocationId !== filterFactory) return false
    return true
  }), [rates, filterJobType, filterSize, filterFactory])

  const handleOpenModal = (rate?: RateDriverWage) => {
    if (rate) {
      setEditingRate(rate)
      setCopyingRate(false)
      form.setFieldsValue({ driverWage: Number(rate.driverWage) })
    } else {
      setEditingRate(null)
      setCopyingRate(false)
      form.resetFields()
    }
    setModalOpen(true)
  }

  const handleCopy = (rate: RateDriverWage) => {
    setEditingRate(null)
    setCopyingRate(true)
    form.resetFields()
    form.setFieldsValue({
      jobTypes: [rate.jobType],
      sizes: [rate.size],
      factoryLocationIds: rate.factoryLocationId ? [rate.factoryLocationId] : [],
      driverWage: Number(rate.driverWage),
    })
    setModalOpen(true)
  }

  const handleEdit = async (driverWage: number) => {
    const res = await fetch(`/api/rates/driver-wage/${editingRate!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverWage }),
    })
    if (!res.ok) { message.error((await res.json()).error || 'เกิดข้อผิดพลาด'); return }
    message.success('แก้ไขสำเร็จ')
    setModalOpen(false)
    fetchRates()
  }

  /** เพิ่มทีละ combination ของ ลักษณะงาน x SIZE x โรงงาน — ข้ามรายการที่มีอยู่แล้ว
   *  ทอยตู้ไม่ผูกกับโรงงาน จึงสร้างเป็น factoryLocationId = null รายการเดียวต่อ SIZE */
  const handleBulkCreate = async (values: DriverWageFormValues) => {
    const combos = values.jobTypes.flatMap(jobType =>
      values.sizes.flatMap(size =>
        isTowingJobType(jobType)
          ? [{ jobType, size, factoryLocationId: null as string | null }]
          : (values.factoryLocationIds ?? []).map(
              (factoryLocationId): { jobType: string; size: string; factoryLocationId: string | null } =>
                ({ jobType, size, factoryLocationId }),
            ),
      ),
    )

    let created = 0
    const skipped: string[] = []
    const failed: string[] = []

    for (const combo of combos) {
      const label = `${getJobTypeLabel(combo.jobType)} / ${combo.size} / ${(combo.factoryLocationId && factoryNameById.get(combo.factoryLocationId)) ?? '-'}`
      try {
        const res = await fetch('/api/rates/driver-wage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...combo, driverWage: values.driverWage }),
        })
        if (res.ok) { created++; continue }
        const { error } = (await res.json()) as { error?: string }
        if (error === DUPLICATE_ERROR) skipped.push(label)
        else failed.push(`${label}: ${error || 'เกิดข้อผิดพลาด'}`)
      } catch {
        failed.push(`${label}: เกิดข้อผิดพลาด`)
      }
    }

    const summary = [`เพิ่มสำเร็จ ${created} รายการ`]
    if (skipped.length) summary.push(`ข้าม ${skipped.length} รายการที่มีอยู่แล้ว`)
    if (failed.length) summary.push(`ไม่สำเร็จ ${failed.length} รายการ`)
    const text = summary.join(', ')

    if (failed.length) message.error(`${text} — ${failed.join('; ')}`, 8)
    else if (created) message.success(text)
    else message.warning(text)

    if (created) setModalOpen(false)
    fetchRates()
  }

  const handleSubmit = async (values: DriverWageFormValues) => {
    setSubmitLoading(true)
    try {
      if (editingRate) await handleEdit(values.driverWage)
      else await handleBulkCreate(values)
    } finally { setSubmitLoading(false) }
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
  const jobTypeOptions = RATE_JOB_TYPES.map(t => ({ value: t.value, label: t.label }))
  const sizeOptions = SIZE_OPTIONS.map(s => ({ value: s, label: s }))

  const columns = [
    { title: 'ลักษณะงาน', dataIndex: 'jobType', key: 'jobType', width: 110, render: (v: string) => getJobTypeLabel(v) },
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'โรงงาน', key: 'factory', render: (_: unknown, r: RateDriverWage) => r.factoryLocation?.name ?? '-' },
    { title: 'ค่าเที่ยว', dataIndex: 'driverWage', key: 'driverWage', width: 110, align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
    {
      title: 'จัดการ', key: 'actions', width: 90,
      render: (_: unknown, r: RateDriverWage) => (
        <Space>
          <Button type="link" size="small" icon={<CopyOutlined />} title="คัดลอก" onClick={() => handleCopy(r)} data-testid={`rate-driver-wage-copy-btn-${r.id}`} />
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
            options={jobTypeOptions}
            value={filterJobType} onChange={setFilterJobType} />
        </Col>
        <Col>
          <Select allowClear placeholder="SIZE" style={{ width: 100 }}
            options={sizeOptions}
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
        title={editingRate ? 'แก้ไขอัตราค่าเที่ยว' : copyingRate ? 'คัดลอกอัตราค่าเที่ยว' : 'เพิ่มอัตราค่าเที่ยว'}
        open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} confirmLoading={submitLoading}
        okText={editingRate ? 'บันทึก' : 'เพิ่ม'} cancelText="ยกเลิก"
        afterClose={() => setCopyingRate(false)}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editingRate && (
            <>
              <Form.Item name="jobTypes" label="ลักษณะงาน" rules={[{ required: true, message: 'กรุณาเลือกลักษณะงาน' }]}>
                <Select id="rate-driver-wage-job-type" mode="multiple" allowClear showSearch optionFilterProp="label"
                  options={jobTypeOptions} placeholder="เลือกลักษณะงาน (เลือกได้หลายรายการ)" />
              </Form.Item>
              <Form.Item name="sizes" label="SIZE" rules={[{ required: true, message: 'กรุณาเลือก SIZE' }]}>
                <Select id="rate-driver-wage-size" mode="multiple" allowClear showSearch optionFilterProp="label"
                  options={sizeOptions} placeholder="เลือก SIZE (เลือกได้หลายรายการ)" />
              </Form.Item>
              {/* ทอยตู้ไม่ผูกกับโรงงาน — required เฉพาะเมื่อมีลักษณะงานอื่นที่ไม่ใช่ทอยตู้ */}
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.jobTypes !== cur.jobTypes}>
                {() => {
                  const jobTypes: string[] = form.getFieldValue('jobTypes') ?? []
                  const onlyTowing = jobTypes.length > 0 && jobTypes.every(isTowingJobType)
                  return (
                    <Form.Item
                      name="factoryLocationIds"
                      label="โรงงาน"
                      rules={onlyTowing ? [] : [{ required: true, message: 'กรุณาเลือกโรงงาน' }]}
                      extra={onlyTowing ? 'ทอยตู้ไม่ต้องระบุโรงงาน' : undefined}
                    >
                      <Select id="rate-driver-wage-factory" mode="multiple" allowClear showSearch options={factoryOptions}
                        disabled={onlyTowing}
                        filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                        placeholder={onlyTowing ? 'ไม่ต้องเลือกโรงงาน' : 'เลือกโรงงาน (เลือกได้หลายรายการ)'}
                        popupMatchSelectWidth={false} />
                    </Form.Item>
                  )
                }}
              </Form.Item>
              <Form.Item noStyle shouldUpdate>
                {() => {
                  const count = comboCount(form.getFieldsValue())
                  return count > 1
                    ? <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>จะเพิ่มทั้งหมด {count} รายการ</Typography.Text>
                    : null
                }}
              </Form.Item>
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
