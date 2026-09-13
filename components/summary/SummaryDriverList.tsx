'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Select, Input, Empty, Button, Tag } from 'antd'
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import type { Driver } from '@/types/job'
import { UNGROUPED } from '@/types/job'
import dayjs from 'dayjs'
import ExportRangeModal from './ExportRangeModal'

const OTHER_GROUP_LABEL = 'กลุ่มอื่นๆ'

export default function SummaryDriverList() {
  const router = useRouter()

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const [exportOpen, setExportOpen] = useState(false)

  const fetchDrivers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/drivers')
      if (res.ok) setDrivers(await res.json())
    } catch {
      console.error('Error fetching drivers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDrivers()
  }, [fetchDrivers])

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    drivers.forEach((d) => set.add(d.groupName ?? OTHER_GROUP_LABEL))
    return Array.from(set)
      .sort((a, b) => {
        // กลุ่มอื่นๆ อยู่ท้ายสุดเสมอ
        if (a === OTHER_GROUP_LABEL) return 1
        if (b === OTHER_GROUP_LABEL) return -1
        return a.localeCompare(b, 'th')
      })
      .map((g) => ({ label: g, value: g }))
  }, [drivers])

  // กรองด้วยกลุ่ม + คำค้น (ชื่อ หรือ เบอร์รถ) — ทั้งสองเงื่อนไขต้องผ่านพร้อมกัน
  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return drivers.filter((d) => {
      const groupLabel = d.groupName ?? OTHER_GROUP_LABEL
      if (selectedGroups.length > 0 && !selectedGroups.includes(groupLabel)) return false
      if (!q) return true
      return (
        d.name.toLowerCase().includes(q) ||
        (d.vehicleNumber ?? '').toLowerCase().includes(q)
      )
    })
  }, [drivers, selectedGroups, searchText])

  // ช่วง default ตอน export = ต้นปีนี้ ถึงเดือนล่าสุดที่จบแล้ว (ไม่รวมเดือนปัจจุบัน)
  const exportDefaultRange = useMemo((): [dayjs.Dayjs, dayjs.Dayjs] => {
    const start = dayjs().startOf('year')
    const lastClosed = dayjs().subtract(1, 'month')
    // ถ้าอยู่ ม.ค. ยังไม่มีเดือนที่จบในปีนี้ → ใช้ ม.ค. ทั้งคู่กันช่วงกลับด้าน
    return [start, lastClosed.isBefore(start) ? start : lastClosed]
  }, [])

  const columns = [
    {
      title: 'ชื่อคนขับ',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: Driver, b: Driver) => a.name.localeCompare(b.name, 'th'),
    },
    {
      title: 'เบอร์รถ',
      dataIndex: 'vehicleNumber',
      key: 'vehicleNumber',
      render: (v: string | null) => v || '-',
      sorter: (a: Driver, b: Driver) =>
        (a.vehicleNumber ?? '').localeCompare(b.vehicleNumber ?? '', 'th'),
    },
    {
      title: 'ทะเบียนรถ',
      dataIndex: 'vehicleRegistration',
      key: 'vehicleRegistration',
      render: (v: string | null) => v || '-',
    },
    {
      title: 'กลุ่ม',
      dataIndex: 'groupName',
      key: 'groupName',
      render: (v: string | null) => <Tag color="blue">{v ?? OTHER_GROUP_LABEL}</Tag>,
      sorter: (a: Driver, b: Driver) =>
        (a.groupName ?? OTHER_GROUP_LABEL).localeCompare(b.groupName ?? OTHER_GROUP_LABEL, 'th'),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>สรุปงาน</h1>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button
            data-testid="summary-export-btn"
            icon={<DownloadOutlined />}
            onClick={() => setExportOpen(true)}
          >
            ดาวน์โหลด Excel
          </Button>
          <Input
            data-testid="summary-search-input"
            placeholder="ค้นชื่อคนขับ หรือ เบอร์รถ"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            id="summary-group-filter"
            mode="multiple"
            placeholder="ทุกกลุ่ม"
            value={selectedGroups}
            onChange={setSelectedGroups}
            options={groupOptions}
            allowClear
            style={{ minWidth: 200 }}
            maxTagCount="responsive"
          />
        </div>
      </div>

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filtered}
        pagination={false}
        onRow={(record) => ({
          onClick: () => router.push(`/summary/${record.id}`),
          style: { cursor: 'pointer' },
          'data-testid': 'summary-row',
        })}
        locale={{
          emptyText: (
            <Empty
              description={drivers.length === 0 ? 'ไม่มีข้อมูลคนขับ' : 'ไม่พบคนขับตามเงื่อนไข'}
            />
          ),
        }}
      />

      <ExportRangeModal
        open={exportOpen}
        defaultRange={exportDefaultRange}
        onClose={() => setExportOpen(false)}
        buildUrl={(from, to) => {
          const params = new URLSearchParams({ from, to })
          if (selectedGroups.length > 0) {
            // กลุ่มอื่นๆ ส่งเป็น sentinel (UNGROUPED) ให้ API เข้าใจว่าคือคนที่ไม่มีกลุ่ม
            params.set(
              'groups',
              selectedGroups.map((g) => (g === OTHER_GROUP_LABEL ? UNGROUPED : g)).join(',')
            )
          }
          return `/api/summary/export?${params.toString()}`
        }}
      />
    </div>
  )
}
