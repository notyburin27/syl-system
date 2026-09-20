'use client'

import { useEffect, useState } from 'react'
import { Modal, Radio, Spin, Empty, App, Space, Alert } from 'antd'
import { getPairedSize } from '@/types/job'

interface PairCandidate {
  id: string
  jobNumber: string
  jobDate: string
  size: string | null
  customer: { name: string } | null
  factoryLocation: { name: string } | null
  income?: number | null
  driverWage?: number | null
  willBePrimary: boolean
}

interface PairJobModalProps {
  open: boolean
  job: {
    id: string
    jobNumber: string
    size: string | null
    income: number | null
    driverWage: number | null
  } | null
  isAdmin: boolean
  onClose: () => void
  onSuccess: () => void
}

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString()

export default function PairJobModal({
  open, job, isAdmin, onClose, onSuccess,
}: PairJobModalProps) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [candidates, setCandidates] = useState<PairCandidate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !job) return
    setLoading(true)
    setSelectedId(null)
    fetch(`/api/jobs/${job.id}/pair-candidates`)
      .then((r) => r.json())
      .then((d: { jobs?: PairCandidate[] }) => {
        const list = d.jobs ?? []
        setCandidates(list)
        if (list.length === 1) setSelectedId(list[0].id)
      })
      .catch(() => message.error('เกิดข้อผิดพลาดในการดึงข้อมูล'))
      .finally(() => setLoading(false))
  }, [open, job, message])

  const selected = candidates.find((c) => c.id === selectedId) ?? null
  const pairedSize = getPairedSize(job?.size ?? null)

  const handleConfirm = async () => {
    if (!job || !selectedId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/pair-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherJobId: selectedId }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || 'จับคู่ไม่สำเร็จ')
        return
      }
      message.success(`จับคู่ ${job.jobNumber} + ${selected?.jobNumber} เรียบร้อย`)
      onSuccess()
      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาดในการจับคู่')
    } finally {
      setSaving(false)
    }
  }

  // ใบไหนถือยอด — candidate ที่ willBePrimary หรือใบที่เปิดอยู่
  const primaryLabel = selected
    ? selected.willBePrimary ? selected.jobNumber : job?.jobNumber
    : ''

  return (
    <Modal
      open={open}
      title={`จับคู่งาน — ${job?.jobNumber ?? ''}`}
      onCancel={onClose}
      onOk={handleConfirm}
      okText="ยืนยัน"
      cancelText="ยกเลิก"
      okButtonProps={{
        disabled: !selectedId || loading,
        loading: saving,
        'data-testid': 'pair-confirm-btn',
      }}
      destroyOnHidden
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : candidates.length === 0 ? (
        <Empty description="ไม่มีงานที่จับคู่ได้" />
      ) : (
        <>
          <div style={{ marginBottom: 8, fontSize: 13, color: '#595959' }}>
            เลือกงานที่วิ่งไปด้วยกัน:
          </div>
          <Radio.Group
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {candidates.map((c) => (
                <Radio key={c.id} value={c.id} data-testid={`pair-candidate-${c.jobNumber}`}>
                  {c.jobNumber} · {c.size ?? '—'}
                  {c.factoryLocation ? ` · ${c.factoryLocation.name}` : ''}
                  {c.customer ? ` · ${c.customer.name}` : ''}
                  {isAdmin && c.income != null ? ` · ค่าขนส่ง ${fmt(c.income)}` : ''}
                </Radio>
              ))}
            </Space>
          </Radio.Group>

          {selected && (
            <div
              style={{
                marginTop: 16, padding: 12,
                background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 6,
                fontSize: 13, lineHeight: 1.8,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 4 }}>ผลลัพธ์:</div>
              <div>ใบที่จะถือยอด → <b>{primaryLabel}</b> (สร้างทีหลัง)</div>
              <div>
                {isAdmin
                  ? `ยอดที่จะถูกล้างทั้งคู่ → ${job?.jobNumber}: ค่าขนส่ง ${fmt(job?.income)} · ค่าเที่ยว ${fmt(job?.driverWage)} , ${selected.jobNumber}: ค่าขนส่ง ${fmt(selected.income)} · ค่าเที่ยว ${fmt(selected.driverWage)}`
                  : `ยอดของทั้งสองใบจะถูกล้าง`}
              </div>
              <div>อัตราที่จะใช้ → <b>{pairedSize ?? '—'}</b></div>
            </div>
          )}

          {selected && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message={`ยอดของทั้งสองใบจะถูกล้าง — กด "ดึงข้อมูล" เพื่อเติมอัตรา ${pairedSize ?? ''}`}
            />
          )}
        </>
      )}
    </Modal>
  )
}
