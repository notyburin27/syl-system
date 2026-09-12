'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, DatePicker, Spin, Empty, Button, Row, Col, Divider } from 'antd'
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useRouter, useSearchParams } from 'next/navigation'
import type { DriverMonthlySummary } from '@/types/job'
import dayjs from 'dayjs'
import ExportRangeModal from './ExportRangeModal'

function fmt(value: number | null) {
  if (value == null) return ''
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** แถวหนึ่งในบล็อกสรุป — ช่องที่ระบบไม่มีข้อมูลส่ง value เป็น null จะแสดงว่าง */
function SummaryRow({
  label,
  value,
  unit,
  color,
  background,
}: {
  label: string
  value: string | number | null
  unit: string
  color?: string
  background?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', background, gap: 8 }}>
      <span style={{ flex: 1, textAlign: 'right', color, fontWeight: 600 }}>{label}</span>
      <span style={{ width: 140, textAlign: 'right', color, fontWeight: 600 }}>
        {value ?? ''}
      </span>
      <span style={{ width: 50, color }}>{unit}</span>
    </div>
  )
}

export default function SummaryDetail({ driverId }: { driverId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMonth = searchParams.get('month')

  const [summary, setSummary] = useState<DriverMonthlySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(
    initialMonth && dayjs(initialMonth + '-01').isValid() ? dayjs(initialMonth + '-01') : dayjs()
  )
  const [exportOpen, setExportOpen] = useState(false)

  const fetchSummary = useCallback(
    async (m: dayjs.Dayjs) => {
      setLoading(true)
      try {
        const monthStr = m.format('YYYY-MM')
        const res = await fetch(`/api/summary/${driverId}?from=${monthStr}&to=${monthStr}`)
        if (res.ok) {
          const data: DriverMonthlySummary[] = await res.json()
          setSummary(data[0] ?? null)
        }
      } catch {
        console.error('Error fetching summary')
      } finally {
        setLoading(false)
      }
    },
    [driverId]
  )

  useEffect(() => {
    fetchSummary(month)
  }, [month, fetchSummary])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" data-testid="summary-detail-loading" />
      </div>
    )
  }

  if (!summary) {
    return <Empty description="ไม่พบข้อมูลคนขับ" />
  }

  const fuelTotal =
    summary.fuelPricePerLiter != null ? summary.fuelPricePerLiter * summary.fuelLiters : null
  const pct45 = summary.income * 0.45
  const pct55 = summary.income * 0.55
  const diff45 = fuelTotal != null ? pct45 - fuelTotal : null

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(`/summary?month=${month.format('YYYY-MM')}`)}>
          กลับ
        </Button>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button
            data-testid="summary-detail-export-btn"
            icon={<DownloadOutlined />}
            onClick={() => setExportOpen(true)}
          >
            ดาวน์โหลด Excel
          </Button>
          <DatePicker
            id="summary-detail-month-picker"
            picker="month"
            value={month}
            onChange={(val) => val && setMonth(val)}
            format="MMMM YYYY"
            allowClear={false}
            style={{ width: 180 }}
          />
        </div>
      </div>

      <Card style={{ maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 4, fontSize: 18, fontWeight: 700 }}>
          {summary.driverName}
        </div>
        <div style={{ textAlign: 'center', color: '#888', marginBottom: 16 }}>
          {summary.vehicleNumber ?? ''} · {summary.groupName ?? 'กลุ่มอื่นๆ'}
        </div>

        <SummaryRow label="ลาหยุด" value={summary.leaveDays || null} unit="วัน" color="#cf1322" />
        <SummaryRow label="ซ่อมรถ" value={summary.repairDays || null} unit="วัน" />
        <SummaryRow label="งาน" value={summary.jobTrips || null} unit="เที่ยว" color="#389e0d" />
        <SummaryRow label="ทอย" value={summary.towingTrips || null} unit="เที่ยว" color="#389e0d" />
        <SummaryRow label="แบก" value={null} unit="เที่ยว" color="#389e0d" />
        <SummaryRow label="ค้างคืน" value={null} unit="วัน" />

        <Divider style={{ margin: '12px 0' }} />

        <SummaryRow label="รายได้" value={fmt(summary.income)} unit="บาท" />
        <SummaryRow label="55%" value={fmt(pct55)} unit="บาท" />
        <SummaryRow label="45%" value={fmt(pct45)} unit="บาท" />

        <Divider style={{ margin: '12px 0' }} />

        <SummaryRow label="ราคาน้ำมันต่อลิตร" value={fmt(summary.fuelPricePerLiter)} unit="บาท" />
        <SummaryRow label="จำนวนน้ำมัน" value={fmt(summary.fuelLiters)} unit="ลิตร์" />
        <SummaryRow label="รวมใช้น้ำมัน" value={fmt(fuelTotal)} unit="บาท" />
        <SummaryRow label="45% - ราคาน้ำมัน" value={fmt(diff45)} unit="บาท" background="#fce4d6" />

        <Divider style={{ margin: '12px 0' }} />

        <SummaryRow label="ค่าเที่ยว" value={fmt(summary.driverWage)} unit="บาท" />
        <SummaryRow label="เงินเดือน" value={fmt(summary.baseSalary)} unit="บาท" />
        <SummaryRow label="หัก น้ำมัน/หยุด" value={null} unit="บาท" color="#cf1322" />
        <SummaryRow label="สรุปให้เงินเดือนคนรถ" value={null} unit="บาท" background="#d9f7be" />
        <SummaryRow label="ค่าใช่จ่ายต่างๆ" value={null} unit="บาท" color="#cf1322" />
        <SummaryRow label="ยอดคงเหลืองของบริษัท" value={null} unit="บาท" background="#ffffb8" />

        <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
          ช่องที่เว้นว่างยังไม่มีข้อมูลในระบบ — กรอกได้ในไฟล์ Excel ที่ดาวน์โหลด
        </div>
      </Card>

      <ExportRangeModal
        open={exportOpen}
        defaultMonth={month}
        onClose={() => setExportOpen(false)}
        buildUrl={(from, to) => `/api/summary/export?from=${from}&to=${to}&driverId=${driverId}`}
      />
    </div>
  )
}
