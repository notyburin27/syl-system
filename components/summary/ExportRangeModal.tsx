'use client'

import { useState, useEffect } from 'react'
import { Modal, DatePicker, App } from 'antd'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export default function ExportRangeModal({
  open,
  defaultMonth,
  onClose,
  buildUrl,
}: {
  open: boolean
  defaultMonth: dayjs.Dayjs
  onClose: () => void
  /** สร้าง URL ของ export API จากช่วงเดือนที่เลือก */
  buildUrl: (from: string, to: string) => string
}) {
  const { message } = App.useApp()
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([defaultMonth, defaultMonth])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setRange([defaultMonth, defaultMonth])
  }, [open, defaultMonth])

  const handleExport = async () => {
    setLoading(true)
    try {
      const url = buildUrl(range[0].format('YYYY-MM'), range[1].format('YYYY-MM'))
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        message.error(err.error || 'เกิดข้อผิดพลาดในการ export')
        return
      }

      // ดึงชื่อไฟล์จาก Content-Disposition ที่ API ตั้งมา
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename\*=UTF-8''(.+)$/)
      const filename = match ? decodeURIComponent(match[1]) : 'สรุปงาน.xlsx'

      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)

      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาดในการ export')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="เลือกช่วงเดือนที่ต้องการ"
      open={open}
      onCancel={onClose}
      onOk={handleExport}
      okText="ดาวน์โหลด"
      cancelText="ยกเลิก"
      confirmLoading={loading}
      okButtonProps={{ 'data-testid': 'export-confirm-btn' } as never}
      destroyOnHidden
    >
      <p style={{ marginBottom: 8, color: '#666' }}>
        แต่ละเดือนจะเป็นบล็อกเรียงไปทางขวาในไฟล์ เดือนล่าสุดอยู่ซ้ายสุด
      </p>
      <RangePicker
        id="export-month-range"
        picker="month"
        value={range}
        onChange={(vals) => {
          if (vals?.[0] && vals?.[1]) setRange([vals[0], vals[1]])
        }}
        format="MMMM YYYY"
        allowClear={false}
        style={{ width: '100%' }}
      />
    </Modal>
  )
}
