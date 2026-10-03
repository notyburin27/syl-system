'use client'

import { useEffect, useState } from 'react'
import { Modal, Radio, Spin, Empty, App, Space } from 'antd'

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
      .catch(() => {
        // ล้างรายการเดิมด้วย — ไม่งั้นจะโชว์ candidate ของใบก่อนหน้าค้างไว้
        setCandidates([])
        message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
      })
      .finally(() => setLoading(false))
  }, [open, job, message])

  const selected = candidates.find((c) => c.id === selectedId) ?? null

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

        </>
      )}
    </Modal>
  )
}
