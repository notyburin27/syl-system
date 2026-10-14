'use client'

import { useState, useEffect } from 'react'
import { Modal, DatePicker, App } from 'antd'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export default function ExportRangeModal({
  open,
  defaultRange,
  onClose,
  buildUrl,
}: {
  open: boolean
  /** ช่วงเดือนตั้งต้น [from, to] */
  defaultRange: [dayjs.Dayjs, dayjs.Dayjs]
  onClose: () => void
  /** สร้าง URL ของ export API จากช่วงเดือนที่เลือก — คืนหลาย URL = ดาวน์โหลดทีละไฟล์ตามลำดับ */
  buildUrl: (from: string, to: string) => string | string[]
}) {
  const { message } = App.useApp()
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(defaultRange)
  const [loading, setLoading] = useState(false)

  // เทียบด้วยสตริงเดือน ไม่ใช่ object — dayjs สร้างใหม่ทุก render จะ reset ไม่รู้จบ
  const fromKey = defaultRange[0].format('YYYY-MM')
  const toKey = defaultRange[1].format('YYYY-MM')

  useEffect(() => {
    if (open) setRange([dayjs(fromKey + '-01'), dayjs(toKey + '-01')])
  }, [open, fromKey, toKey])

  /** ดาวน์โหลดไฟล์จาก URL เดียว — คืนข้อความ error ถ้าไม่สำเร็จ */
  const downloadOne = async (url: string): Promise<string | null> => {
    const res = await fetch(url)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return err.error || 'เกิดข้อผิดพลาดในการ export'
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
    return null
  }

  const handleExport = async () => {
    setLoading(true)
    try {
      const built = buildUrl(range[0].format('YYYY-MM'), range[1].format('YYYY-MM'))
      const urls = Array.isArray(built) ? built : [built]

      // ทีละไฟล์ ไม่ยิงพร้อมกัน — แต่ละคำขอคำนวณสรุปทุกเดือนในช่วง หนักฝั่ง server
      let failed = 0
      for (let i = 0; i < urls.length; i++) {
        if (urls.length > 1) {
          message.loading({ key: 'export-progress', content: `กำลังดาวน์โหลด ${i + 1}/${urls.length}`, duration: 0 })
        }
        const error = await downloadOne(urls[i])
        if (error) {
          failed++
          message.error(error)
        }
        // browser บางตัวทิ้งการดาวน์โหลดที่ถี่เกินไป
        if (urls.length > 1 && i < urls.length - 1) await new Promise((r) => setTimeout(r, 400))
      }
      message.destroy('export-progress')

      if (urls.length > 1) {
        if (failed === 0) message.success(`ดาวน์โหลดครบ ${urls.length} ไฟล์`)
        else message.warning(`ดาวน์โหลดสำเร็จ ${urls.length - failed}/${urls.length} ไฟล์`)
      }
      if (failed < urls.length) onClose()
    } catch {
      message.destroy('export-progress')
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
