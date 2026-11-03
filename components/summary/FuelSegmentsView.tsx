'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App, Button, Card, DatePicker, Modal, Segmented, Spin, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, UnorderedListOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { FuelMissingRouteView, FuelSegmentJobView, FuelSegmentView, FuelStandardSummary } from '@/types/job'
import { getJobTypeLabel } from '@/types/job'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import { diffColor, fmtLiters, fmtSignedLiters } from '@/lib/utils/fuelFormat'
import FuelStandardFormModal, {
  fuelStandardLabel,
  type FuelStandardFormValues,
} from '@/components/jobs/FuelStandardFormModal'

interface FuelSegmentsResponse {
  driver: { id: string; name: string; vehicleNumber: string | null; isGasVehicle: boolean }
  month: string
  fuel: FuelStandardSummary | null
}

const STATUS_TAG: Record<FuelSegmentView['status'], { color: string; label: string }> = {
  ok: { color: 'green', label: 'คำนวณได้' },
  missing_standard: { color: 'orange', label: 'ไม่มีค่ามาตรฐาน' },
  no_previous_fill: { color: 'orange', label: 'ไม่พบจุดเติมก่อนหน้า' },
}

const JOB_NOTE: Record<NonNullable<FuelSegmentJobView['note']>, string> = {
  pair_secondary: 'ใบรองงานคู่',
  towing_absorbed: 'ทอยถูกดูดซับ',
}

type Filter = 'all' | 'incomplete'

