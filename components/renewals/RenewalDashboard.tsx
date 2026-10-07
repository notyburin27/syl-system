'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  type TableColumnsType,
} from 'antd'
import { CheckOutlined, CloseOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  RENEWAL_STATUS_COLORS,
  RENEWAL_STATUS_LABELS,
  type CoverageTypeKey,
} from '@/lib/renewals/constants'
import { filterDashboardItems, summarizeDashboard, type DashboardFilters } from '@/lib/renewals/dashboardFilter'
import { DUE_BUCKET_COLORS, DUE_BUCKET_LABELS, endOfNextMonth } from '@/lib/renewals/dueWindow'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { DashboardItemDto, DashboardResponse } from '@/types/renewals'
import { getJson, sendJson } from './api'
import BulkRenewModal from './BulkRenewModal'
import NoteModal from './NoteModal'
import NotRenewModal from './NotRenewModal'
import RenewModal from './RenewModal'
import { useRenewalLookups } from './useRenewalLookups'

const money = (v: number | null) =>
  v === null ? '-' : v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CARDS = [
  { key: 'OVERDUE', title: DUE_BUCKET_LABELS.OVERDUE, color: '#cf1322' },
  { key: 'THIS_MONTH', title: DUE_BUCKET_LABELS.THIS_MONTH, color: '#d46b08' },
  { key: 'NEXT_MONTH', title: DUE_BUCKET_LABELS.NEXT_MONTH, color: '#1677ff' },
  { key: 'IN_PROGRESS', title: 'กำลังดำเนินการ', color: '#531dab' },
] as const

