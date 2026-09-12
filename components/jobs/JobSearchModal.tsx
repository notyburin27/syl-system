'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal, Input, Tag, Button, Empty, Skeleton, App } from 'antd'
import {
  SearchOutlined,
  UserOutlined,
  CalendarOutlined,
  ShopOutlined,
  UnlockOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { getJobTypeLabel } from '@/types/job'
import type { JobSearchResult, JobSearchResponse } from '@/types/job'

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 350

/** ไฮไลต์ส่วนของข้อความที่ตรงกับคำค้น (case-insensitive) */
function highlight(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#ffe58f', padding: 0 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

function ResultCard({
  job,
  query,
  isAdmin,
  unlocking,
  onOpen,
  onUnlock,
}: {
  job: JobSearchResult
  query: string
  isAdmin: boolean
  unlocking: boolean
  onOpen: (job: JobSearchResult) => void
  onUnlock: (job: JobSearchResult) => void
}) {
  const canUnlock = isAdmin && job.clearStatus

  return (
    <div
      data-testid={`job-search-result-${job.id}`}
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 8,
        background: job.isCancelled ? '#fff1f0' : job.clearStatus ? '#f6ffed' : '#fff',
      }}
    >
      {/* บรรทัด 1: เลขงาน + สถานะ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span
          data-testid={`job-search-number-${job.id}`}
          style={{ fontSize: 15, fontWeight: 600 }}
        >
          {highlight(job.jobNumber, query)}
        </span>
        <Tag color="blue" style={{ margin: 0 }}>{getJobTypeLabel(job.jobType)}</Tag>
        {job.clearStatus && <Tag color="green" style={{ margin: 0 }}>เคลียร์แล้ว</Tag>}
        {job.isCancelled && <Tag color="red" style={{ margin: 0 }}>ยกเลิก</Tag>}
      </div>

      {/* บรรทัด 2: คนขับ + กลุ่ม */}
      <div style={{ fontSize: 13, color: '#666', marginBottom: 3 }}>
        <UserOutlined style={{ marginRight: 6 }} />
        {job.driver
          ? `${job.driver.name}${job.driver.vehicleNumber ? ` (${job.driver.vehicleNumber})` : ''}`
          : 'ไม่ระบุคนขับ'}
        {job.driver?.groupName ? ` · ${job.driver.groupName}` : ''}
      </div>

      {/* บรรทัด 3: วันที่ + ลูกค้า + size */}
      <div style={{ fontSize: 13, color: '#666' }}>
        <CalendarOutlined style={{ marginRight: 6 }} />
        {dayjs(job.jobDate).format('DD/MM/YYYY')}
        {job.customer && (
          <>
            <ShopOutlined style={{ margin: '0 6px 0 12px' }} />
            {job.customer.name}
          </>
        )}
        {job.size ? ` · ${job.size}` : ''}
      </div>

      {/* ปุ่ม */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        {canUnlock && (
          <Button
            data-testid={`job-search-unlock-${job.id}`}
            size="small"
            danger
            ghost
            icon={<UnlockOutlined />}
            loading={unlocking}
            onClick={() => onUnlock(job)}
          >
            ปลดล็อก
          </Button>
        )}
        <Button
          data-testid={`job-search-open-${job.id}`}
          size="small"
          type="primary"
          icon={<ExportOutlined />}
          disabled={!job.driverId}
          title={!job.driverId ? 'งานนี้ไม่มีคนขับ จึงเปิดหน้ารายการไม่ได้' : undefined}
          onClick={() => onOpen(job)}
        >
          เปิดดู
        </Button>
      </div>
    </div>
  )
}

export default function JobSearchModal({
  open,
  isAdmin,
  onClose,
}: {
  open: boolean
  isAdmin: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<JobSearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(0)
  const [loading, setLoading] = useState(false)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const { message, modal } = App.useApp()
  const inputRef = useRef<React.ComponentRef<typeof Input>>(null)
  const requestIdRef = useRef(0)

  // debounce คำค้น
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // reset ทุกครั้งที่เปิด modal ใหม่
  useEffect(() => {
    if (!open) return
    setQuery('')
    setDebounced('')
    setResults([])
    setTotal(0)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (debounced.length < MIN_QUERY_LENGTH) {
      setResults([])
      setTotal(0)
      setLoading(false)
      return
    }

    // กันผลลัพธ์เก่ามาทับผลลัพธ์ใหม่เมื่อ request กลับมาไม่เรียงลำดับ
    const reqId = ++requestIdRef.current
    setLoading(true)
    fetch(`/api/jobs/search?q=${encodeURIComponent(debounced)}`)
      .then(async (res) => {
        if (reqId !== requestIdRef.current) return
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          message.error(err.error || 'เกิดข้อผิดพลาดในการค้นหา')
          setResults([])
          setTotal(0)
          return
        }
        const data: JobSearchResponse = await res.json()
        setResults(data.jobs)
        setTotal(data.total)
        setLimit(data.limit)
      })
      .catch(() => {
        if (reqId !== requestIdRef.current) return
        message.error('เกิดข้อผิดพลาดในการค้นหา')
        setResults([])
        setTotal(0)
      })
      .finally(() => {
        if (reqId === requestIdRef.current) setLoading(false)
      })
  }, [debounced, open, message])

  const handleOpen = useCallback((job: JobSearchResult) => {
    if (!job.driverId) return
    const params = new URLSearchParams({
      month: dayjs(job.jobDate).format('YYYY-MM'),
      highlight: job.id,
    })
    if (job.driver?.groupName) params.set('group', job.driver.groupName)
    window.open(`/jobs/${job.driverId}?${params.toString()}`, '_blank', 'noopener')
  }, [])

  const handleUnlock = useCallback(
    (job: JobSearchResult) => {
      modal.confirm({
        title: 'ปลดล็อกงาน',
        content: `ต้องการปลดล็อกงาน ${job.jobNumber} ใช่หรือไม่? งานจะกลับไปเป็นสถานะ "ยังไม่เคลียร์" และแก้ไขได้อีกครั้ง`,
        okText: 'ปลดล็อก',
        okButtonProps: { danger: true },
        cancelText: 'ยกเลิก',
        onOk: async () => {
          setUnlockingId(job.id)
          try {
            const res = await fetch(`/api/jobs/${job.id}/clear`, { method: 'PATCH' })
            const data = await res.json()
            if (!res.ok) {
              message.error(data.error || 'เกิดข้อผิดพลาดในการปลดล็อก')
              return
            }
            setResults((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, clearStatus: data.clearStatus } : j))
            )
            message.success(`ปลดล็อกงาน ${job.jobNumber} แล้ว`)
          } catch {
            message.error('เกิดข้อผิดพลาดในการปลดล็อก')
          } finally {
            setUnlockingId(null)
          }
        },
      })
    },
    [modal, message]
  )

  const showHint = debounced.length < MIN_QUERY_LENGTH

  return (
    <Modal
      title="ค้นหา JOB/เลขที่"
      open={open}
      onCancel={onClose}
      footer={null}
      width={620}
      destroyOnHidden
    >
      <Input
        ref={inputRef}
        data-testid="job-search-input"
        placeholder="พิมพ์เลขงาน เช่น 547075"
        prefix={<SearchOutlined />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        allowClear
        size="large"
      />

      <div style={{ marginTop: 16, maxHeight: '55vh', overflowY: 'auto' }}>
        {showHint ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '32px 0' }}>
            พิมพ์อย่างน้อย {MIN_QUERY_LENGTH} ตัวอักษรเพื่อค้นหา
          </div>
        ) : loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : results.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`ไม่พบงานที่ตรงกับ "${debounced}"`}
          />
        ) : (
          <>
            <div
              data-testid="job-search-count"
              style={{ fontSize: 13, color: '#666', marginBottom: 8 }}
            >
              พบ {total} รายการ
            </div>
            {results.map((job) => (
              <ResultCard
                key={job.id}
                job={job}
                query={debounced}
                isAdmin={isAdmin}
                unlocking={unlockingId === job.id}
                onOpen={handleOpen}
                onUnlock={handleUnlock}
              />
            ))}
            {total > limit && (
              <div style={{ textAlign: 'center', fontSize: 13, color: '#999', padding: '8px 0' }}>
                แสดง {limit} จาก {total} รายการ — พิมพ์ให้ละเอียดขึ้นเพื่อผลลัพธ์ที่แคบลง
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
