'use client'

import { useState } from 'react'
import { Modal, Table, Tag, Button, Typography } from 'antd'
import type { FuelMissingRouteView, FuelSegmentView, FuelStandardSummary } from '@/types/job'
import { toThaiMonthYear, toThaiShortDate } from '@/lib/utils/thaiDate'
import FuelStandardFormModal, {
  fuelStandardLabel,
  type FuelStandardFormValues,
} from '@/components/jobs/FuelStandardFormModal'

const fmtLiters = (v: number | null) =>
  v == null ? '-' : v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtSignedLiters = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : ''}${fmtLiters(v)}`)

export const diffColor = (v: number | null) => (v == null || v === 0 ? undefined : v > 0 ? '#cf1322' : '#389e0d')

const STATUS_TAG: Record<FuelSegmentView['status'], { color: string; label: string }> = {
  ok: { color: 'green', label: 'คำนวณได้' },
  missing_standard: { color: 'orange', label: 'ไม่มีค่ามาตรฐาน' },
  no_previous_fill: { color: 'orange', label: 'ไม่พบจุดเติมก่อนหน้า' },
}

const routeLabel = (m: FuelMissingRouteView) => fuelStandardLabel(m, m.locationName)

interface Props {
  open: boolean
  month: string | null
  fuel: FuelStandardSummary | null
  onClose: () => void
  /** หลังเพิ่มค่ามาตรฐานจาก quick-add — ให้หน้าโหลดสรุปใหม่ */
  onStandardSaved: () => void
}

export default function FuelSegmentsModal({ open, month, fuel, onClose, onStandardSaved }: Props) {
  const [quickAdd, setQuickAdd] = useState<FuelStandardFormValues | null>(null)

  const columns = [
    {
      title: 'ช่วงวันที่', key: 'range',
      render: (_: unknown, s: FuelSegmentView) => `${toThaiShortDate(s.startDate)} – ${toThaiShortDate(s.endDate)}`,
    },
    { title: 'จำนวน job', dataIndex: 'jobCount', key: 'jobCount', align: 'right' as const, width: 80 },
    { title: 'มาตรฐาน', dataIndex: 'standardLiters', key: 'standard', align: 'right' as const, render: fmtLiters },
    { title: 'ใช้จริง', dataIndex: 'actualLiters', key: 'actual', align: 'right' as const, render: fmtLiters },
    {
      title: 'ส่วนต่าง', dataIndex: 'diffLiters', key: 'diff', align: 'right' as const,
      render: (v: number | null) => <span style={{ color: diffColor(v), fontWeight: 600 }}>{fmtSignedLiters(v) || '-'}</span>,
    },
    {
      title: 'สถานะ', dataIndex: 'status', key: 'status',
      render: (v: FuelSegmentView['status']) => <Tag color={STATUS_TAG[v].color}>{STATUS_TAG[v].label}</Tag>,
    },
  ]

  const renderMissing = (s: FuelSegmentView) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {s.missingRoutes.map((m) => {
        const canAdd = !!(m.size && m.locationId)
        return (
          <div key={`${routeLabel(m)}|${m.jobNumbers.join(',')}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>
              {routeLabel(m)} <Typography.Text type="secondary">(JOB {m.jobNumbers.join(', ')})</Typography.Text>
            </span>
            {canAdd ? (
              <Button
                size="small"
                data-testid="fuel-quick-add-btn"
                onClick={() =>
                  setQuickAdd({
                    kind: m.kind,
                    size: m.size!,
                    locationId: m.locationId!,
                    isLaemChabang: m.isLaemChabang,
                  })
                }
              >
                ตั้งค่า
              </Button>
            ) : (
              <Typography.Text type="warning">job กรอกข้อมูลไม่ครบ</Typography.Text>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      <Modal
        title={`รายละเอียดช่วงน้ำมัน ${month ? toThaiMonthYear(month) : ''}`}
        open={open}
        onCancel={onClose}
        footer={null}
        width={820}
        destroyOnClose
      >
        <Table
          size="small"
          rowKey="closingJobNumber"
          columns={columns}
          dataSource={fuel?.segments ?? []}
          pagination={false}
          expandable={{
            rowExpandable: (s) => s.missingRoutes.length > 0,
            expandedRowRender: renderMissing,
            defaultExpandAllRows: true,
          }}
          locale={{ emptyText: 'ไม่มีช่วงที่ปิดในเดือนนี้' }}
        />
        {fuel && fuel.pendingJobCount > 0 && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            รอปิดช่วง: {fuel.pendingJobCount} job หลังเติมครั้งล่าสุด
          </Typography.Text>
        )}
      </Modal>

      <FuelStandardFormModal
        open={quickAdd !== null}
        editing={null}
        initialValues={quickAdd ?? undefined}
        onClose={() => setQuickAdd(null)}
        onSaved={onStandardSaved}
      />
    </>
  )
}
