'use client'

import { useState, useMemo, useEffect } from 'react'
import { Modal, Input, Empty, List } from 'antd'
import { SearchOutlined, TruckOutlined } from '@ant-design/icons'
import type { DriverJobSummary } from '@/types/job'

export default function DriverSearchModal({
  open,
  summaries,
  onClose,
  onSelect,
}: {
  open: boolean
  summaries: DriverJobSummary[]
  onClose: () => void
  onSelect: (driverId: string, groupName: string | null) => void
}) {
  const [searchText, setSearchText] = useState('')

  // ล้างคำค้นทุกครั้งที่เปิดใหม่ ไม่ให้ค้างจากครั้งก่อน
  useEffect(() => {
    if (open) setSearchText('')
  }, [open])

  // ค้นจาก summaries ทั้งชุด ไม่ผ่านตัวกรองกลุ่ม — จุดสำคัญที่แก้ bug เดิม
  const results = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return []
    return summaries.filter(
      (s) =>
        s.driverName.toLowerCase().includes(q) ||
        (s.vehicleNumber ?? '').toLowerCase().includes(q)
    )
  }, [summaries, searchText])

  return (
    <Modal
      title="ค้นหาคนขับ"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <Input
        data-testid="driver-search-input"
        placeholder="ค้นจากชื่อคนขับ หรือ เบอร์รถ"
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
        autoFocus
        style={{ marginBottom: 12 }}
      />

      {searchText.trim() === '' ? (
        <Empty description="พิมพ์ชื่อคนขับหรือเบอร์รถเพื่อค้นหา" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : results.length === 0 ? (
        <Empty description="ไม่พบคนขับที่ค้นหา" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={results}
          style={{ maxHeight: 360, overflowY: 'auto' }}
          renderItem={(s) => (
            <List.Item
              data-testid="driver-search-result"
              onClick={() => onSelect(s.driverId, s.groupName)}
              style={{ cursor: 'pointer' }}
            >
              <List.Item.Meta
                avatar={<TruckOutlined style={{ fontSize: 18, color: '#1890ff' }} />}
                title={`${s.driverName}${s.vehicleNumber ? ` (${s.vehicleNumber})` : ''}`}
                description={s.groupName ?? 'กลุ่มอื่นๆ'}
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  )
}
