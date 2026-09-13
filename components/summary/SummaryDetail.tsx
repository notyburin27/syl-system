'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, DatePicker, Spin, Empty, Button } from 'antd'
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useRouter, useSearchParams } from 'next/navigation'
import type { DriverMonthlySummary } from '@/types/job'
import { toThaiMonthYear } from '@/lib/utils/thaiDate'
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
    <div style={{ display: 'flex', alignItems: 'center', padding: '1px 8px', background, gap: 8 }}>
      {/* label ต้องไม่ตัดบรรทัด ไม่งั้นการ์ดสูงไม่เท่ากันและอ่านยาก */}
      <span
        style={{
          flex: 1,
          textAlign: 'right',
          color,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {/* กว้างพอสำหรับจำนวนเงินหลักล้าน เช่น 1,000,000.00 (วัดจริง 88px) */}
      <span
        style={{
          width: 112,
          textAlign: 'right',
          color,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {value ?? ''}
      </span>
      <span style={{ width: 38, color, fontSize: 13, whiteSpace: 'nowrap' }}>{unit}</span>
    </div>
  )
}

/** เส้นคั่นบางๆ ระหว่างกลุ่มแถว */
function RowGap() {
  return <div style={{ borderTop: '1px solid #f0f0f0', margin: '6px 0' }} />
}

/** การ์ดสรุปของหนึ่งเดือน */
function MonthCard({ s }: { s: DriverMonthlySummary }) {
  const fuelTotal =
    s.fuelPricePerLiter != null ? s.fuelPricePerLiter * s.fuelLiters : null
  const pct45 = s.income * 0.45
  const pct55 = s.income * 0.55
  const diff45 = fuelTotal != null ? pct45 - fuelTotal : null

  return (
    <Card
      data-testid="summary-month-card"
      styles={{ body: { padding: '12px 14px' } }}
      title={
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
          {toThaiMonthYear(s.month)}
        </div>
      }
    >
      <SummaryRow label="ลาหยุด" value={s.leaveDays || null} unit="วัน" color="#cf1322" />
      <SummaryRow label="ซ่อมรถ" value={s.repairDays || null} unit="วัน" />
      <SummaryRow label="งาน" value={s.jobTrips || null} unit="เที่ยว" color="#389e0d" />
      <SummaryRow label="ทอย" value={s.towingTrips || null} unit="เที่ยว" color="#389e0d" />
      <SummaryRow label="แบก" value={null} unit="เที่ยว" color="#389e0d" />
      <SummaryRow label="ค้างคืน" value={s.overnightDays || null} unit="วัน" />

      <RowGap />

      <SummaryRow label="รายได้" value={fmt(s.income)} unit="บาท" />
      <SummaryRow label="55%" value={fmt(pct55)} unit="บาท" />
      <SummaryRow label="45%" value={fmt(pct45)} unit="บาท" />

      <RowGap />

      <SummaryRow label="ราคาน้ำมันต่อลิตร" value={fmt(s.fuelPricePerLiter)} unit="บาท" />
      <SummaryRow label="จำนวนน้ำมัน" value={fmt(s.fuelLiters)} unit="ลิตร" />
      <SummaryRow label="รวมใช้น้ำมัน" value={fmt(fuelTotal)} unit="บาท" />
      <SummaryRow label="45% - ราคาน้ำมัน" value={fmt(diff45)} unit="บาท" background="#fce4d6" />

      <RowGap />

      <SummaryRow label="ค่าเที่ยว" value={fmt(s.driverWage)} unit="บาท" />
      <SummaryRow label="เงินเดือน" value={fmt(s.baseSalary)} unit="บาท" />
      <SummaryRow label="หัก น้ำมัน/หยุด" value={null} unit="บาท" color="#cf1322" />
      <SummaryRow label="สรุปให้เงินเดือนคนรถ" value={null} unit="บาท" background="#d9f7be" />
      <SummaryRow label="ค่าใช้จ่ายต่างๆ" value={null} unit="บาท" color="#cf1322" />
      <SummaryRow label="ยอดคงเหลือของบริษัท" value={null} unit="บาท" background="#ffffb8" />
    </Card>
  )
}

export default function SummaryDetail({ driverId }: { driverId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialYear = searchParams.get('year')

  const [months, setMonths] = useState<DriverMonthlySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [year, setYear] = useState(
    initialYear && dayjs(initialYear + '-01-01').isValid() ? dayjs(initialYear + '-01-01') : dayjs()
  )
  const [exportOpen, setExportOpen] = useState(false)

  const fetchYear = useCallback(
    async (y: dayjs.Dayjs) => {
      setLoading(true)
      try {
        const yyyy = y.format('YYYY')
        // API คืนเดือนล่าสุดก่อนอยู่แล้ว — ครอบทั้งปี ม.ค. ถึง ธ.ค.
        const res = await fetch(`/api/summary/${driverId}?from=${yyyy}-01&to=${yyyy}-12`)
        if (res.ok) setMonths(await res.json())
      } catch {
        console.error('Error fetching summary')
      } finally {
        setLoading(false)
      }
    },
    [driverId]
  )

  useEffect(() => {
    fetchYear(year)
  }, [year, fetchYear])

  // หัวการ์ดบรรทัดเดียว: ชื่อ · เบอร์รถ · กลุ่ม (ข้อมูลคนขับซ้ำทุกเดือน ใช้เดือนแรกพอ)
  const driverLine = useMemo(() => {
    const d = months[0]
    if (!d) return null
    return [d.driverName, d.vehicleNumber, d.groupName].filter(Boolean).join(' · ')
  }, [months])

  // ซ่อนเดือนปัจจุบันและเดือนอนาคต — แสดงเฉพาะเดือนที่จบแล้ว
  // (เดือน ก.ย. จะโผล่ก็ต่อเมื่อขึ้นเดือน ต.ค. แล้ว)
  const visibleMonths = useMemo(() => {
    const currentMonth = dayjs().format('YYYY-MM')
    return months.filter((s) => s.month < currentMonth)
  }, [months])

  // ช่วง default ตอน export = ม.ค. ถึงเดือนล่าสุดที่จบแล้ว ให้ตรงกับการ์ดที่เห็นบนหน้าจอ
  // ปีเก่าที่จบไปแล้วเอาถึง ธ.ค. ได้เต็มปี
  const exportDefaultRange = useMemo((): [dayjs.Dayjs, dayjs.Dayjs] => {
    const start = year.startOf('year')
    const lastClosed = dayjs().subtract(1, 'month')
    const end = year.isSame(dayjs(), 'year') ? lastClosed : year.endOf('year')
    // ถ้าอยู่ ม.ค. ยังไม่มีเดือนที่จบในปีนี้ → ใช้ ม.ค. ทั้งคู่กันช่วงกลับด้าน
    return [start, end.isBefore(start) ? start : end]
  }, [year])

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/summary')}>
            กลับ
          </Button>
          {driverLine && (
            <span style={{ fontSize: 18, fontWeight: 700 }}>{driverLine}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button
            data-testid="summary-detail-export-btn"
            icon={<DownloadOutlined />}
            onClick={() => setExportOpen(true)}
          >
            ดาวน์โหลด Excel
          </Button>
          <DatePicker
            id="summary-detail-year-picker"
            picker="year"
            value={year}
            onChange={(val) => val && setYear(val)}
            format="YYYY"
            allowClear={false}
            style={{ width: 120 }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" data-testid="summary-detail-loading" />
        </div>
      ) : visibleMonths.length === 0 ? (
        <Empty description="ยังไม่มีเดือนที่จบแล้วในปีนี้" />
      ) : (
        // เรียงแนวนอน scroll ได้ เหมือนบล็อกเดือนใน Excel (เดือนล่าสุดอยู่ซ้ายสุด)
        <div
          data-testid="summary-month-scroller"
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 12,
            alignItems: 'flex-start',
          }}
        >
          {visibleMonths.map((s) => (
            <div key={s.month} style={{ flex: '0 0 auto', width: 400 }}>
              <MonthCard s={s} />
            </div>
          ))}
        </div>
      )}

      <ExportRangeModal
        open={exportOpen}
        defaultRange={exportDefaultRange}
        onClose={() => setExportOpen(false)}
        buildUrl={(from, to) => `/api/summary/export?from=${from}&to=${to}&driverId=${driverId}`}
      />
    </div>
  )
}
