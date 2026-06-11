'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Modal, Select, Input, Button, App, Spin } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/th'
import type { DriverLeave, CompanyHoliday } from '@/types/leave'
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_OPTIONS } from '@/types/leave'

dayjs.locale('th')

interface Props {
  open: boolean
  driverId: string
  driverName: string
  month: string // YYYY-MM
  jobDates: string[] // วันที่มีงาน (format YYYY-MM-DD) ของคนขับในเดือนนี้
  onClose: () => void
  onChange: () => void // เรียกเมื่อมีการเพิ่ม/ลบวันลา เพื่อให้ parent refresh
}

type DayStatus = 'leave' | 'job' | 'holiday' | 'sunday' | 'available'

const WEEKDAY_LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

const STATUS_STYLE: Record<DayStatus, { bg: string; label?: string; labelColor?: string }> = {
  leave: { bg: '#fff7c2', labelColor: '#ad8b00' },
  job: { bg: '#f0f0f0', label: 'มีงาน', labelColor: '#8c8c8c' },
  holiday: { bg: '#ffccc7', label: 'วันหยุด', labelColor: '#cf1322' },
  sunday: { bg: '#ffe7e5', label: 'อาทิตย์', labelColor: '#cf1322' },
  available: { bg: '#ffffff' },
}

