'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Modal, Calendar, Select, Input, Button, App, Tag, Spin, Space, Popconfirm } from 'antd'
import type { Dayjs } from 'dayjs'
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

  // วันที่ที่กำลังเลือกอยู่ + form
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null)
  const [leaveType, setLeaveType] = useState<'sick' | 'personal' | 'other'>('sick')
  const [note, setNote] = useState('')

  const monthValue = useMemo(() => dayjs(`${month}-01`), [month])

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
      setSelectedDate(null)
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
    (date: Dayjs): DayStatus => {
      const key = date.format('YYYY-MM-DD')
      if (leaveMap.has(key)) return 'leave'
      if (jobDateSet.has(key)) return 'job'
      if (holidayMap.has(key)) return 'holiday'
      if (date.day() === 0) return 'sunday'
      return 'available'
    },
    [leaveMap, jobDateSet, holidayMap]
  )

  const handleSelectDate = (date: Dayjs) => {
    // เลือกเฉพาะวันในเดือนที่ดูอยู่
    if (date.format('YYYY-MM') !== month) return
    const status = getStatus(date)
    if (status === 'job' || status === 'holiday' || status === 'sunday') return
    setSelectedDate(date)
    const existing = leaveMap.get(date.format('YYYY-MM-DD'))
    if (existing) {
      setLeaveType(existing.leaveType)
      setNote(existing.note || '')
    } else {
      setLeaveType('sick')
      setNote('')
    }
  }

  const handleSaveLeave = async () => {
    if (!selectedDate) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/jobs/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId,
          leaveDate: selectedDate.format('YYYY-MM-DD'),
          leaveType,
          note,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'เกิดข้อผิดพลาด')
        return
      }
      message.success('ลงวันลาสำเร็จ')
      setSelectedDate(null)
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
    if (!selectedDate) return
    const existing = leaveMap.get(selectedDate.format('YYYY-MM-DD'))
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
      setSelectedDate(null)
      setNote('')
      await fetchData()
      onChange()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const cellRender = (date: Dayjs) => {
    if (date.format('YYYY-MM') !== month) return null
    const status = getStatus(date)
    const key = date.format('YYYY-MM-DD')
    if (status === 'leave') {
      const l = leaveMap.get(key)!
      return <Tag color="gold" style={{ margin: 0 }}>{LEAVE_TYPE_LABELS[l.leaveType]}</Tag>
    }
    if (status === 'job') return <Tag style={{ margin: 0 }}>มีงาน</Tag>
    if (status === 'holiday') return <Tag color="red" style={{ margin: 0 }}>วันหยุด</Tag>
    if (status === 'sunday') return <Tag color="red" style={{ margin: 0 }}>อาทิตย์</Tag>
    return null
  }

  const fullCellRender = (date: Dayjs, info: { originNode: React.ReactNode }) => {
    if (date.format('YYYY-MM') !== month) return info.originNode
    const status = getStatus(date)
    const disabled = status === 'job' || status === 'holiday' || status === 'sunday'
    const isSelected = selectedDate?.isSame(date, 'day')
    return (
      <div
        onClick={() => handleSelectDate(date)}
        style={{
          minHeight: 60,
          padding: 4,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          border: isSelected ? '2px solid #1677ff' : '1px solid transparent',
          borderRadius: 6,
          background: isSelected ? '#e6f4ff' : undefined,
        }}
      >
        <div style={{ textAlign: 'right', fontWeight: 500 }}>{date.date()}</div>
        <div style={{ marginTop: 2 }}>{cellRender(date)}</div>
      </div>
    )
  }

  const existingLeave = selectedDate ? leaveMap.get(selectedDate.format('YYYY-MM-DD')) : undefined

  return (
    <Modal
      title={`จัดการวันลา — ${driverName}`}
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>ปิด</Button>}
      width={680}
    >
      <Spin spinning={loading}>
        <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>
          คลิกวันที่ต้องการลงลา (วันที่มีงาน / วันหยุด / วันอาทิตย์ จะเลือกไม่ได้)
        </div>
        <Calendar
          fullscreen={false}
          value={monthValue}
          fullCellRender={fullCellRender}
          headerRender={() => (
            <div style={{ padding: '8px 0', fontWeight: 600, fontSize: 16, textAlign: 'center' }}>
              {monthValue.format('MMMM YYYY')}
            </div>
          )}
        />

        {selectedDate && (
          <div style={{ marginTop: 16, padding: 16, background: '#fafafa', borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
              {existingLeave ? 'แก้ไขวันลา' : 'ลงวันลา'} — {selectedDate.format('D MMMM YYYY')}
            </div>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <div style={{ marginBottom: 4 }}>ประเภทการลา</div>
                <Select
                  id="leave-type-select"
                  value={leaveType}
                  onChange={setLeaveType}
                  options={LEAVE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 4 }}>หมายเหตุ</div>
                <Input.TextArea
                  data-testid="leave-note-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="หมายเหตุ (ไม่บังคับ)"
                  rows={2}
                />
              </div>
              <Space>
                <Button
                  data-testid="save-leave-btn"
                  type="primary"
                  loading={submitting}
                  onClick={handleSaveLeave}
                >
                  {existingLeave ? 'บันทึก' : 'ลงลา'}
                </Button>
                {existingLeave && (
                  <Popconfirm
                    title="ยกเลิกวันลา"
                    description="ต้องการยกเลิกการลาวันนี้ใช่หรือไม่?"
                    onConfirm={handleDeleteLeave}
                    okText="ยกเลิกการลา"
                    cancelText="ปิด"
                  >
                    <Button danger loading={submitting}>ยกเลิกการลา</Button>
                  </Popconfirm>
                )}
                <Button onClick={() => setSelectedDate(null)}>ปิด</Button>
              </Space>
            </Space>
          </div>
        )}
      </Spin>
    </Modal>
  )
}
