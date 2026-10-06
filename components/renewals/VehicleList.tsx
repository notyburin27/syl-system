'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { App, Button, Col, Input, Row, Select, Table, Tag, type TableColumnsType } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_COLORS,
  VEHICLE_STATUS_LABELS,
  type VehicleStatusKey,
} from '@/lib/renewals/constants'
import { normalizePlate } from '@/lib/renewals/plate'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { VehicleDto, VehicleListItemDto } from '@/types/renewals'
import { getJson } from './api'
import VehicleFormModal from './VehicleFormModal'

const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'th'))

export default function VehicleList() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<VehicleListItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [owner, setOwner] = useState<string>()
  const [status, setStatus] = useState<VehicleStatusKey>()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<VehicleDto | 'new' | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await getJson<VehicleListItemDto[]>('/api/renewals/vehicles')
    if (res.ok) setRows(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [message])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const ownerOptions = useMemo(() => uniqueSorted(rows.map((r) => r.ownerName)), [rows])
  const typeOptions = useMemo(() => uniqueSorted(rows.map((r) => r.vehicleType)), [rows])
  const filtered = useMemo(() => {
    const query = normalizePlate(q).toLowerCase()
    return rows.filter(
      (r) =>
        (!owner || r.ownerName === owner) &&
        (!status || r.status === status) &&
        (!query || r.plate.toLowerCase().includes(query) || (r.fleetNumber ?? '').toLowerCase().includes(query)),
    )
  }, [rows, owner, status, q])

  const columns: TableColumnsType<VehicleListItemDto> = [
    { title: 'เบอร์รถ', key: 'fleetNumber', width: 100, render: (_, r) => r.fleetNumber ?? '-' },
    {
      title: 'ทะเบียน',
      key: 'plate',
      width: 140,
      render: (_, r) => (
        <Link href={`/renewals/vehicles/${r.id}`} data-testid={`vehicle-link-${r.id}`}>
          {r.plate}
        </Link>
      ),
    },
    { title: 'บริษัท', dataIndex: 'ownerName', key: 'ownerName', width: 160 },
    { title: 'ลักษณะ', dataIndex: 'vehicleType', key: 'vehicleType', width: 120 },
    { title: 'ยี่ห้อ', key: 'brand', width: 100, render: (_, r) => r.brand ?? '-' },
    {
      title: 'สถานะ',
      key: 'status',
      width: 90,
      render: (_, r) => <Tag color={VEHICLE_STATUS_COLORS[r.status]}>{VEHICLE_STATUS_LABELS[r.status]}</Tag>,
    },
    ...COVERAGE_TYPES.map((t) => ({
      title: COVERAGE_TYPE_LABELS[t],
      key: t,
      width: 110,
      render: (_: unknown, r: VehicleListItemDto) => toThaiShortDate(r.latestEndDates[t]) || '-',
    })),
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, r) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} data-testid={`vehicle-edit-btn-${r.id}`} />
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>ทะเบียนรถ</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} data-testid="vehicle-add-btn">
          เพิ่มรถ
        </Button>
      </div>
      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select
            id="vehicle-owner-filter"
            allowClear
            placeholder="บริษัท"
            style={{ width: 200 }}
            options={ownerOptions.map((o) => ({ value: o, label: o }))}
            value={owner}
            onChange={(v) => setOwner(v as string | undefined)}
          />
        </Col>
        <Col>
          <Select
            id="vehicle-status-filter"
            allowClear
            placeholder="สถานะ"
            style={{ width: 140 }}
            options={VEHICLE_STATUSES.map((s) => ({ value: s, label: VEHICLE_STATUS_LABELS[s] }))}
            value={status}
            onChange={(v) => setStatus(v as VehicleStatusKey | undefined)}
          />
        </Col>
        <Col>
          <Input allowClear placeholder="ค้นหาทะเบียน/เบอร์รถ" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} />
        </Col>
      </Row>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        columns={columns}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />
      <VehicleFormModal
        vehicle={editing}
        ownerOptions={ownerOptions}
        typeOptions={typeOptions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          fetchRows()
        }}
      />
    </>
  )
}