export default function RenewalDashboard() {
  const { message, modal } = App.useApp()
  const { insurers, vehicles, agents, reloadAgents } = useRenewalLookups()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<DashboardFilters>({ type: 'ALL' })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [renewing, setRenewing] = useState<DashboardItemDto | null>(null)
  const [notRenewIds, setNotRenewIds] = useState<string[] | null>(null)
  const [noteItem, setNoteItem] = useState<DashboardItemDto | null>(null)
  const [bulkRenewOpen, setBulkRenewOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await getJson<DashboardResponse>('/api/renewals/dashboard')
    if (res.ok) setData(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [message])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const items = useMemo(() => data?.items ?? [], [data])
  const tabSummary = useMemo(
    () => summarizeDashboard(filterDashboardItems(items, filters, { ignoreType: true })),
    [items, filters],
  )
  const visible = useMemo(() => filterDashboardItems(items, filters), [items, filters])
  const summary = useMemo(() => summarizeDashboard(visible), [visible])
  const ownerOptions = useMemo(
    () =>
      [...new Set(items.map((i) => i.vehicle.ownerName))]
        .sort((a, b) => a.localeCompare(b, 'th'))
        .map((o) => ({ value: o, label: o })),
    [items],
  )
  const selectedItems = useMemo(() => items.filter((i) => selectedIds.includes(i.id)), [items, selectedIds])
  const canBulkRenew = selectedItems.length > 0 && new Set(selectedItems.map((i) => i.type)).size === 1

  const afterChange = () => {
    setSelectedIds([])
    setRenewing(null)
    setNotRenewIds(null)
    setNoteItem(null)
    setBulkRenewOpen(false)
    fetchData()
  }

  const updateStatus = async (ids: string[], status: 'PENDING' | 'IN_PROGRESS') => {
    const res = await sendJson('/api/renewals/coverages/bulk-status', { ids, status })
    if (res.ok) {
      message.success('บันทึกสำเร็จ')
      afterChange()
    } else {
      message.error(res.error)
    }
  }

  const confirmBulkInProgress = () => {
    modal.confirm({
      title: 'เปลี่ยนเป็น "กำลังดำเนินการ"',
      content: `${selectedIds.length} รายการ`,
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: () => updateStatus(selectedIds, 'IN_PROGRESS'),
    })
  }

  const columns: TableColumnsType<DashboardItemDto> = [
    { title: 'เบอร์รถ', key: 'fleet', width: 90, render: (_, r) => r.vehicle.fleetNumber ?? '-' },
    {
      title: 'ทะเบียน',
      key: 'plate',
      width: 150,
      render: (_, r) => (
        <Space size={4}>
          <Link href={`/renewals/vehicles/${r.vehicleId}`}>{r.vehicle.plate}</Link>
          {r.vehicle.status === 'SUSPENDED' && <Tag color="gold">งดใช้</Tag>}
        </Space>
      ),
    },
    { title: 'ลักษณะ', key: 'vehicleType', width: 100, render: (_, r) => r.vehicle.vehicleType },
    { title: 'บริษัท', key: 'owner', width: 150, render: (_, r) => r.vehicle.ownerName },
    { title: 'ประเภท', key: 'type', width: 110, render: (_, r) => COVERAGE_TYPE_LABELS[r.type] },
    { title: 'บ.ประกัน', key: 'insurer', width: 150, render: (_, r) => r.insurerName ?? '-' },
    { title: 'เลขกรมธรรม์', key: 'policyNumber', width: 160, render: (_, r) => r.policyNumber ?? '-' },
    {
      title: 'วันหมด',
      key: 'endDate',
      width: 100,
      render: (_, r) => (
        <Tag color={DUE_BUCKET_COLORS[r.bucket]} data-testid={`due-tag-${r.id}`}>
          {toThaiShortDate(r.endDate)}
        </Tag>
      ),
    },
    { title: 'เบี้ย/ภาษี', key: 'amount', width: 110, align: 'right', render: (_, r) => money(r.amount) },
    { title: 'ค่าบริการ', key: 'serviceFee', width: 100, align: 'right', render: (_, r) => money(r.serviceFee) },
    {
      title: 'สถานะ',
      key: 'status',
      width: 130,
      render: (_, r) => (
        <Tag color={RENEWAL_STATUS_COLORS[r.renewalStatus]} data-testid={`status-tag-${r.id}`}>
          {RENEWAL_STATUS_LABELS[r.renewalStatus]}
        </Tag>
      ),
    },
    {
      title: 'หมายเหตุ',
      key: 'note',
      width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setNoteItem(r)} data-testid={`note-btn-${r.id}`} />
          <span>{r.renewalNote}</span>
        </Space>
      ),
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setRenewing(r)} data-testid={`renew-btn-${r.id}`}>
            ต่อแล้ว
          </Button>
          <Button size="small" danger icon={<CloseOutlined />} onClick={() => setNotRenewIds([r.id])} data-testid={`not-renew-btn-${r.id}`}>
            ไม่ต่อ
          </Button>
          <Button
            size="small"
            onClick={() => updateStatus([r.id], r.renewalStatus === 'PENDING' ? 'IN_PROGRESS' : 'PENDING')}
            data-testid={`status-toggle-btn-${r.id}`}
          >
            {r.renewalStatus === 'PENDING' ? 'เริ่มดำเนินการ' : 'กลับเป็นรอต่อ'}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>ต่ออายุรถ</h2>
        <Space>
          {data && <span style={{ color: '#888' }}>แสดงงวดที่หมดภายใน {toThaiShortDate(endOfNextMonth(data.today))}</span>}
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            รีเฟรช
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {CARDS.map((c) => (
          <Col key={c.key} xs={12} md={6}>
            <Card size="small" data-testid={`count-${c.key}`}>
              <Statistic
                title={c.title}
                value={c.key === 'IN_PROGRESS' ? summary.inProgress : summary.buckets[c.key]}
                valueStyle={{ color: c.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Tabs
        activeKey={filters.type}
        onChange={(key) => setFilters({ ...filters, type: key as CoverageTypeKey | 'ALL' })}
        items={[
          { key: 'ALL', label: `ทั้งหมด (${tabSummary.byType.ALL})` },
          ...COVERAGE_TYPES.map((t) => ({ key: t, label: `${COVERAGE_TYPE_LABELS[t]} (${tabSummary.byType[t]})` })),
        ]}
      />

      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select
            id="dashboard-owner-filter"
            allowClear
            placeholder="บริษัท"
            style={{ width: 200 }}
            options={ownerOptions}
            value={filters.owner}
            onChange={(owner) => setFilters({ ...filters, owner })}
          />
        </Col>
        <Col>
          <Select
            id="dashboard-status-filter"
            allowClear
            placeholder="สถานะ"
            style={{ width: 160 }}
            options={[
              { value: 'PENDING', label: RENEWAL_STATUS_LABELS.PENDING },
              { value: 'IN_PROGRESS', label: RENEWAL_STATUS_LABELS.IN_PROGRESS },
            ]}
            value={filters.status}
            onChange={(status) => setFilters({ ...filters, status: status as DashboardFilters['status'] })}
          />
        </Col>
        <Col>
          <Input
            allowClear
            placeholder="ค้นหาทะเบียน/เบอร์รถ"
            style={{ width: 220 }}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </Col>
      </Row>

      {selectedIds.length > 0 && (
        <Space style={{ marginBottom: 12 }}>
          <span>เลือก {selectedIds.length} รายการ</span>
          <Button onClick={confirmBulkInProgress} data-testid="bulk-in-progress-btn">
            กำลังดำเนินการ
          </Button>
          <Tooltip title={canBulkRenew ? '' : 'ต่อแล้วหลายรายการได้เฉพาะประเภทเดียวกัน'}>
            <Button type="primary" disabled={!canBulkRenew} onClick={() => setBulkRenewOpen(true)} data-testid="bulk-renew-btn">
              ต่อแล้ว
            </Button>
          </Tooltip>
          <Button danger onClick={() => setNotRenewIds(selectedIds)} data-testid="bulk-not-renew-btn">
            ไม่ต่อ
          </Button>
          <Button type="link" onClick={() => setSelectedIds([])}>
            ล้างที่เลือก
          </Button>
        </Space>
      )}

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={visible}
        columns={columns}
        scroll={{ x: 1700 }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as string[]),
          preserveSelectedRowKeys: true,
        }}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        footer={() => (
          <span data-testid="dashboard-totals">
            รวมเบี้ย/ภาษี {money(summary.totals.amount)} บาท · ค่าบริการ {money(summary.totals.serviceFee)} บาท ({visible.length} รายการ)
          </span>
        )}
      />

      <RenewModal
        item={renewing}
        insurers={insurers}
        agents={agents}
        vehicles={vehicles}
        onClose={() => setRenewing(null)}
        onDone={() => {
          afterChange()
          reloadAgents()
        }}
      />
      <NotRenewModal ids={notRenewIds} onClose={() => setNotRenewIds(null)} onDone={afterChange} />
      <NoteModal item={noteItem} onClose={() => setNoteItem(null)} onDone={afterChange} />
      <BulkRenewModal
        open={bulkRenewOpen}
        items={selectedItems}
        insurers={insurers}
        onClose={() => setBulkRenewOpen(false)}
        onDone={afterChange}
      />
    </>
  )
}
