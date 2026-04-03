'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, Row, Col, DatePicker, Spin, Empty, Statistic, Input } from 'antd'
import { TruckOutlined, SearchOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import type { DriverJobSummary } from '@/types/job'
import dayjs from 'dayjs'

export default function DriverJobList() {
  const router = useRouter()
  const [summaries, setSummaries] = useState<DriverJobSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(dayjs())
  const [searchText, setSearchText] = useState('')

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

  const filteredSummaries = useMemo(() => {
    if (!searchText.trim()) return summaries
    return summaries.filter((s) =>
      s.driverName.toLowerCase().includes(searchText.trim().toLowerCase())
    )
  }, [summaries, searchText])

  const handleCardClick = (driverId: string) => {
    const monthStr = month.format('YYYY-MM')
    router.push(`/jobs/${driverId}?month=${monthStr}`)
  }

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>รายการงานขนส่ง</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <Input
            placeholder="ค้นหาชื่อคนขับ"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 200 }}
          />
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : filteredSummaries.length === 0 ? (
        <Empty description={summaries.length === 0 ? 'ไม่มีข้อมูลคนขับ' : 'ไม่พบคนขับที่ค้นหา'} />
      ) : (
        <Row gutter={[16, 16]}>
          {filteredSummaries.map((s) => (
            <Col xs={24} sm={12} md={8} lg={6} key={s.driverId}>
              <Card
                hoverable
                onClick={() => handleCardClick(s.driverId)}
                styles={{ body: { padding: 20 } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <TruckOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                  <span style={{ fontSize: 18, fontWeight: 500 }}>{s.driverName}</span>
                </div>
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="งาน"
                      value={s.jobCount}
                      valueStyle={{ fontSize: 20 }}
                    />
                  </Col>
                  <Col span={16}>
                    <Statistic
                      title="ยอดโอนรวม"
                      value={s.totalTransfer}
                      precision={2}
                      valueStyle={{ fontSize: 16 }}
                      suffix="฿"
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