function Stat({ label, value, color, testId }: { label: string; value: React.ReactNode; color?: string; testId?: string }) {
  return (
    <Card size="small" style={{ minWidth: 170 }} styles={{ body: { display: 'flex', flexDirection: 'column', gap: 2 } }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{label}</Typography.Text>
      <span data-testid={testId} style={{ fontSize: 20, fontWeight: 600, color }}>{value}</span>
    </Card>
  )
}

export default function FuelSegmentsView({ driverId, month }: { driverId: string; month: string }) {
  const router = useRouter()
  const { message } = App.useApp()
  const [data, setData] = useState<FuelSegmentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [quickAdd, setQuickAdd] = useState<FuelStandardFormValues | null>(null)
  const [jobsOf, setJobsOf] = useState<FuelSegmentView | null>(null)

  const fetchData = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      // silent = โหลดใหม่หลัง quick-add — ไม่สลับเป็น Spin ตารางจะได้ไม่กระโดด
      if (!opts.silent) setLoading(true)
      try {
        const res = await fetch(`/api/fuel-segments/${driverId}?month=${month}`)
        const body = await res.json()
        if (!res.ok) {
          message.error(body.error || 'เกิดข้อผิดพลาดในการดึงข้อมูล')
          return
        }
        setData(body)
      } catch {
        message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
      } finally {
        if (!opts.silent) setLoading(false)
      }
    },
    [driverId, month, message],
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const fuel = data?.fuel ?? null
  const segments = useMemo(() => fuel?.segments ?? [], [fuel])
  const incomplete = segments.filter((s) => s.status !== 'ok')
  const hasComputed = segments.some((s) => s.status === 'ok')
  const rows = filter === 'incomplete' ? incomplete : segments

  const renderMissing = (missingRoutes: FuelMissingRouteView[]) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {missingRoutes.map((m, i) => {
        const label = fuelStandardLabel(m, m.locationName)
        return (
          <div
            key={`${label}|${m.jobNumbers.join(',')}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '4px 0',
              // ปุ่มชิดขวาห่างจากข้อความ — เส้นประช่วยให้ไล่ตาว่าปุ่มไหนของรายการไหน
              borderTop: i > 0 ? '1px dashed #f0f0f0' : undefined,
            }}
          >
            <span style={{ flex: '1 1 auto' }}>
              {label} <Typography.Text type="secondary">({m.jobNumbers.join(', ')})</Typography.Text>
            </span>
            {m.size && m.locationId ? (
              <Button
                size="small"
                style={{ marginLeft: 'auto' }}
                data-testid="fuel-quick-add-btn"
                onClick={() =>
                  setQuickAdd({
                    kind: m.kind,
                    size: m.size!,
                    locationId: m.locationId!,
                    pickupLaemChabang: m.pickupLaemChabang,
                    returnLaemChabang: m.returnLaemChabang,
                  })
                }
              >
                ตั้งค่า
              </Button>
            ) : (
              <Typography.Text type="warning" style={{ marginLeft: 'auto' }}>job กรอกข้อมูลไม่ครบ</Typography.Text>
            )}
          </div>
        )
      })}
    </div>
  )

  const columns = [
    { title: 'เริ่ม', dataIndex: 'startDate', key: 'start', width: 100, render: (v: string) => toThaiShortDate(v) },
    { title: 'ถึง (วันเติม)', dataIndex: 'endDate', key: 'end', width: 110, render: (v: string) => toThaiShortDate(v) },
    {
      title: 'จำนวน job', dataIndex: 'jobCount', key: 'jobCount', align: 'right' as const, width: 100,
      render: (v: number, s: FuelSegmentView) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setJobsOf(s)} data-testid="fuel-segment-jobs-btn">
          {v} งาน
        </Button>
      ),
    },
    { title: 'มาตรฐาน', dataIndex: 'standardLiters', key: 'standard', align: 'right' as const, width: 110, render: fmtLiters },
    { title: 'ใช้จริง', dataIndex: 'actualLiters', key: 'actual', align: 'right' as const, width: 110, render: fmtLiters },
    {
      title: 'ส่วนต่าง', dataIndex: 'diffLiters', key: 'diff', align: 'right' as const, width: 110,
      render: (v: number | null) => <span style={{ color: diffColor(v), fontWeight: 600 }}>{fmtSignedLiters(v) || '-'}</span>,
    },
    {
      title: 'สถานะ', dataIndex: 'status', key: 'status', width: 160,
      render: (v: FuelSegmentView['status']) => <Tag color={STATUS_TAG[v].color}>{STATUS_TAG[v].label}</Tag>,
    },
    {
      title: 'ค่าที่ขาด', key: 'missing',
      render: (_: unknown, s: FuelSegmentView) => (s.missingRoutes.length > 0 ? renderMissing(s.missingRoutes) : null),
    },
  ]

  const jobColumns = [
    { title: 'วันที่', dataIndex: 'jobDate', key: 'date', width: 100, render: (v: string) => toThaiShortDate(v) },
    { title: 'JOB', dataIndex: 'jobNumber', key: 'jobNumber', width: 160 },
    { title: 'ลักษณะงาน', dataIndex: 'jobType', key: 'jobType', width: 100, render: getJobTypeLabel },
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 80, render: (v: string | null) => v ?? '-' },
    { title: 'รับตู้', dataIndex: 'pickupLocationName', key: 'pickup', render: (v: string | null) => v ?? '-' },
    { title: 'โรงงาน', dataIndex: 'factoryLocationName', key: 'factory', render: (v: string | null) => v ?? '-' },
    { title: 'คืนตู้', dataIndex: 'returnLocationName', key: 'return', render: (v: string | null) => v ?? '-' },
    {
      title: 'มาตรฐาน', key: 'standard', align: 'right' as const, width: 160,
      render: (_: unknown, j: FuelSegmentJobView) =>
        j.standardLiters == null ? (
          <Tag color="orange" style={{ marginInlineEnd: 0 }}>ไม่มีค่า</Tag>
        ) : (
          <>
            {fmtLiters(j.standardLiters)}
            {j.note && <Typography.Text type="secondary"> ({JOB_NOTE[j.note]})</Typography.Text>}
          </>
        ),
    },
    {
      title: 'เติม', dataIndex: 'fuelLiters', key: 'fuel', align: 'right' as const, width: 100,
      render: (v: number) => (v > 0 ? <strong>{fmtLiters(v)}</strong> : ''),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            // เปิดจากลิงก์ในแท็บใหม่ไม่มีประวัติให้ย้อน — กลับไปหน้ารายการงานของคนขับแทน
            onClick={() => (window.history.length > 1 ? router.back() : router.push(`/jobs/${driverId}?month=${month}`))}
            data-testid="fuel-segments-back-btn"
          >
            กลับ
          </Button>
          <h2 style={{ margin: 0 }}>
            ช่วงน้ำมัน{data ? ` · ${data.driver.name}${data.driver.vehicleNumber ? ` (${data.driver.vehicleNumber})` : ''}` : ''}
          </h2>
          <DatePicker
            id="fuel-segments-month-picker"
            picker="month"
            value={dayjs(month + '-01')}
            format="MMMM YYYY"
            allowClear={false}
            style={{ width: 180 }}
            onChange={(d) => d && router.replace(`/jobs/${driverId}/fuel?month=${d.format('YYYY-MM')}`)}
          />
        </div>
        <Button icon={<UnorderedListOutlined />} onClick={() => router.push(`/jobs/${driverId}?month=${month}`)}>
          รายการงานเดือนนี้
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : data?.driver.isGasVehicle ? (
        <Alert type="info" showIcon message="รถก๊าซ — ไม่คำนวณน้ำมันมาตรฐาน" />
      ) : fuel ? (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat
              label="น้ำมันเกินมาตรฐาน"
              testId="fuel-page-excess"
              value={hasComputed ? fmtSignedLiters(fuel.excessLiters) : '-'}
              color={hasComputed ? diffColor(fuel.excessLiters) : undefined}
            />
            <Stat
              label="น้ำมันเกินสุทธิ"
              testId="fuel-page-net"
              value={hasComputed ? fmtSignedLiters(fuel.netDiffLiters) : '-'}
              color={hasComputed ? diffColor(fuel.netDiffLiters) : undefined}
            />
            <Stat label="ช่วงที่ปิดในเดือนนี้" testId="fuel-page-segments" value={segments.length} />
            <Stat
              label="ไม่ครบ"
              testId="fuel-page-incomplete"
              value={incomplete.length}
              color={incomplete.length > 0 ? '#d48806' : undefined}
            />
            <Stat label="รอปิดช่วง (job หลังเติมครั้งล่าสุด)" value={fuel.pendingJobCount} />
          </div>

          <Segmented<Filter>
            style={{ marginBottom: 12 }}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `ทั้งหมด (${segments.length})` },
              { value: 'incomplete', label: `ไม่ครบ (${incomplete.length})` },
            ]}
          />

          <Table
            size="small"
            rowKey="closingJobNumber"
            columns={columns}
            dataSource={rows}
            pagination={false}
            sticky
            locale={{ emptyText: filter === 'incomplete' ? 'ไม่มีช่วงที่ไม่ครบ' : 'ไม่มีช่วงที่ปิดในเดือนนี้' }}
          />
        </>
      ) : null}

      <Modal
        title={jobsOf ? `งานในช่วง ${toThaiShortDate(jobsOf.startDate)} – ${toThaiShortDate(jobsOf.endDate)}` : ''}
        open={jobsOf !== null}
        onCancel={() => setJobsOf(null)}
        footer={null}
        width="calc(100vw - 32px)"
        style={{ top: 16, paddingBottom: 0 }}
        styles={{ body: { height: 'calc(100vh - 110px)', overflow: 'auto' } }}
        destroyOnClose
      >
        {jobsOf && (
          <Table
            size="small"
            rowKey="id"
            columns={jobColumns}
            dataSource={jobsOf.jobs ?? []}
            pagination={false}
            data-testid="fuel-segment-jobs"
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7} align="right"><strong>รวม</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  <strong>{fmtLiters(jobsOf.standardLiters)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <strong>{fmtLiters(jobsOf.actualLiters)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        )}
      </Modal>

      <FuelStandardFormModal
        open={quickAdd !== null}
        editing={null}
        initialValues={quickAdd ?? undefined}
        onClose={() => setQuickAdd(null)}
        onSaved={() => fetchData({ silent: true })}
      />
    </div>
  )
}
