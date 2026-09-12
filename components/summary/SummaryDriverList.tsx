'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, Row, Col, DatePicker, Select, Input, Spin, Empty, Button, Divider, Tag } from 'antd'
import { TruckOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons'
import { useRouter, useSearchParams } from 'next/navigation'
import type { DriverMonthlySummary } from '@/types/job'
import { UNGROUPED } from '@/types/job'
import dayjs from 'dayjs'
import ExportRangeModal from './ExportRangeModal'

const OTHER_GROUP_LABEL = 'กลุ่มอื่นๆ'

function fmt(value: number | null) {
  if (value == null) return '-'
  return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function SummaryCard({
  s,
  onClick,
}: {
  s: DriverMonthlySummary
  onClick: (driverId: string) => void
}) {
  return (
    <Card
      hoverable
      data-testid="summary-card"
      onClick={() => onClick(s.driverId)}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <TruckOutlined style={{ fontSize: 20, color: '#1890ff' }} />
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          {s.driverName}{s.vehicleNumber ? ` (${s.vehicleNumber})` : ''}
        </span>
        <Tag color="blue">{s.groupName ?? OTHER_GROUP_LABEL}</Tag>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <Row gutter={[8, 4]}>
        <Col span={12}><span style={{ color: '#666' }}>งาน</span></Col>
        <Col span={12} style={{ textAlign: 'right', fontWeight: 600 }}>{s.jobTrips} เที่ยว</Col>
        <Col span={12}><span style={{ color: '#666' }}>ทอย</span></Col>
        <Col span={12} style={{ textAlign: 'right', fontWeight: 600 }}>{s.towingTrips} เที่ยว</Col>
        <Col span={12}><span style={{ color: '#666' }}>รายได้</span></Col>
        <Col span={12} style={{ textAlign: 'right', fontWeight: 600, color: '#389e0d' }}>
          {fmt(s.income)} ฿
        </Col>
        <Col span={12}><span style={{ color: '#666' }}>ค่าเที่ยว</span></Col>
        <Col span={12} style={{ textAlign: 'right', color: '#d46b08' }}>{fmt(s.driverWage)} ฿</Col>
      </Row>
    </Card>
  )
}

export default function SummaryDriverList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMonth = searchParams.get('month')

  const [summaries, setSummaries] = useState<DriverMonthlySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(
    initialMonth && dayjs(initialMonth + '-01').isValid() ? dayjs(initialMonth + '-01') : dayjs()
  )
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const [exportOpen, setExportOpen] = useState(false)

  const fetchSummaries = useCallback(async (m: dayjs.Dayjs) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/summary?month=${m.format('YYYY-MM')}`)
      if (res.ok) setSummaries(await res.json())
    } catch {
      console.error('Error fetching summary')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummaries(month)
  }, [month, fetchSummaries])

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    summaries.forEach((s) => set.add(s.groupName ?? OTHER_GROUP_LABEL))
    return Array.from(set).sort().map((g) => ({ label: g, value: g }))
  }, [summaries])

  // กรองด้วยกลุ่ม + คำค้น (ชื่อ หรือ เบอร์รถ) แล้วจัดกลุ่มเป็นหัวข้อ
  const grouped = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    const filtered = summaries.filter((s) => {
      const groupLabel = s.groupName ?? OTHER_GROUP_LABEL
      if (selectedGroups.length > 0 && !selectedGroups.includes(groupLabel)) return false
      if (!q) return true
      return (
        s.driverName.toLowerCase().includes(q) ||
        (s.vehicleNumber ?? '').toLowerCase().includes(q)
      )
    })

    const map = new Map<string, DriverMonthlySummary[]>()
    for (const s of filtered) {
      const key = s.groupName ?? OTHER_GROUP_LABEL
      map.set(key, [...(map.get(key) ?? []), s])
    }

    // กลุ่มอื่นๆ อยู่ท้ายสุดเสมอ
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === OTHER_GROUP_LABEL) return 1
      if (b === OTHER_GROUP_LABEL) return -1
      return a.localeCompare(b, 'th')
    })
  }, [summaries, selectedGroups, searchText])

  const handleCardClick = (driverId: string) => {
    router.push(`/summary/${driverId}?month=${month.format('YYYY-MM')}`)
  }

  const totalShown = grouped.reduce((sum, [, list]) => sum + list.length, 0)

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>สรุปงาน</h1>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button
            data-testid="summary-export-btn"
            icon={<DownloadOutlined />}
            onClick={() => setExportOpen(true)}
          >
            ดาวน์โหลด Excel
          </Button>
          <Input
            data-testid="summary-search-input"
            placeholder="ค้นชื่อคนขับ หรือ เบอร์รถ"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            id="summary-group-filter"
            mode="multiple"
            placeholder="ทุกกลุ่ม"
            value={selectedGroups}
            onChange={setSelectedGroups}
            options={groupOptions}
            allowClear
            style={{ minWidth: 200 }}
            maxTagCount="responsive"
          />
          <DatePicker
            id="summary-month-picker"
            picker="month"
            value={month}
            onChange={(val) => val && setMonth(val)}
            format="MMMM YYYY"
            allowClear={false}
            style={{ width: 180 }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" data-testid="summary-loading" />
        </div>
      ) : totalShown === 0 ? (
        <Empty description={summaries.length === 0 ? 'ไม่มีข้อมูลคนขับ' : 'ไม่พบคนขับตามเงื่อนไข'} />
      ) : (
        grouped.map(([groupName, list]) => (
          <div key={groupName} style={{ marginBottom: 24 }}>
            <h2
              data-testid="summary-group-heading"
              style={{ fontSize: 18, margin: '0 0 12px', borderLeft: '4px solid #1890ff', paddingLeft: 10 }}
            >
              {groupName} <span style={{ fontSize: 14, color: '#888', fontWeight: 400 }}>({list.length} คน)</span>
            </h2>
            <Row gutter={[16, 16]}>
              {list.map((s) => (
                <Col xs={24} sm={12} lg={8} key={s.driverId}>
                  <SummaryCard s={s} onClick={handleCardClick} />
                </Col>
              ))}
            </Row>
          </div>
        ))
      )}

      <ExportRangeModal
        open={exportOpen}
        defaultMonth={month}
        onClose={() => setExportOpen(false)}
        buildUrl={(from, to) => {
          const params = new URLSearchParams({ from, to })
          if (selectedGroups.length > 0) {
            // กลุ่มอื่นๆ ส่งเป็น sentinel (UNGROUPED) ให้ API เข้าใจว่าคือคนที่ไม่มีกลุ่ม
            // (empty string แยกจาก "ไม่ส่ง param" ไม่ออก จึงต้องใช้ sentinel แทน)
            params.set(
              'groups',
              selectedGroups.map((g) => (g === OTHER_GROUP_LABEL ? UNGROUPED : g)).join(',')
            )
          }
          return `/api/summary/export?${params.toString()}`
        }}
      />
    </div>
  )
}
