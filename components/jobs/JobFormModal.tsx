'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Modal, Form, Input, Select, DatePicker, Divider, Button, App, Row, Col } from 'antd'
import { PlusOutlined, LoadingOutlined, CheckOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Job, Customer, Location } from '@/types/job'
import { JOB_TYPES, SIZE_OPTIONS } from '@/types/job'
import QuickAddModal from './QuickAddModal'

interface JobFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  job: Job | null // null for create
  driverId: string
  month: string // YYYY-MM
  isAdmin: boolean
  customers: Customer[]
  factoryLocations: Location[]
  generalLocations: Location[]
  onClose: () => void
  onCreated: (job: Job) => void
  onFieldSave: (jobId: string, field: string, value: unknown) => Promise<boolean>
  onRefreshReferenceData: () => void
}

export default function JobFormModal({
  open,
  mode,
  job,
  driverId,
  month,
  isAdmin,
  customers,
  factoryLocations,
  generalLocations,
  onClose,
  onCreated,
  onFieldSave,
  onRefreshReferenceData,
}: JobFormModalProps) {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [createdJob, setCreatedJob] = useState<Job | null>(null)

  // Quick add modal
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddType, setQuickAddType] = useState<'customer' | 'location'>('customer')
  const [quickAddLocationType, setQuickAddLocationType] = useState<'factory' | 'general' | undefined>()
  const [quickAddField, setQuickAddField] = useState<string | null>(null)

  // Track which job we're editing (could be the passed job or a newly created one)
  const activeJob = createdJob || job

  const isAdvance = Form.useWatch('jobType', form) === 'เบิกล่วงหน้า'

  useEffect(() => {
    if (open) {
      setCreatedJob(null)
      setSaveStatus('idle')
      if (mode === 'edit' && job) {
        form.setFieldsValue({
          jobNumber: job.jobNumber,
          jobDate: job.jobDate ? dayjs(job.jobDate) : null,
          jobType: job.jobType || undefined,
          customerId: job.customerId || undefined,
          size: job.size || undefined,
          pickupLocationId: job.pickupLocationId || undefined,
          factoryLocationId: job.factoryLocationId || undefined,
          returnLocationId: job.returnLocationId || undefined,
          estimatedTransfer: job.estimatedTransfer,
          income: job.income,
          driverWage: job.driverWage,
          actualTransfer: job.actualTransfer,
          advance: job.advance,
          toll: job.toll,
          pickupFee: job.pickupFee,
          returnFee: job.returnFee,
          liftFee: job.liftFee,
          storageFee: job.storageFee,
          tire: job.tire,
          other: job.other,
          mileage: job.mileage,
          fuelOfficeLiters: job.fuelOfficeLiters,
          fuelCashLiters: job.fuelCashLiters,
          fuelCashAmount: job.fuelCashAmount,
          fuelCreditLiters: job.fuelCreditLiters,
          fuelCreditAmount: job.fuelCreditAmount,
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, mode, job, form])

  const handleSaveStatus = useCallback((status: 'saving' | 'saved' | 'error') => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus(status)
    if (status === 'saved') {
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [])

  const parseNumber = (val: unknown) => {
    const str = String(val ?? '').trim()
    if (str === '') return null
    const num = Number(str)
    return isNaN(num) ? null : num
  }

  // Handle field blur for existing jobs (auto-save)
  const handleFieldBlur = async (field: string) => {
    const targetJob = activeJob
    if (!targetJob) return

    const rawValue = form.getFieldValue(field)
    let value: unknown = rawValue

    // Parse based on field type
    const numberFields = [
      'estimatedTransfer', 'income', 'driverWage', 'actualTransfer',
      'advance', 'toll', 'pickupFee', 'returnFee', 'liftFee',
      'storageFee', 'tire', 'other', 'mileage',
      'fuelOfficeLiters', 'fuelCashLiters', 'fuelCashAmount',
      'fuelCreditLiters', 'fuelCreditAmount',
    ]

    if (numberFields.includes(field)) {
      value = parseNumber(rawValue)
    } else if (field === 'jobDate') {
      if (rawValue) {
        const selectedMonth = rawValue.format('YYYY-MM')
        if (selectedMonth !== month) {
          modal.error({
            title: 'วันที่ไม่ตรงกับเดือนปัจจุบัน',
            content: `กรุณาเลือกวันที่ในเดือน ${dayjs(month).format('MMMM YYYY')}`,
          })
          form.setFieldValue('jobDate', targetJob.jobDate ? dayjs(targetJob.jobDate) : null)
          return
        }
        value = rawValue.format('YYYY-MM-DD')
      } else {
        value = null
      }
    } else if (field === 'customerId' || field === 'size' || field === 'pickupLocationId' || field === 'factoryLocationId' || field === 'returnLocationId' || field === 'jobType') {
      value = rawValue ?? null
    }

    // Check if value actually changed
    const oldValue = (targetJob as unknown as Record<string, unknown>)[field]
    const normalizedOld = field === 'jobDate' && oldValue ? dayjs(oldValue as string).format('YYYY-MM-DD') : oldValue
    if (value === normalizedOld) return

    handleSaveStatus('saving')
    const success = await onFieldSave(targetJob.id, field, value)
    if (success) {
      handleSaveStatus('saved')
      // Sync advance → actualTransfer for เบิกล่วงหน้า
      if (field === 'advance' && form.getFieldValue('jobType') === 'เบิกล่วงหน้า') {
        form.setFieldValue('actualTransfer', value)
        await onFieldSave(targetJob.id, 'actualTransfer', value)
      }
    } else {
      handleSaveStatus('error')
    }
  }

  // Create job (POST) — only needs jobNumber + jobDate
  const handleCreate = async () => {
    const jobNumber = form.getFieldValue('jobNumber')
    const jobDate = form.getFieldValue('jobDate')

    if (!jobNumber || !jobDate) {
      message.error('กรุณากรอก JOB/เลขที่ และ วันที่')
      return
    }

    const selectedMonth = jobDate.format('YYYY-MM')
    if (selectedMonth !== month) {
      modal.error({
        title: 'วันที่ไม่ตรงกับเดือนปัจจุบัน',
        content: `กรุณาเลือกวันที่ในเดือน ${dayjs(month).format('MMMM YYYY')}`,
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobNumber,
          jobDate: jobDate.format('YYYY-MM-DD'),
          driverId,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        message.error(err.error || 'สร้างงานล้มเหลว')
        return
      }
      const newJob: Job = await res.json()
      setCreatedJob(newJob)
      onCreated(newJob)
    } catch {
      message.error('สร้างงานล้มเหลว')
    } finally {
      setSaving(false)
    }
  }

  // For create mode: blur on jobNumber or jobDate triggers create if both filled
  const handleCreateFieldBlur = async (field: string) => {
    if (activeJob) {
      // Already created, save normally
      await handleFieldBlur(field)
      return
    }

    const jobNumber = form.getFieldValue('jobNumber')
    const jobDate = form.getFieldValue('jobDate')

    if (field === 'jobNumber' || field === 'jobDate') {
      if (jobNumber && jobDate) {
        await handleCreate()
      }
    }
  }

  const openQuickAdd = (type: 'customer' | 'location', locType?: 'factory' | 'general', field?: string) => {
    setQuickAddType(type)
    setQuickAddLocationType(locType)
    setQuickAddField(field || null)
    setQuickAddOpen(true)
  }

  const addButton = (type: 'customer' | 'location', locType?: 'factory' | 'general', field?: string) => (
    <>
      <Divider style={{ margin: '4px 0' }} />
      <div style={{ padding: '4px 8px' }} onMouseDown={(e) => e.preventDefault()}>
        <Button
          type="link"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => openQuickAdd(type, locType, field)}
        >
          เพิ่มใหม่
        </Button>
      </div>
    </>
  )

  const isCreated = !!activeJob
  const fieldsDisabled = mode === 'create' && !isCreated

  const numberInput = (field: string, disabled?: boolean) => (
    <Input
      disabled={fieldsDisabled || disabled}
      onBlur={() => isCreated && handleFieldBlur(field)}
    />
  )

  const selectDropdown = (field: string, options: { value: string; label: string }[], extra?: React.ReactNode, disabled?: boolean) => (
    <Select
      showSearch
      allowClear
      disabled={fieldsDisabled || disabled}
      popupMatchSelectWidth={false}
      dropdownStyle={{ minWidth: 200 }}
      filterOption={(input, option) =>
        (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
      }
      options={options}
      onChange={() => isCreated && setTimeout(() => handleFieldBlur(field), 0)}
      dropdownRender={extra ? (menu) => (
        <>
          {menu}
          {extra}
        </>
      ) : undefined}
    />
  )

  return (
    <>
      <Modal
        title={mode === 'create' ? 'เพิ่มงานใหม่' : `แก้ไขงาน ${job?.jobNumber || ''}`}
        open={open}
        onCancel={onClose}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
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
                <span style={{ color: '#ff4d4f', fontSize: 13 }}>บันทึกล้มเหลว</span>
              )}
            </div>
            <Button onClick={onClose}>ปิด</Button>
          </div>
        }
        width={800}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          {/* ข้อมูลงาน */}
          <Divider orientation="left" style={{ marginTop: 0 }}>ข้อมูลงาน</Divider>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="JOB/เลขที่" name="jobNumber">
                <Input
                  disabled={mode === 'edit'}
                  onBlur={() => handleCreateFieldBlur('jobNumber')}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="วันที่" name="jobDate">
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: '100%' }}
                  disabled={mode === 'edit' && !isCreated}
                  onChange={() => {
                    if (mode === 'create' && !isCreated) {
                      setTimeout(() => handleCreateFieldBlur('jobDate'), 0)
                    } else if (isCreated) {
                      setTimeout(() => handleFieldBlur('jobDate'), 0)
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="ลักษณะงาน" name="jobType">
                {selectDropdown('jobType', JOB_TYPES.map((t) => ({ value: t, label: t })))}
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="ลูกค้า" name="customerId">
                {selectDropdown(
                  'customerId',
                  customers.map((c) => ({ value: c.id, label: c.name })),
                  addButton('customer', undefined, 'customerId')
                )}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="SIZE" name="size">
                {selectDropdown('size', SIZE_OPTIONS.map((s) => ({ value: s, label: s })), undefined, isAdvance)}
              </Form.Item>
            </Col>
          </Row>

          {/* สถานที่ */}
          <Divider orientation="left">สถานที่</Divider>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="สถานที่รับตู้" name="pickupLocationId">
                {selectDropdown(
                  'pickupLocationId',
                  generalLocations.map((l) => ({ value: l.id, label: l.name })),
                  addButton('location', 'general', 'pickupLocationId'),
                  isAdvance
                )}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="โรงงาน" name="factoryLocationId">
                {selectDropdown(
                  'factoryLocationId',
                  factoryLocations.map((l) => ({ value: l.id, label: l.name })),
                  addButton('location', 'factory', 'factoryLocationId'),
                  isAdvance
                )}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="สถานที่คืนตู้" name="returnLocationId">
                {selectDropdown(
                  'returnLocationId',
                  generalLocations.map((l) => ({ value: l.id, label: l.name })),
                  addButton('location', 'general', 'returnLocationId'),
                  isAdvance
                )}
              </Form.Item>
            </Col>
          </Row>

          {/* การเงินหลัก */}
          <Divider orientation="left">การเงินหลัก</Divider>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item label="คาดการณ์โอน" name="estimatedTransfer">
                {numberInput('estimatedTransfer', isAdvance)}
              </Form.Item>
            </Col>
            {isAdmin && (
              <>
                <Col span={6}>
                  <Form.Item label="รายได้" name="income">
                    {numberInput('income', isAdvance)}
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="ค่าเที่ยวคนขับ" name="driverWage">
                    {numberInput('driverWage', isAdvance)}
                  </Form.Item>
                </Col>
              </>
            )}
            <Col span={6}>
              <Form.Item label="ยอดโอนจริง" name="actualTransfer">
                {numberInput('actualTransfer', isAdvance)}
              </Form.Item>
            </Col>
          </Row>

          {/* ค่าใช้จ่ายคนขับ */}
          <Divider orientation="left">ค่าใช้จ่ายคนขับ</Divider>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item label="เบิกล่วงหน้า" name="advance">
                {numberInput('advance')}
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="ค่าทางด่วน" name="toll">
                {numberInput('toll', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="ค่ารับตู้" name="pickupFee">
                {numberInput('pickupFee', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="ค่าคืนตู้" name="returnFee">
                {numberInput('returnFee', isAdvance)}
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item label="ค่ายกตู้" name="liftFee">
                {numberInput('liftFee', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="ค่าฝากตู้" name="storageFee">
                {numberInput('storageFee', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="ค่ายาง" name="tire">
                {numberInput('tire', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="อื่นๆ" name="other">
                {numberInput('other', isAdvance)}
              </Form.Item>
            </Col>
          </Row>

          {/* น้ำมัน/ไมล์ */}
          <Divider orientation="left">น้ำมัน/ไมล์</Divider>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="ไมล์รถ" name="mileage">
                {numberInput('mileage', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="น้ำมัน OFF (ลิตร)" name="fuelOfficeLiters">
                {numberInput('fuelOfficeLiters', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="น้ำมันสด (ลิตร)" name="fuelCashLiters">
                {numberInput('fuelCashLiters', isAdvance)}
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="น้ำมันสด (฿)" name="fuelCashAmount">
                {numberInput('fuelCashAmount', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="น้ำมันเครดิต (ลิตร)" name="fuelCreditLiters">
                {numberInput('fuelCreditLiters', isAdvance)}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="น้ำมันเครดิต (฿)" name="fuelCreditAmount">
                {numberInput('fuelCreditAmount', isAdvance)}
              </Form.Item>
            </Col>
          </Row>

          {mode === 'create' && !isCreated && (
            <div style={{ textAlign: 'center', padding: '8px 0', color: '#999' }}>
              กรอก JOB/เลขที่ และ วันที่ เพื่อสร้างงาน — ช่องอื่นจะเปิดให้แก้ไขหลังสร้างแล้ว
            </div>
          )}
        </Form>
      </Modal>

      <QuickAddModal
        open={quickAddOpen}
        type={quickAddType}
        locationType={quickAddLocationType}
        onClose={() => setQuickAddOpen(false)}
        onSuccess={(item) => {
          onRefreshReferenceData()
          if (quickAddField) {
            form.setFieldValue(quickAddField, item.id)
            if (isCreated) {
              setTimeout(() => handleFieldBlur(quickAddField), 0)
            }
          }
        }}
      />
    </>
  )
}
