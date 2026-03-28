'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Table, Button, App, Divider } from 'antd'
import {
  EditOutlined,
  FormOutlined,
  PlusOutlined,
  DeleteOutlined,
  UnlockOutlined,
  ArrowLeftOutlined,
  ImportOutlined,
  LoadingOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import EditableCell from './EditableCell'
import QuickAddModal from './QuickAddModal'
import ImportJobModal from './ImportJobModal'
import JobFormModal from './JobFormModal'
import type { Job, Customer, Driver, Location } from '@/types/job'
import { JOB_TYPES, SIZE_OPTIONS } from '@/types/job'
import dayjs from 'dayjs'
import 'dayjs/locale/th'

dayjs.locale('th')

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
  estimatedTransfer: number | null
  income: number | null
  driverWage: number | null
  actualTransfer: number | null
  advance: number | null
  toll: number | null
  pickupFee: number | null
  returnFee: number | null
  liftFee: number | null
  storageFee: number | null
  tire: number | null
  other: number | null
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
  const { message, modal } = App.useApp()
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [modalEditMode, setModalEditMode] = useState(false)
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])

  // Job form modal state
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [formModalMode, setFormModalMode] = useState<'create' | 'edit'>('create')
  const [formModalJob, setFormModalJob] = useState<Job | null>(null)

  // Save status indicator
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleSaveStatus = useCallback((status: 'saving' | 'saved' | 'error') => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus(status)
    if (status === 'saved') {
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [])

  // Reference data
  const [customers, setCustomers] = useState<Customer[]>([])

  const [locations, setLocations] = useState<Location[]>([])

  // Quick add modal
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddType, setQuickAddType] = useState<'customer' | 'driver' | 'location'>('customer')
  const [quickAddLocationType, setQuickAddLocationType] = useState<'factory' | 'general' | undefined>()
  const [quickAddCallback, setQuickAddCallback] = useState<((item: { id: string }) => void) | null>(null)

  // Import modal
  const [importOpen, setImportOpen] = useState(false)

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

  // Fetch and sync silently (mutate in place, no re-render)
  const fetchJobsSilent = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs?month=${month}&driverId=${driverId}`)
      if (res.ok) {
        const data: Job[] = await res.json()
        setJobs((prev) => {
          prev.length = 0
          prev.push(...data)
          return prev
        })
      }
    } catch {
      // silent
    }
  }, [month, driverId])

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
      estimatedTransfer: null,
      income: null,
      driverWage: null,
      actualTransfer: null,
      advance: null,
      toll: null,
      pickupFee: null,
      returnFee: null,
      liftFee: null,
      storageFee: null,
      tire: null,
      other: null,
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

  // Debounced save: batch pending changes per job
  const pendingChangesRef = useRef<Map<string, Record<string, unknown>>>(new Map())
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const flushSave = useCallback(async (jobId: string) => {
    const changes = pendingChangesRef.current.get(jobId)
    if (!changes) return true
    pendingChangesRef.current.delete(jobId)
    debounceTimersRef.current.delete(jobId)

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'บันทึกล้มเหลว')
        handleSaveStatus('error')
        return false
      }
      await res.json()
      // Update fields locally without re-rendering other cells
      setJobs((prev) => {
        const job = prev.find((j) => j.id === jobId)
        if (job) Object.assign(job as unknown as Record<string, unknown>, changes)
        return prev
      })
      handleSaveStatus('saved')
      return true
    } catch {
      message.error('บันทึกล้มเหลว')
      handleSaveStatus('error')
      return false
    }
  }, [message, handleSaveStatus])

  const handleCellSave = useCallback((
    jobId: string,
    field: string,
    value: unknown
  ): Promise<boolean> => {
    // Merge into pending changes
    const existing = pendingChangesRef.current.get(jobId) || {}
    existing[field] = value
    pendingChangesRef.current.set(jobId, existing)

    // Update local state immediately
    setJobs((prev) => {
      const job = prev.find((j) => j.id === jobId)
      if (job) (job as unknown as Record<string, unknown>)[field] = value
      return prev
    })

    handleSaveStatus('saving')

    // Clear existing timer and set new one
    const existingTimer = debounceTimersRef.current.get(jobId)
    if (existingTimer) clearTimeout(existingTimer)

    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        const result = await flushSave(jobId)
        resolve(result)
      }, 1000)
      debounceTimersRef.current.set(jobId, timer)
    })
  }, [flushSave, handleSaveStatus])

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
        await fetchJobsSilent()
        return false
      }
      const newJob = await res.json()
      setJobs((prev) => {
        prev.push(newJob)
        return prev
      })
      setDraftRows((prev) => prev.filter((d) => d._tempId !== draft._tempId))
      return true
    } catch {
      message.error('สร้างงานล้มเหลว')
      await fetchJobsSilent()
      return false
    }
  }

  // Create เบิกล่วงหน้า job (requires: jobDate, jobType, advance)
  const handleCreateAdvanceJob = async (draft: DraftRow) => {
    if (!draft.jobDate || !draft.advance) return
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDate: draft.jobDate,
          jobType: 'เบิกล่วงหน้า',
          customerId: draft.customerId || undefined,
          driverId: draft.driverId,
          advance: draft.advance,
          actualTransfer: draft.advance,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'สร้างงานล้มเหลว')
        await fetchJobsSilent()
        return
      }
      const newJob = await res.json()
      setJobs((prev) => {
        prev.push(newJob)
        return prev
      })
      setDraftRows((prev) => prev.filter((d) => d._tempId !== draft._tempId))
      // created silently
    } catch {
      message.error('สร้างงานล้มเหลว')
      await fetchJobsSilent()
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
      dateFormat?: string
    }
  ) => {
    const rowKey = getRowKey(row)
    const isLocked = row.clearStatus
    const rowIsDraft = isDraft(row)
    const needsCreate = rowIsDraft && !(row.jobNumber && row.jobDate) && field !== 'jobNumber' && field !== 'jobDate'
    const fieldDisabled = extraProps?.disabled || needsCreate

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
        dateFormat={extraProps?.dateFormat}
        onSaveStatus={handleSaveStatus}
        onSave={async (value) => {
          // Validate date month matches current page month
          if (field === 'jobDate' && value) {
            const selectedMonth = dayjs(value as string).format('YYYY-MM')
            if (selectedMonth !== month) {
              modal.error({
                title: 'วันที่ไม่ตรงกับเดือนปัจจุบัน',
                content: `กรุณาเลือกวันที่ในเดือน ${dayjs(month).format('MMMM YYYY')}`,
              })
              throw new Error('')
            }
          }

          if (rowIsDraft) {
            updateDraft(rowKey, field, value)

            // Auto-create when jobNumber + jobDate are both filled
            if (field === 'jobNumber' || field === 'jobDate') {
              const draft = draftRows.find((d) => d._tempId === rowKey)
              if (draft) {
                const updated = { ...draft, [field]: value }
                if (updated.jobNumber && updated.jobDate) {
                  return await handleCreateJob(updated)
                }
              }
            }

            // เบิกล่วงหน้า: auto-create when jobDate + jobType + advance are set
            {
              const draft = draftRows.find((d) => d._tempId === rowKey)
              if (draft) {
                const updated = { ...draft, [field]: value }
                if (updated.jobType === 'เบิกล่วงหน้า' && updated.jobDate && updated.advance) {
                  updateDraft(rowKey, 'actualTransfer', updated.advance)
                  await handleCreateAdvanceJob(updated)
                }
              }
            }

            // Sync actual_transfer = advance for เบิกล่วงหน้า (draft)
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
    locType?: 'factory' | 'general',
    row?: RowData,
    field?: string
  ) => (
    <>
      <Divider style={{ margin: '4px 0' }} />
      <div
        style={{ padding: '4px 8px' }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Button
          type="link"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => openQuickAdd(type, locType, row && field ? (item) => {
            const rowKey = getRowKey(row)
            if (isDraft(row)) {
              updateDraft(rowKey, field, item.id)
            } else {
              handleCellSave((row as Job).id, field, item.id)
            }
          } : undefined)}
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
          title: 'วันที่',
          dataIndex: 'jobDate',
          key: 'jobDate',
          width: 60,
          render: (_: unknown, row: RowData) =>
            renderCell(row, 'jobDate', 'date', undefined, { dateFormat: 'DD' }),
        },
        {
          title: 'ลักษณะงาน',
          dataIndex: 'jobType',
          key: 'jobType',
          width: 100,
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
              dropdownRenderExtra: addButton('customer', undefined, row, 'customerId'),
            }),
        },
        {
          title: 'SIZE',
          dataIndex: 'size',
          key: 'size',
          width: 70,
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
              dropdownRenderExtra: addButton('location', 'general', row, 'pickupLocationId'),
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
              dropdownRenderExtra: addButton('location', 'factory', row, 'factoryLocationId'),
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
              dropdownRenderExtra: addButton('location', 'general', row, 'returnLocationId'),
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
      width: isAdmin ? 100 : 60,
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
        ...(isAdmin
          ? [
              {
                title: '',
                key: 'actions',
                width: 40,
                fixed: 'right' as const,
                render: (_: unknown, row: RowData) => {
                  if (row.clearStatus) {
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
                  return (
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        modal.confirm({
                          title: 'ยืนยันการลบ',
                          content: isDraft(row) ? 'ล้างข้อมูล row นี้?' : 'ต้องการลบงานนี้?',
                          okText: 'ลบ',
                          okType: 'danger',
                          cancelText: 'ยกเลิก',
                          onOk: () => handleDeleteJob(row),
                        })
                      }}
                    />
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saveStatus === 'saving' && (
            <span style={{ color: '#1890ff', fontSize: 13 }}>
              <LoadingOutlined style={{ marginRight: 4 }} />
              กำลังบันทึก...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span style={{ color: '#52c41a', fontSize: 13 }}>
              <CheckOutlined style={{ marginRight: 4 }} />
              บันทึกแล้ว
            </span>
          )}
          {saveStatus === 'error' && (
            <span style={{ color: '#ff4d4f', fontSize: 13 }}>
              บันทึกล้มเหลว
            </span>
          )}
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
          {!editMode && (
            <Button
              type={modalEditMode ? 'primary' : 'default'}
              icon={<FormOutlined />}
              onClick={() => {
                if (modalEditMode) {
                  fetchJobs()
                }
                setModalEditMode(!modalEditMode)
              }}
            >
              {modalEditMode ? 'เสร็จสิ้น' : 'เปิดการแก้ไขแบบรายการ'}
            </Button>
          )}
          {!modalEditMode && (
            <Button
              type={editMode ? 'primary' : 'default'}
              icon={<EditOutlined />}
              onClick={() => {
                if (editMode) {
                  setDraftRows((prev) => prev.filter((d) => d.jobNumber))
                  fetchJobs()
                }
                setEditMode(!editMode)
              }}
            >
              {editMode ? 'เสร็จสิ้น' : 'เปิดการแก้ไขแบบตาราง'}
            </Button>
          )}
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
          if (modalEditMode) return 'clickable-row'
          return ''
        }}
        onRow={(row) => {
          if (!modalEditMode) return {}
          const r = row as RowData
          if (isDraft(r) || r.clearStatus) return {}
          return {
            onClick: () => {
              setFormModalJob(r as Job)
              setFormModalMode('edit')
              setFormModalOpen(true)
            },
            style: { cursor: 'pointer' },
          }
        }}
      />

      {/* Add Row Button */}
      {editMode && (
        <div style={{ marginTop: 12 }}>
          <Button icon={<PlusOutlined />} onClick={handleAddRow} type="dashed" block>
            เพิ่ม row
          </Button>
        </div>
      )}
      {modalEditMode && (
        <div style={{ marginTop: 12 }}>
          <Button
            icon={<PlusOutlined />}
            type="dashed"
            block
            onClick={() => {
              setFormModalJob(null)
              setFormModalMode('create')
              setFormModalOpen(true)
            }}
          >
            เพิ่มงานใหม่
          </Button>
        </div>
      )}

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

      {/* Import Modal */}
      <ImportJobModal
        open={importOpen}
        driverId={driverId}
        onClose={() => setImportOpen(false)}
        onSuccess={fetchJobs}
      />

      {/* Job Form Modal */}
      <JobFormModal
        open={formModalOpen}
        mode={formModalMode}
        job={formModalJob}
        driverId={driverId}
        month={month}
        isAdmin={isAdmin}
        customers={customers}
        factoryLocations={factoryLocations}
        generalLocations={generalLocations}
        onClose={() => { setFormModalOpen(false); fetchJobs() }}
        onCreated={(newJob) => {
          setJobs((prev) => {
            prev.push(newJob)
            return prev
          })
        }}
        onFieldSave={handleCellSave}
        onRefreshReferenceData={fetchReferenceData}
      />

      <style jsx global>{`
        .draft-row {
          background-color: #fafafa !important;
        }
        .locked-row td {
          background-color: #f6ffed !important;
        }
        .locked-row:hover td {
          background-color: #d9f7be !important;
        }
        .locked-row td.ant-table-cell-fix-left,
        .locked-row td.ant-table-cell-fix-right {
          background-color: #f6ffed !important;
        }
        .locked-row:hover td.ant-table-cell-fix-left,
        .locked-row:hover td.ant-table-cell-fix-right {
          background-color: #d9f7be !important;
        }
        .ant-table-cell {
          padding: 4px 8px !important;
        }
        .clickable-row:hover td {
          background-color: #e6f4ff !important;
        }
      `}</style>
    </div>
  )
}
