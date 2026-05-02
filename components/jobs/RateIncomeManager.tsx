'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Button, Modal, Form, Select, InputNumber, App, Space, Popconfirm, Row, Col } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined, CopyOutlined } from '@ant-design/icons'
import ImportCSVModal from './ImportCSVModal'
import RateIncomeFuelSurchargeManager from './RateIncomeFuelSurchargeManager'
import type { Customer, Location } from '@/types/job'
import { JOB_TYPES, SIZE_OPTIONS, getJobTypeLabel } from '@/types/job'
import { SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

interface RateIncome {
  id: string
  jobType: string
  size: string
  factoryLocationId: string
  customerId: string
  income: number
  createdAt: string
  factoryLocation: { id: string; name: string }
  customer: { id: string; name: string }
}

export default function RateIncomeManager() {
  const { message } = App.useApp()
  const [rates, setRates] = useState<RateIncome[]>([])
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<RateIncome | null>(null)
  const [copyingRate, setCopyingRate] = useState(false)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [surchargeTarget, setSurchargeTarget] = useState<RateIncome | null>(null)

  // Filters
  const [filterJobType, setFilterJobType] = useState<string | undefined>()
  const [filterSize, setFilterSize] = useState<string | undefined>()
  const [filterFactory, setFilterFactory] = useState<string | undefined>()
  const [filterCustomer, setFilterCustomer] = useState<string | undefined>()

  const fetchRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rates/income')
      if (res.ok) setRates(await res.json())
    } catch { message.error('เกิดข้อผิดพลาดในการดึงข้อมูล') }
    finally { setLoading(false) }
  }, [message])

  const fetchRefData = useCallback(async () => {
    const [locRes, custRes] = await Promise.all([fetch('/api/locations'), fetch('/api/customers')])
    if (locRes.ok) setLocations(await locRes.json())
    if (custRes.ok) setCustomers(await custRes.json())
  }, [])

  useEffect(() => { fetchRates(); fetchRefData() }, [fetchRates, fetchRefData])

  const factoryLocations = useMemo(() => locations.filter(l => l.type === 'factory'), [locations])

  const filteredRates = useMemo(() => rates.filter(r => {
    if (filterJobType && r.jobType !== filterJobType) return false
    if (filterSize && r.size !== filterSize) return false
    if (filterFactory && r.factoryLocationId !== filterFactory) return false
    if (filterCustomer && r.customerId !== filterCustomer) return false
    return true
  }), [rates, filterJobType, filterSize, filterFactory, filterCustomer])

  const handleOpenModal = (rate?: RateIncome) => {
    if (rate) {
      setEditingRate(rate)
      setCopyingRate(false)
      form.setFieldsValue({ income: Number(rate.income) })
    } else {
      setEditingRate(null)
      setCopyingRate(false)
      form.resetFields()
    }
    setModalOpen(true)
  }

  const handleCopy = (rate: RateIncome) => {
    setEditingRate(null)
    setCopyingRate(true)
    form.resetFields()
    form.setFieldsValue({
      jobType: rate.jobType,
      factoryLocationId: rate.factoryLocationId,
      customerId: rate.customerId,
      income: Number(rate.income),
    })
    setModalOpen(true)
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitLoading(true)
    try {
      const url = editingRate ? `/api/rates/income/${editingRate.id}` : '/api/rates/income'
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
    const res = await fetch(`/api/rates/income/${id}`, { method: 'DELETE' })
    if (res.ok) { message.success('ลบสำเร็จ'); fetchRates() }
    else message.error((await res.json()).error || 'เกิดข้อผิดพลาด')
  }

  const handleExport = () => {
    const headers = ['jobType', 'size', 'factoryLocationName', 'customerName', 'income']
    const labels = ['ลักษณะงาน', 'SIZE', 'โรงงาน', 'ลูกค้า', 'รายได้']
    const rows = filteredRates.map(r => [r.jobType, r.size, r.factoryLocation.name, r.customer.name, Number(r.income)])
    const csv = [headers.join(','), labels.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'rate_income.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const factoryOptions = factoryLocations.map(l => ({ value: l.id, label: l.name }))
  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))

  const columns = [
    { title: 'ลูกค้า', key: 'customer', render: (_: unknown, r: RateIncome) => r.customer.name },
    { title: 'โรงงาน', key: 'factory', render: (_: unknown, r: RateIncome) => r.factoryLocation.name },
    { title: 'ลักษณะงาน', dataIndex: 'jobType', key: 'jobType', width: 110, render: (v: string) => getJobTypeLabel(v) },
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'รายได้', dataIndex: 'income', key: 'income', width: 110, render: (v: number) => Number(v).toLocaleString() },
    { title: 'วันที่สร้าง', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    {
      title: 'จัดการ', key: 'actions', width: 120,
      render: (_: unknown, r: RateIncome) => (
        <Space>
          <Button type="link" size="small" icon={<SettingOutlined />} title="ช่วงราคาน้ำมัน" onClick={() => setSurchargeTarget(r)} data-testid={`rate-income-surcharge-btn-${r.id}`} />
          <Button type="link" size="small" icon={<CopyOutlined />} title="คัดลอก" onClick={() => handleCopy(r)} data-testid={`rate-income-copy-btn-${r.id}`} />
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(r)} data-testid={`rate-income-edit-btn-${r.id}`} />
          <Popconfirm title="ยืนยันการลบ" onConfirm={() => handleDelete(r.id)} okText="ลบ" cancelText="ยกเลิก">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} data-testid={`rate-income-delete-btn-${r.id}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>อัตรารายได้</h2>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport}>Export CSV</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()} data-testid="rate-income-add-btn">เพิ่ม</Button>
        </Space>
      </div>

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
          <Select allowClear showSearch placeholder="โรงงาน" style={{ width: 180 }}
            options={factoryOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={filterFactory} onChange={setFilterFactory} popupMatchSelectWidth={false} />
        </Col>
        <Col>
          <Select allowClear showSearch placeholder="ลูกค้า" style={{ width: 180 }}
            options={customerOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={filterCustomer} onChange={setFilterCustomer} popupMatchSelectWidth={false} />
        </Col>
      </Row>

      <Table columns={columns} dataSource={filteredRates} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <Modal
        title={editingRate ? 'แก้ไขอัตรารายได้' : copyingRate ? 'คัดลอกอัตรารายได้' : 'เพิ่มอัตรารายได้'}
        open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} confirmLoading={submitLoading}
        okText={editingRate ? 'บันทึก' : 'เพิ่ม'} cancelText="ยกเลิก"
        afterClose={() => setCopyingRate(false)}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editingRate && (
            <>
              <Form.Item name="jobType" label="ลักษณะงาน" rules={[{ required: true, message: 'กรุณาเลือกลักษณะงาน' }]}>
                <Select id="rate-income-job-type" showSearch options={JOB_TYPES.map(t => ({ value: t.value, label: t.label }))} placeholder="เลือกลักษณะงาน" />
              </Form.Item>
              <Form.Item name="size" label="SIZE" rules={[{ required: true, message: 'กรุณาเลือก SIZE' }]}>
                <Select id="rate-income-size" showSearch options={SIZE_OPTIONS.map(s => ({ value: s, label: s }))} placeholder="เลือก SIZE" />
              </Form.Item>
              <Form.Item name="factoryLocationId" label="โรงงาน" rules={[{ required: true, message: 'กรุณาเลือกโรงงาน' }]}>
                <Select id="rate-income-factory" showSearch options={factoryOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} placeholder="เลือกโรงงาน" popupMatchSelectWidth={false} />
              </Form.Item>
              <Form.Item name="customerId" label="ลูกค้า" rules={[{ required: true, message: 'กรุณาเลือกลูกค้า' }]}>
                <Select id="rate-income-customer" showSearch options={customerOptions} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} placeholder="เลือกลูกค้า" popupMatchSelectWidth={false} />
              </Form.Item>
            </>
          )}
          <Form.Item name="income" label="รายได้" rules={[{ required: true, message: 'กรุณากรอกรายได้' }]}>
            <InputNumber style={{ width: '100%' }} min={0} placeholder="0" data-testid="rate-income-amount-input" />
          </Form.Item>
        </Form>
      </Modal>

      <RateIncomeFuelSurchargeManager
        open={!!surchargeTarget}
        onClose={() => setSurchargeTarget(null)}
        rateIncomeId={surchargeTarget?.id ?? ''}
        rateIncomeLabel={surchargeTarget ? `${surchargeTarget.jobType} / ${surchargeTarget.size} / ${surchargeTarget.factoryLocation.name} / ${surchargeTarget.customer.name}` : ''}
      />

      <ImportCSVModal
        open={importOpen}
        title="Import อัตรารายได้"
        apiEndpoint="/api/rates/income/import"
        headers={['jobType', 'size', 'factoryLocationName', 'customerName', 'income', 'fuelPriceMin', 'fuelPriceMax', 'surcharge']}
        headerLabels={{ jobType: 'ลักษณะงาน', size: 'SIZE', factoryLocationName: 'โรงงาน', customerName: 'ลูกค้า', income: 'รายได้', fuelPriceMin: 'ราคาน้ำมัน ≥', fuelPriceMax: 'ราคาน้ำมัน <', surcharge: 'ค่าปรับ income' }}
        optionalHeaders={['fuelPriceMin', 'fuelPriceMax', 'surcharge']}
        exampleRows={[
          ['ขาเข้า', '20DC', 'โรงงาน ABC', 'บริษัท XYZ', '10000', '', '', ''],
          ['ขาเข้า', '20DC', 'โรงงาน ABC', 'บริษัท XYZ', '10000', '0', '42.50', '0'],
          ['ขาเข้า', '20DC', 'โรงงาน ABC', 'บริษัท XYZ', '10000', '42.50', '47.50', '1000'],
          ['ขาเข้า', '20DC', 'โรงงาน ABC', 'บริษัท XYZ', '10000', '47.50', '999', '2000'],
        ]}
        templateFileName="rate_income_template.csv"
        onClose={() => setImportOpen(false)}
        onSuccess={fetchRates}
      />
    </>
  )
}
