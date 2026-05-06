'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, Row, Col, DatePicker, Spin, Empty, Input, Tabs, Divider } from 'antd'
import { TruckOutlined, SearchOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import type { DriverJobSummary } from '@/types/job'
import dayjs from 'dayjs'

const OTHER_GROUP_KEY = '__other__'

function fmt(value: number) {
  return value % 1 === 0
    ? value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function JobTypeRow({
  label,
  count,
  amount,
  testIdCount,
}: {
  label: string
  count: number
  amount: number
  testIdCount?: string
}) {
  const inactive = count === 0
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '5px 0',
      opacity: inactive ? 0.3 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, color: '#666', minWidth: 90 }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#222' }} data-testid={testIdCount}>
          {count}
        </span>
      </div>
      <span style={{ fontSize: 14, color: '#444', fontWeight: inactive ? 400 : 500 }}>
        {fmt(amount)} ฿
      </span>
    </div>
  )
}

function DriverCard({ s, onCardClick }: { s: DriverJobSummary; onCardClick: (id: string) => void }) {
  return (
    <Card
      hoverable
      data-testid={`driver-card-${s.driverId}`}
      onClick={() => onCardClick(s.driverId)}
      styles={{ body: { padding: '16px 20px' } }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <TruckOutlined style={{ fontSize: 20, color: '#1890ff' }} />
        <span
          data-testid={`driver-card-name-${s.driverId}`}
          style={{ fontSize: 16, fontWeight: 600 }}
        >
          {s.driverName}{s.vehicleNumber ? ` (${s.vehicleNumber})` : ''}
        </span>
      </div>

      {/* Job type rows */}
      <JobTypeRow
        label="งาน"
        count={s.mainJobCount}
        amount={s.mainTransfer}
        testIdCount={`driver-card-main-count-${s.driverId}`}
      />
      <JobTypeRow
        label="ทอยตู้"
        count={s.towingJobCount}
        amount={s.towingTransfer}
      />
      <JobTypeRow
        label="เบิกล่วงหน้า"
        count={s.advanceJobCount}
        amount={s.advanceAmount}
      />

      <Divider style={{ margin: '8px 0' }} />

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: '#888' }}>รวมโอนทั้งหมด</span>
        <span
          data-testid={`driver-card-total-transfer-${s.driverId}`}
          style={{ fontSize: 14, fontWeight: 700, color: '#389e0d' }}
        >
          {fmt(s.totalTransfer)} ฿
        </span>
      </div>
    </Card>
  )
}

export default function DriverJobList() {
  const router = useRouter()
  const [summaries, setSummaries] = useState<DriverJobSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(dayjs())
  const [searchText, setSearchText] = useState('')
  const [activeGroup, setActiveGroup] = useState<string>(OTHER_GROUP_KEY)

  const fetchSummary = useCallback(async (m: dayjs.Dayjs) => {
    setLoading(true)
    try {
      const monthStr = m.format('YYYY-MM')
      const res = await fetch(`/api/jobs/summary?month=${monthStr}`)
      if (res.ok) {
        const data = await res.json()
        setSummaries(data)
      }
    } catch {
      console.error('Error fetching summary')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary(month)
  }, [month, fetchSummary])

  const groups = useMemo(() => {
    const groupSet = new Set<string>()
    summaries.forEach((s) => {
      if (s.groupName) groupSet.add(s.groupName)
    })
    return Array.from(groupSet).sort()
  }, [summaries])

  useEffect(() => {
    if (groups.length > 0 && activeGroup === OTHER_GROUP_KEY) {
      setActiveGroup(groups[0])
    }
  }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

  const tabItems = useMemo(() => {
    const items = groups.map((g) => ({ key: g, label: g }))
    items.push({ key: OTHER_GROUP_KEY, label: 'กลุ่มอื่นๆ' })
    return items
  }, [groups])

  const filteredSummaries = useMemo(() => {
    const byGroup = summaries.filter((s) =>
      activeGroup === OTHER_GROUP_KEY ? !s.groupName : s.groupName === activeGroup
    )
    if (!searchText.trim()) return byGroup
    return byGroup.filter((s) =>
      s.driverName.toLowerCase().includes(searchText.trim().toLowerCase())
    )
  }, [summaries, activeGroup, searchText])

  const handleCardClick = (driverId: string) => {
    const monthStr = month.format('YYYY-MM')
    router.push(`/jobs/${driverId}?month=${monthStr}`)
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>รายการงานขนส่ง</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <Input
            data-testid="driver-search-input"
            placeholder="ค้นหาชื่อคนขับ"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 200 }}
          />
          <div data-testid="month-picker">
            <DatePicker
              picker="month"
              value={month}
              onChange={(val) => val && setMonth(val)}
              format="MMMM YYYY"
              allowClear={false}
              style={{ width: 200 }}
            />
          </div>
        </div>
      </div>

      <Tabs
        activeKey={activeGroup}
        onChange={setActiveGroup}
        items={tabItems}
        style={{ marginBottom: 8 }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" data-testid="jobs-loading" />
        </div>
      ) : filteredSummaries.length === 0 ? (
        <Empty description={summaries.length === 0 ? 'ไม่มีข้อมูลคนขับ' : 'ไม่พบคนขับในกลุ่มนี้'} />
      ) : (
        <Row gutter={[16, 16]} data-testid="driver-cards-list">
          {filteredSummaries.map((s) => (
            <Col xs={24} sm={12} key={s.driverId}>
              <DriverCard s={s} onCardClick={handleCardClick} />
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
