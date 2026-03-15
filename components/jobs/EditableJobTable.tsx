'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Button, App, Divider, Popconfirm } from 'antd'
import {
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  UnlockOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import EditableCell from './EditableCell'
import QuickAddModal from './QuickAddModal'
import type { Job, Customer, Driver, Location } from '@/types/job'
import { JOB_TYPES, SIZE_OPTIONS } from '@/types/job'
import dayjs from 'dayjs'

interface EditableJobTableProps {
  driverId: string
  driverName: string
  month: string // format: YYYY-MM
  isAdmin: boolean
}

interface DraftRow {
  _tempId: string
  jobDate: string | null
  jobType: string
  customerId: string
  jobNumber: string
  driverId: string
  size: string | null
  pickupLocationId: string | null
  factoryLocationId: string | null
  returnLocationId: string | null
  estimatedTransfer: number
  income: number
  driverWage: number
  actualTransfer: number
  advance: number
  toll: number
  pickupFee: number
  returnFee: number
  liftFee: number
  storageFee: number
  tire: number
  other: number
  mileage: number | null
  fuelOfficeLiters: number | null
  fuelCashLiters: number | null
  fuelCashAmount: number | null
  fuelCreditLiters: number | null
  fuelCreditAmount: number | null
  clearStatus: boolean
  statementVerified: boolean
}

type RowData = (Job & { _tempId?: string }) | DraftRow

function isDraft(row: RowData): row is DraftRow {
  return '_tempId' in row && !('id' in row)
}

function getRowKey(row: RowData): string {
  return isDraft(row) ? row._tempId : row.id
}

export default function EditableJobTable({
  driverId,
  driverName,
  month,
  isAdmin,
}: EditableJobTableProps) {
  const { message } = App.useApp()
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])

  // Reference data
  const [customers, setCustomers] = useState<Customer[]>([])
  const [locations, setLocations] = useState<Location[]>([])

  // Quick add modal
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddType, setQuickAddType] = useState<'customer' | 'driver' | 'location'>('customer')
  const [quickAddLocationType, setQuickAddLocationType] = useState<'factory' | 'general' | undefined>()
  const [quickAddCallback, setQuickAddCallback] = useState<((item: { id: string }) => void) | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs?month=${month}&driverId=${driverId}`)
      if (res.ok) {
        const data = await res.json()
        setJobs(data)
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [month, driverId, message])

  const fetchReferenceData = useCallback(async () => {
    const [custRes, locRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/locations'),
    ])
    if (custRes.ok) setCustomers(await custRes.json())
    if (locRes.ok) setLocations(await locRes.json())
  }, [])

  useEffect(() => {
    fetchJobs()
    fetchReferenceData()
  }, [fetchJobs, fetchReferenceData])

  const factoryLocations = useMemo(
    () => locations.filter((l) => l.type === 'factory'),
    [locations]
  )
  const generalLocations = useMemo(
    () => locations.filter((l) => l.type === 'general'),
    [locations]
  )

  // Combined data: jobs + drafts
  const dataSource: RowData[] = useMemo(() => {
    const sorted = [...jobs].sort(
      (a, b) => new Date(a.jobDate).getTime() - new Date(b.jobDate).getTime()
    )
    if (editMode) {
      return [...sorted, ...draftRows]
    }
    return sorted
  }, [jobs, draftRows, editMode])

  const handleAddRow = () => {
    const newDraft: DraftRow = {
      _tempId: `draft_${Date.now()}`,
      jobDate: null,
      jobType: '',
      customerId: '',
      jobNumber: '',
      driverId,
      size: null,
      pickupLocationId: null,
      factoryLocationId: null,
      returnLocationId: null,
      estimatedTransfer: 0,
      income: 0,
      driverWage: 0,
      actualTransfer: 0,
      advance: 0,
      toll: 0,
      pickupFee: 0,
      returnFee: 0,
      liftFee: 0,
      storageFee: 0,
      tire: 0,
      other: 0,
      mileage: null,
      fuelOfficeLiters: null,
      fuelCashLiters: null,
      fuelCashAmount: null,
      fuelCreditLiters: null,
      fuelCreditAmount: null,
      clearStatus: false,
      statementVerified: false,
    }
    setDraftRows((prev) => [...prev, newDraft])
  }

  // Save a cell for existing job
  const handleCellSave = async (
    jobId: string,
    field: string,
    value: unknown
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'บันทึกล้มเหลว')
        return false
      }
      const updated = await res.json()
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)))
      return true
    } catch {
      message.error('บันทึกล้มเหลว')
      return false
    }
  }

  // Update draft row field
  const updateDraft = (tempId: string, field: string, value: unknown) => {
    setDraftRows((prev) =>
      prev.map((d) => (d._tempId === tempId ? { ...d, [field]: value } : d))
    )
  }

  // Create job from draft (triggered on blur of job_number)
  const handleCreateJob = async (draft: DraftRow) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDate: draft.jobDate,
          jobType: draft.jobType,
          customerId: draft.customerId,
          jobNumber: draft.jobNumber,
          driverId: draft.driverId,
          size: draft.size,
          pickupLocationId: draft.pickupLocationId,
          factoryLocationId: draft.factoryLocationId,
          returnLocationId: draft.returnLocationId,
          estimatedTransfer: draft.estimatedTransfer,
          income: draft.income,
          driverWage: draft.driverWage,
          actualTransfer: draft.actualTransfer,
          advance: draft.advance,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'สร้างงานล้มเหลว')
        return false
      }
      const newJob = await res.json()
      setJobs((prev) => [...prev, newJob])
      setDraftRows((prev) => prev.filter((d) => d._tempId !== draft._tempId))
      message.success('สร้างงานสำเร็จ')
      return true
    } catch {
      message.error('สร้างงานล้มเหลว')
      return false
    }
  }

  // Create เบิกล่วงหน้า job
  const handleCreateAdvanceJob = async (draft: DraftRow) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDate: draft.jobDate || dayjs().format('YYYY-MM-DD'),
          jobType: 'เบิกล่วงหน้า',
          customerId: draft.customerId,
          driverId: draft.driverId,
          advance: draft.advance,
          actualTransfer: draft.advance,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'สร้างงานล้มเหลว')
        return
      }
      const newJob = await res.json()
      setJobs((prev) => [...prev, newJob])
      setDraftRows((prev) => prev.filter((d) => d._tempId !== draft._tempId))
      message.success('สร้างงานเบิกล่วงหน้าสำเร็จ')
    } catch {
      message.error('สร้างงานล้มเหลว')
    }
  }

  const handleDeleteJob = async (row: RowData) => {
    if (isDraft(row)) {
      setDraftRows((prev) => prev.filter((d) => d._tempId !== row._tempId))
      return
    }
    try {
      const res = await fetch(`/api/jobs/${row.id}`, { method: 'DELETE' })
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== row.id))
        message.success('ลบงานสำเร็จ')
      } else {
        const err = await res.json()
        message.error(err.error || 'ลบล้มเหลว')
      }
    } catch {
      message.error('ลบล้มเหลว')
    }
  }

  const handleToggleClear = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/clear`, { method: 'PATCH' })
      if (res.ok) {
        const updated = await res.json()
        setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, clearStatus: updated.clearStatus } : j)))
      } else {
        const err = await res.json()
        message.error(err.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  // Open quick add modal
  const openQuickAdd = (
    type: 'customer' | 'driver' | 'location',
    locationType?: 'factory' | 'general',
    callback?: (item: { id: string }) => void
  ) => {
    setQuickAddType(type)
    setQuickAddLocationType(locationType)
    setQuickAddCallback(() => callback || null)
    setQuickAddOpen(true)
  }

  // Computed fields
  const computeDriverOverall = (row: RowData) => {
    return (
      (row.advance || 0) +
      (row.toll || 0) +
      (row.pickupFee || 0) +
      (row.returnFee || 0) +
      (row.liftFee || 0) +
      (row.storageFee || 0) +
      (row.tire || 0) +
      (row.other || 0)
    )
  }

  const computeDifference = (row: RowData) => {
    return computeDriverOverall(row) - (row.actualTransfer || 0)
  }

  const computeTotal = (row: RowData) => {
    return (row.actualTransfer || 0) + computeDifference(row)
  }

  const isAdvanceType = (row: RowData) => row.jobType === 'เบิกล่วงหน้า'

  // Helper to render editable cell
  const renderCell = (
    row: RowData,
    field: string,
    cellType: 'text' | 'number' | 'select' | 'date',
    options?: { value: string; label: string }[],
    extraProps?: {
      precision?: number
      dropdownRenderExtra?: React.ReactNode
      disabled?: boolean
    }
  ) => {
    const rowKey = getRowKey(row)
    const isLocked = row.clearStatus
    const rowIsDraft = isDraft(row)
    const fieldDisabled = extraProps?.disabled || false

    const cellValue = (row as unknown as Record<string, unknown>)[field]

    return (
      <EditableCell
        value={cellValue}
        cellType={cellType}
        editable={editMode && !isLocked && !fieldDisabled}
        locked={isLocked}
        options={options}
        precision={extraProps?.precision}
        dropdownRenderExtra={extraProps?.dropdownRenderExtra}
        onSave={async (value) => {
          if (rowIsDraft) {
            updateDraft(rowKey, field, value)

            // Special: เบิกล่วงหน้า auto-create
            if (field === 'jobType' && value === 'เบิกล่วงหน้า') {
              const draft = draftRows.find((d) => d._tempId === rowKey)
              if (draft) {
                // Will auto-create when customer is set
                updateDraft(rowKey, 'jobType', value)
              }
            }

            // Trigger create on job_number blur
            if (field === 'jobNumber' && value) {
              const draft = draftRows.find((d) => d._tempId === rowKey)
              if (draft) {
                const updatedDraft = { ...draft, jobNumber: value as string }
                return await handleCreateJob(updatedDraft)
              }
            }

            // For เบิกล่วงหน้า: auto-create when customerId is set
            if (field === 'customerId') {
              const draft = draftRows.find((d) => d._tempId === rowKey)
              if (draft && draft.jobType === 'เบิกล่วงหน้า' && value) {
                const updatedDraft = { ...draft, customerId: value as string }
                await handleCreateAdvanceJob(updatedDraft)
              }
            }

            // Sync actual_transfer = advance for เบิกล่วงหน้า
            if (field === 'advance' && isAdvanceType(row)) {
              updateDraft(rowKey, 'actualTransfer', value)
            }

            return true
          }

          // Existing job: PATCH
          const success = await handleCellSave((row as Job).id, field, value)

          // Sync actual_transfer for เบิกล่วงหน้า
          if (success && field === 'advance' && isAdvanceType(row)) {
            await handleCellSave((row as Job).id, 'actualTransfer', value)
          }

          return success
        }}
      />
    )
  }

  // Add button in dropdown
  const addButton = (
    type: 'customer' | 'driver' | 'location',
    locType?: 'factory' | 'general'
  ) => (
    <>
      <Divider style={{ margin: '4px 0' }} />
      <div style={{ padding: '4px 8px' }}>
        <Button
          type="link"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => openQuickAdd(type, locType)}
        >
          เพิ่มใหม่
        </Button>
      </div>
    </>
  )

  const columns = [
    {
      title: '#',
      key: 'index',
      width: 40,
      fixed: 'left' as const,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: 'ข้อมูลงาน',
      children: [
        {
          title: 'วันที่',
          dataIndex: 'jobDate',
          key: 'jobDate',
          width: 120,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'jobDate', 'date'),
        },
        {
          title: 'ลักษณะงาน',
          dataIndex: 'jobType',
          key: 'jobType',
          width: 130,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'jobType', 'select', JOB_TYPES.map((t) => ({ value: t, label: t }))),
        },
        {
          title: 'ลูกค้า',
          dataIndex: 'customerId',
          key: 'customerId',
          width: 140,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'customerId', 'select', customers.map((c) => ({ value: c.id, label: c.name })), {
              dropdownRenderExtra: addButton('customer'),
            }),
        },
        {
          title: 'JOB/เลขที่',
          dataIndex: 'jobNumber',
          key: 'jobNumber',
          width: 130,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'jobNumber', 'text', undefined, {
              disabled: isAdvanceType(row) && !isDraft(row),
            }),
        },
        {
          title: 'SIZE',
          dataIndex: 'size',
          key: 'size',
          width: 100,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'size', 'select', SIZE_OPTIONS.map((s) => ({ value: s, label: s })), {
              disabled: isAdvanceType(row),
            }),
        },
      ],
    },
    {
      title: 'สถานที่',
      children: [
        {
          title: 'สถานที่รับตู้',
          dataIndex: 'pickupLocationId',
          key: 'pickupLocationId',
          width: 140,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'pickupLocationId', 'select', generalLocations.map((l) => ({ value: l.id, label: l.name })), {
              disabled: isAdvanceType(row),
              dropdownRenderExtra: addButton('location', 'general'),
            }),
        },
        {
          title: 'โรงงาน',
          dataIndex: 'factoryLocationId',
          key: 'factoryLocationId',
          width: 140,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'factoryLocationId', 'select', factoryLocations.map((l) => ({ value: l.id, label: l.name })), {
              disabled: isAdvanceType(row),
              dropdownRenderExtra: addButton('location', 'factory'),
            }),
        },
        {
          title: 'สถานที่คืนตู้',
          dataIndex: 'returnLocationId',
          key: 'returnLocationId',
          width: 140,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'returnLocationId', 'select', generalLocations.map((l) => ({ value: l.id, label: l.name })), {
              disabled: isAdvanceType(row),
              dropdownRenderExtra: addButton('location', 'general'),
            }),
        },
      ],
    },
    {
      title: 'การเงินหลัก',
      children: [
        {
          title: 'คาดการณ์โอน',
          dataIndex: 'estimatedTransfer',
          key: 'estimatedTransfer',
          width: 120,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'estimatedTransfer', 'number', undefined, {
              disabled: isAdvanceType(row),
            }),
        },
        ...(isAdmin
          ? [
              {
                title: 'รายได้',
                dataIndex: 'income',
                key: 'income',
                width: 110,
                render: (_: unknown, row: RowData) =>
                  renderCell(row, 'income', 'number', undefined, {
                    disabled: isAdvanceType(row),
                  }),
              },
              {
                title: 'ค่าเที่ยวคนขับ',
                dataIndex: 'driverWage',
                key: 'driverWage',
                width: 120,
                render: (_: unknown, row: RowData) =>
                  renderCell(row, 'driverWage', 'number', undefined, {
                    disabled: isAdvanceType(row),
                  }),
              },
            ]
          : []),
        {
          title: 'ยอดโอนจริง',
          dataIndex: 'actualTransfer',
          key: 'actualTransfer',
          width: 120,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'actualTransfer', 'number', undefined, {
              disabled: isAdvanceType(row),
            }),
        },
      ],
    },
    {
      title: 'ค่าใช้จ่ายคนขับ',
      children: [
        { title: 'เบิกล่วงหน้า', dataIndex: 'advance', key: 'advance', width: 110, render: (_: unknown, row: RowData) => renderCell(row, 'advance', 'number') },
        { title: 'ค่าทางด่วน', dataIndex: 'toll', key: 'toll', width: 100, render: (_: unknown, row: RowData) => renderCell(row, 'toll', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'ค่ารับตู้', dataIndex: 'pickupFee', key: 'pickupFee', width: 100, render: (_: unknown, row: RowData) => renderCell(row, 'pickupFee', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'ค่าคืนตู้', dataIndex: 'returnFee', key: 'returnFee', width: 100, render: (_: unknown, row: RowData) => renderCell(row, 'returnFee', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'ค่ายกตู้', dataIndex: 'liftFee', key: 'liftFee', width: 100, render: (_: unknown, row: RowData) => renderCell(row, 'liftFee', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'ค่าฝากตู้', dataIndex: 'storageFee', key: 'storageFee', width: 100, render: (_: unknown, row: RowData) => renderCell(row, 'storageFee', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'ค่ายาง', dataIndex: 'tire', key: 'tire', width: 90, render: (_: unknown, row: RowData) => renderCell(row, 'tire', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'อื่นๆ', dataIndex: 'other', key: 'other', width: 90, render: (_: unknown, row: RowData) => renderCell(row, 'other', 'number', undefined, { disabled: isAdvanceType(row) }) },
      ],
    },
    {
      title: 'สรุป',
      children: [
        {
          title: 'รวมคนรถปิดงาน',
          key: 'driverOverall',
          width: 130,
          render: (_: unknown, row: RowData) => (
            <EditableCell value={computeDriverOverall(row)} cellType="computed" editable={false} locked={false} onSave={async () => true} />
          ),
        },
        {
          title: 'ส่วนต่าง',
          key: 'difference',
          width: 110,
          render: (_: unknown, row: RowData) => {
            const diff = computeDifference(row)
            return (
              <EditableCell
                value={diff}
                cellType="computed"
                editable={false}
                locked={false}
                onSave={async () => true}
                format={(v) => {
                  const n = v as number
                  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
                }}
              />
            )
          },
        },
        {
          title: 'รวมยอดโอน',
          key: 'totalTransfer',
          width: 120,
          render: (_: unknown, row: RowData) => (
            <EditableCell value={computeTotal(row)} cellType="computed" editable={false} locked={false} onSave={async () => true} />
          ),
        },
      ],
    },
    {
      title: 'น้ำมัน/ไมล์',
      children: [
        { title: 'ไมล์รถ', dataIndex: 'mileage', key: 'mileage', width: 90, render: (_: unknown, row: RowData) => renderCell(row, 'mileage', 'number', undefined, { precision: 0, disabled: isAdvanceType(row) }) },
        { title: 'น้ำมัน OFF (ลิตร)', dataIndex: 'fuelOfficeLiters', key: 'fuelOfficeLiters', width: 120, render: (_: unknown, row: RowData) => renderCell(row, 'fuelOfficeLiters', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'น้ำมันสด (ลิตร)', dataIndex: 'fuelCashLiters', key: 'fuelCashLiters', width: 120, render: (_: unknown, row: RowData) => renderCell(row, 'fuelCashLiters', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'น้ำมันสด (฿)', dataIndex: 'fuelCashAmount', key: 'fuelCashAmount', width: 110, render: (_: unknown, row: RowData) => renderCell(row, 'fuelCashAmount', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'น้ำมันเครดิต (ลิตร)', dataIndex: 'fuelCreditLiters', key: 'fuelCreditLiters', width: 130, render: (_: unknown, row: RowData) => renderCell(row, 'fuelCreditLiters', 'number', undefined, { disabled: isAdvanceType(row) }) },
        { title: 'น้ำมันเครดิต (฿)', dataIndex: 'fuelCreditAmount', key: 'fuelCreditAmount', width: 120, render: (_: unknown, row: RowData) => renderCell(row, 'fuelCreditAmount', 'number', undefined, { disabled: isAdvanceType(row) }) },
      ],
    },
    {
      title: 'สถานะ',
      fixed: 'right' as const,
      width: editMode ? 140 : 100,
      children: [
        {
          title: 'เคลียร์',
          key: 'clearStatus',
          width: 60,
          fixed: 'right' as const,
          render: (_: unknown, row: RowData) => {
            if (isDraft(row)) return null
            return (
              <EditableCell
                value={row.clearStatus}
                cellType="checkbox"
                editable={!row.clearStatus || isAdmin}
                locked={false}
                onSave={async () => {
                  await handleToggleClear(row.id)
                  return true
                }}
              />
            )
          },
        },
        {
          title: 'ST',
          key: 'statementVerified',
          width: 40,
          fixed: 'right' as const,
          render: (_: unknown, row: RowData) => {
            if (isDraft(row)) return null
            return row.statementVerified ? '✓' : ''
          },
        },
        ...(editMode
          ? [
              {
                title: '',
                key: 'actions',
                width: 40,
                fixed: 'right' as const,
                render: (_: unknown, row: RowData) => {
                  if (row.clearStatus) {
                    if (isAdmin) {
                      return (
                        <Button
                          type="link"
                          size="small"
                          icon={<UnlockOutlined />}
                          onClick={() => !isDraft(row) && handleToggleClear(row.id)}
                          title="ปลดล็อค"
                        />
                      )
                    }
                    return null
                  }
                  return (
                    <Popconfirm
                      title="ยืนยันการลบ"
                      description={isDraft(row) ? 'ล้างข้อมูล row นี้?' : 'ต้องการลบงานนี้?'}
                      onConfirm={() => handleDeleteJob(row)}
                      okText="ลบ"
                      cancelText="ยกเลิก"
                    >
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )
                },
              },
            ]
          : []),
      ],
    },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/jobs')}>
            กลับ
          </Button>
          <h2 style={{ margin: 0 }}>
            {driverName} — {dayjs(month + '-01').format('MMMM YYYY')}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editMode && (
            <Button icon={<PlusOutlined />} onClick={handleAddRow}>
              เพิ่ม row
            </Button>
          )}
          <Button
            type={editMode ? 'primary' : 'default'}
            icon={<EditOutlined />}
            onClick={() => {
              if (editMode) {
                // Exit edit mode: clear drafts without job_number
                setDraftRows((prev) => prev.filter((d) => d.jobNumber))
              }
              setEditMode(!editMode)
            }}
          >
            {editMode ? 'เสร็จสิ้น' : 'แก้ไข'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey={(row) => getRowKey(row as RowData)}
        loading={loading}
        scroll={{ x: 4000 }}
        size="small"
        pagination={false}
        bordered
        rowClassName={(row) => {
          const r = row as RowData
          if (isDraft(r)) return 'draft-row'
          if (r.clearStatus) return 'locked-row'
          return ''
        }}
      />

      {/* Quick Add Modal */}
      <QuickAddModal
        open={quickAddOpen}
        type={quickAddType}
        locationType={quickAddLocationType}
        onClose={() => setQuickAddOpen(false)}
        onSuccess={(item) => {
          fetchReferenceData()
          if (quickAddCallback) quickAddCallback(item)
        }}
      />

      <style jsx global>{`
        .draft-row {
          background-color: #fafafa !important;
        }
        .locked-row {
          background-color: #f5f5f5 !important;
          opacity: 0.7;
        }
        .ant-table-cell {
          padding: 4px 8px !important;
        }
      `}</style>
    </div>
  )
}
