'use client'

import { useState, useMemo, useEffect } from 'react'
import { Modal, Input, Empty, List, Tag } from 'antd'
import { SearchOutlined, TruckOutlined } from '@ant-design/icons'
import type { Driver } from '@/types/job'

const OTHER_GROUP_LABEL = 'กลุ่มอื่นๆ'

/**
 * ค้นหาคนขับเพื่อสลับไปดูสรุปของคนอื่น
 *
 * แยกจาก components/jobs/DriverSearchModal โดยตั้งใจ — ตัวนั้นผูกกับ DriverJobSummary
 * ของหน้า jobs และมีเทสต์คุมอยู่ การดัดแปลงให้รับสองชนิดเสี่ยงพังของเดิมโดยไม่จำเป็น
 */
export default function SummaryDriverSwitchModal({
  open,
  currentDriverId,
  onClose,
  onSelect,
}: {
  open: boolean
  currentDriverId: string
  onClose: () => void
  onSelect: (driverId: string) => void
}) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(false)

  // โหลดรายชื่อใหม่ทุกครั้งที่เปิด — ถ้า cache ไว้ คนขับที่เพิ่งเพิ่มจะไม่โผล่
  // (รายชื่อคนขับไม่ใหญ่ ยิงซ้ำถูกกว่าเสี่ยงแสดงข้อมูลเก่า)
  useEffect(() => {
    if (!open) return
    setSearchText('')
    setLoading(true)
    fetch('/api/drivers')
      .then((res) => (res.ok ? res.json() : []))
      .then(setDrivers)
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false))
  }, [open])

  const results = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return drivers
    return drivers.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.vehicleNumber ?? '').toLowerCase().includes(q)
    )
  }, [drivers, searchText])

  return (
    <Modal title="เปลี่ยนคนขับ" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      <Input
        data-testid="switch-driver-search"
        placeholder="ค้นชื่อคนขับ หรือ เบอร์รถ"
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
        autoFocus
        style={{ marginBottom: 12 }}
      />

      {results.length === 0 ? (
        <Empty
          description={loading ? 'กำลังโหลด...' : 'ไม่พบคนขับที่ค้นหา'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          size="small"
          dataSource={results}
          style={{ maxHeight: 400, overflowY: 'auto' }}
          renderItem={(d) => {
            const isCurrent = d.id === currentDriverId
            return (
              <List.Item
                data-testid="switch-driver-result"
                onClick={() => !isCurrent && onSelect(d.id)}
                style={{
                  cursor: isCurrent ? 'default' : 'pointer',
                  opacity: isCurrent ? 0.45 : 1,
                }}
              >
                <List.Item.Meta
                  avatar={<TruckOutlined style={{ fontSize: 18, color: '#1890ff' }} />}
                  title={
                    <span>
                      {d.name}
                      {d.vehicleNumber ? ` (${d.vehicleNumber})` : ''}
                      {isCurrent && (
                        <Tag color="default" style={{ marginLeft: 8 }}>
                          กำลังดูอยู่
                        </Tag>
                      )}
                    </span>
                  }
                  description={d.groupName ?? OTHER_GROUP_LABEL}
                />
              </List.Item>
            )
          }}
        />
      )}
    </Modal>
  )
}
