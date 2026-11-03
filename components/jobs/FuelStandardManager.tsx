'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Button, Select, App, Space, Row, Col, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined, CheckOutlined } from '@ant-design/icons'
import ImportCSVModal from './ImportCSVModal'
import FuelStandardFormModal, { fuelStandardLabel, type FuelStandardRecord } from './FuelStandardFormModal'
import { SIZE_OPTIONS } from '@/types/job'
import type { FuelStandardKind } from '@/lib/utils/fuelSegments'
import { FUEL_KIND_LABELS } from '@/lib/utils/fuelStandardImport'

const CSV_HEADERS = ['kind', 'size', 'locationName', 'pickupLaemChabang', 'returnLaemChabang', 'liters']

const KIND_OPTIONS = (Object.keys(FUEL_KIND_LABELS) as FuelStandardKind[]).map((k) => ({
  value: k,
  label: FUEL_KIND_LABELS[k],
}))

export default function FuelStandardManager() {
  const { message, modal } = App.useApp()
  const [rows, setRows] = useState<FuelStandardRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FuelStandardRecord | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [filterKind, setFilterKind] = useState<FuelStandardKind | undefined>()
  const [filterSize, setFilterSize] = useState<string | undefined>()
  const [filterLocation, setFilterLocation] = useState<string | undefined>()

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rates/fuel-standard')
      if (res.ok) setRows(await res.json())
      else message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => { fetchRows() }, [fetchRows])

  // filter สถานที่ — จากสถานที่ที่ถูกใช้อยู่ในตาราง
  const locationOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const r of rows) byId.set(r.location.id, r.location.name)
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'th'))
  }, [rows])

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (filterKind && r.kind !== filterKind) return false
        if (filterSize && r.size !== filterSize) return false
        if (filterLocation && r.locationId !== filterLocation) return false
        return true
      }),
    [rows, filterKind, filterSize, filterLocation],
  )

  const openForm = (record: FuelStandardRecord | null) => {
    setEditing(record)
    setFormOpen(true)
  }

  const handleDelete = (record: FuelStandardRecord) => {
    modal.confirm({
      title: 'ยืนยันการลบ',
      content: fuelStandardLabel(record, record.location.name),
      okText: 'ลบ',
      okButtonProps: { danger: true },
      cancelText: 'ยกเลิก',
      onOk: async () => {
        const res = await fetch(`/api/rates/fuel-standard/${record.id}`, { method: 'DELETE' })
        if (res.ok) {
          message.success('ลบสำเร็จ')
          fetchRows()
        } else {
          message.error((await res.json().catch(() => ({}))).error || 'เกิดข้อผิดพลาด')
        }
      },
    })
  }

  // ไม่มีแถว label ภาษาไทย — แก้ไฟล์แล้ว import กลับได้ทันที
  const handleExport = () => {
    const lines = filteredRows.map((r) =>
      [
        FUEL_KIND_LABELS[r.kind],
        r.size,
        r.location.name,
        r.pickupLaemChabang ? 'Y' : '',
        r.returnLaemChabang ? 'Y' : '',
        Number(r.liters),
      ].join(','),
    )
    const csv = [CSV_HEADERS.join(','), ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'fuel_standard.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const columns = [
    { title: 'ประเภท', dataIndex: 'kind', key: 'kind', width: 80, render: (v: FuelStandardKind) => FUEL_KIND_LABELS[v] },
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 90 },
    { title: 'สถานที่', key: 'location', render: (_: unknown, r: FuelStandardRecord) => r.location.name },
    {
      title: 'รับแหลมฉบัง', dataIndex: 'pickupLaemChabang', key: 'pickupLaem', width: 110, align: 'center' as const,
      render: (v: boolean) => (v ? <CheckOutlined style={{ color: '#52c41a' }} /> : null),
    },
    {
      title: 'คืนแหลมฉบัง', dataIndex: 'returnLaemChabang', key: 'returnLaem', width: 110, align: 'center' as const,
      render: (v: boolean) => (v ? <CheckOutlined style={{ color: '#52c41a' }} /> : null),
    },
    {
      title: 'ลิตร', dataIndex: 'liters', key: 'liters', width: 110, align: 'right' as const,
      render: (v: number | string) => Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    {
      title: 'จัดการ', key: 'actions', width: 90,
      render: (_: unknown, r: FuelStandardRecord) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} data-testid={`fuel-standard-edit-btn-${r.id}`} />
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} data-testid={`fuel-standard-delete-btn-${r.id}`} />
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>น้ำมันมาตรฐาน</h2>
          <Typography.Text type="secondary">
            งานวิ่งใช้ค่าตามโรงงาน · งานทอยใช้ค่าตามสถานที่รับตู้ · รับ/คืนแหลมฉบัง ดูจากชื่อสถานที่ที่มีคำว่า &quot;แหลม&quot;
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport}>Export CSV</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)} data-testid="fuel-standard-add-btn">เพิ่ม</Button>
        </Space>
      </div>

      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select allowClear placeholder="ประเภท" style={{ width: 110 }}
            options={KIND_OPTIONS}
            value={filterKind} onChange={setFilterKind} />
        </Col>
        <Col>
          <Select allowClear placeholder="SIZE" style={{ width: 110 }}
            options={SIZE_OPTIONS.map((s) => ({ value: s, label: s }))}
            value={filterSize} onChange={setFilterSize} />
        </Col>
        <Col>
          <Select allowClear showSearch placeholder="สถานที่" style={{ width: 220 }} popupMatchSelectWidth={false}
            options={locationOptions}
            filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={filterLocation} onChange={setFilterLocation} />
        </Col>
      </Row>

      <Table columns={columns} dataSource={filteredRows} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <FuelStandardFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={fetchRows}
      />

      <ImportCSVModal
        open={importOpen}
        title="Import น้ำมันมาตรฐาน"
        apiEndpoint="/api/rates/fuel-standard/import"
        headers={CSV_HEADERS}
        headerLabels={{
          kind: 'ประเภท (วิ่ง/ทอย)',
          size: 'SIZE',
          locationName: 'สถานที่ (วิ่ง = โรงงาน, ทอย = ที่รับตู้)',
          pickupLaemChabang: 'รับแหลมฉบัง (Y/ว่าง)',
          returnLaemChabang: 'คืนแหลมฉบัง (Y/ว่าง)',
          liters: 'ลิตร',
        }}
        optionalHeaders={['pickupLaemChabang', 'returnLaemChabang']}
        exampleRow={['วิ่ง', '40DC', 'โรงงาน B', 'Y', '', '400']}
        templateFileName="fuel_standard_template.csv"
        onClose={() => setImportOpen(false)}
        onSuccess={fetchRows}
      />
    </>
  )
}