// สร้างคีย์วันที่แบบ UTC-safe (ไม่พึ่ง new Date เพื่อเลี่ยง timezone offset)
function dateKey(year: number, mon: number, day: number): string {
  const mm = String(mon).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export default function LeaveManagerModal({
  open,
  driverId,
  driverName,
  month,
  jobDates,
  onClose,
  onChange,
}: Props) {
  const { message } = App.useApp()
  const [leaves, setLeaves] = useState<DriverLeave[]>([])
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // วันที่ที่กำลังเลือก (YYYY-MM-DD) + form
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [leaveType, setLeaveType] = useState<'sick' | 'personal' | 'other'>('sick')
  const [note, setNote] = useState('')

  const [year, mon] = useMemo(() => month.split('-').map(Number), [month])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [leaveRes, holidayRes] = await Promise.all([
        fetch(`/api/jobs/leaves?driverId=${driverId}&month=${month}`),
        fetch(`/api/jobs/holidays?month=${month}`),
      ])
      if (leaveRes.ok) setLeaves(await leaveRes.json())
      if (holidayRes.ok) setHolidays(await holidayRes.json())
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [driverId, month, message])

  useEffect(() => {
    if (open) {
      fetchData()
      setSelectedKey(null)
      setNote('')
      setLeaveType('sick')
    }
  }, [open, fetchData])

  const jobDateSet = useMemo(() => new Set(jobDates), [jobDates])
  const holidayMap = useMemo(() => {
    const m = new Map<string, CompanyHoliday>()
    holidays.forEach((h) => m.set(dayjs(h.holidayDate).format('YYYY-MM-DD'), h))
    return m
  }, [holidays])
  const leaveMap = useMemo(() => {
    const m = new Map<string, DriverLeave>()
    leaves.forEach((l) => m.set(dayjs(l.leaveDate).format('YYYY-MM-DD'), l))
    return m
  }, [leaves])

  const getStatus = useCallback(
    (key: string, weekday: number): DayStatus => {
      if (leaveMap.has(key)) return 'leave'
      if (jobDateSet.has(key)) return 'job'
      if (holidayMap.has(key)) return 'holiday'
      if (weekday === 0) return 'sunday'
      return 'available'
    },
    [leaveMap, jobDateSet, holidayMap]
  )

  // สร้างตารางวันแบบ grid: weekday ของวันที่ 1 ใช้ UTC เพื่อเลี่ยง offset
  const cells = useMemo(() => {
    const daysInMonth = dayjs(`${month}-01`).daysInMonth()
    const firstWeekday = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay()
    const result: ({ day: number; key: string; weekday: number } | null)[] = []
    for (let i = 0; i < firstWeekday; i++) result.push(null)
    for (let day = 1; day <= daysInMonth; day++) {
      const weekday = (firstWeekday + day - 1) % 7
      result.push({ day, key: dateKey(year, mon, day), weekday })
    }
    return result
  }, [month, year, mon])

  const handleSelectDay = (key: string, weekday: number) => {
    const status = getStatus(key, weekday)
    if (status === 'job' || status === 'holiday' || status === 'sunday') return
    setSelectedKey(key)
    const existing = leaveMap.get(key)
    if (existing) {
      setLeaveType(existing.leaveType)
      setNote(existing.note || '')
    } else {
      setLeaveType('sick')
      setNote('')
    }
  }

  const handleSaveLeave = async () => {
    if (!selectedKey) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/jobs/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, leaveDate: selectedKey, leaveType, note }),
      })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'เกิดข้อผิดพลาด')
        return
      }
      message.success('ลงวันลาสำเร็จ')
      setSelectedKey(null)
      setNote('')
      await fetchData()
      onChange()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteLeave = async () => {
    if (!selectedKey) return
    const existing = leaveMap.get(selectedKey)
    if (!existing) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/jobs/leaves/${existing.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'เกิดข้อผิดพลาด')
        return
      }
      message.success('ยกเลิกวันลาสำเร็จ')
      setSelectedKey(null)
      setNote('')
      await fetchData()
      onChange()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const existingLeave = selectedKey ? leaveMap.get(selectedKey) : undefined

  return (
    <Modal
      title={`จัดการวันลา — ${driverName}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
    >
      <Spin spinning={loading}>
        <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>
          คลิกวันที่ต้องการลงลา (วันที่มีงาน / วันหยุด / วันอาทิตย์ จะเลือกไม่ได้)
        </div>

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* ซ้าย: ปฏิทิน grid (fix width) */}
          <div style={{ width: 520, flexShrink: 0 }}>
            <div style={{ textAlign: 'center', fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
              {dayjs(`${month}-01`).format('MMMM YYYY')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {WEEKDAY_LABELS.map((w, i) => (
                <div key={w} style={{ textAlign: 'center', fontSize: 12, color: i === 0 ? '#cf1322' : '#888', padding: '4px 0' }}>
                  {w}
                </div>
              ))}
              {cells.map((cell, i) => {
                if (!cell) return <div key={`empty-${i}`} />
                const status = getStatus(cell.key, cell.weekday)
                const style = STATUS_STYLE[status]
                const disabled = status === 'job' || status === 'holiday' || status === 'sunday'
                const isSelected = selectedKey === cell.key
                const leave = leaveMap.get(cell.key)
                const tagText = status === 'leave' && leave ? LEAVE_TYPE_LABELS[leave.leaveType] : style.label
                return (
                  <div
                    key={cell.key}
                    data-testid={`leave-day-${cell.key}`}
                    onClick={() => handleSelectDay(cell.key, cell.weekday)}
                    style={{
                      minHeight: 56,
                      padding: 4,
                      borderRadius: 6,
                      background: style.bg,
                      border: isSelected ? '2px solid #1677ff' : '1px solid #f0f0f0',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ textAlign: 'right', fontWeight: 500, fontSize: 13 }}>{cell.day}</div>
                    {tagText && (
                      <div style={{ fontSize: 11, color: style.labelColor, fontWeight: 500, lineHeight: 1.2 }}>
                        {tagText}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ขวา: form ลงลา (ค้างไว้ตลอด) */}
          <div style={{ flex: 1, padding: 16, background: '#fafafa', borderRadius: 8, minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
              {selectedKey
                ? `${existingLeave ? 'แก้ไขวันลา' : 'ลงวันลา'} — ${dayjs(selectedKey).format('D MMMM YYYY')}`
                : 'เลือกวันจากปฏิทิน'}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 4 }}>ประเภทการลา</div>
              <Select
                id="leave-type-select"
                value={leaveType}
                onChange={setLeaveType}
                disabled={!selectedKey}
                options={LEAVE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 4 }}>หมายเหตุ</div>
              <Input.TextArea
                data-testid="leave-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!selectedKey}
                placeholder="หมายเหตุ (ไม่บังคับ)"
                rows={3}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                data-testid="save-leave-btn"
                type="primary"
                loading={submitting}
                disabled={!selectedKey}
                onClick={handleSaveLeave}
              >
                {existingLeave ? 'บันทึก' : 'ลงลา'}
              </Button>
              {existingLeave && (
                <Button danger loading={submitting} onClick={handleDeleteLeave}>
                  ยกเลิกการลา
                </Button>
              )}
            </div>
          </div>
        </div>
      </Spin>
    </Modal>
  )
}
