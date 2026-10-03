'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal, Form, Select, InputNumber, App } from 'antd'
import type { Location } from '@/types/job'
import { SIZE_OPTIONS } from '@/types/job'

export interface FuelStandardRecord {
  id: string
  size: string
  pickupLocationId: string
  factoryLocationId: string | null
  returnLocationId: string
  liters: number | string
  pickupLocation: { id: string; name: string }
  factoryLocation: { id: string; name: string } | null
  returnLocation: { id: string; name: string }
}

export interface FuelStandardFormValues {
  size?: string
  pickupLocationId?: string
  factoryLocationId?: string | null
  returnLocationId?: string
  liters?: number
}

interface Props {
  open: boolean
  /** null = เพิ่มใหม่ */
  editing: FuelStandardRecord | null
  /** ค่าตั้งต้นตอนเพิ่มใหม่ — ใช้กับ quick-add จากหน้าสรุป */
  initialValues?: FuelStandardFormValues
  onClose: () => void
  onSaved: () => void
}

const filterByLabel = (input: string, option?: { label?: string }) =>
  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())

export default function FuelStandardFormModal({ open, editing, initialValues, onClose, onSaved }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FuelStandardFormValues>()
  const [locations, setLocations] = useState<Location[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/locations')
      .then((res) => (res.ok ? res.json() : []))
      .then(setLocations)
      .catch(() => setLocations([]))
  }, [open])

  // ตั้งค่าฟอร์มเฉพาะตอนเปิด — ถ้าผูกกับ initialValues ตรงๆ object ใหม่ทุก render จะล้างค่าที่กำลังพิมพ์
  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue(
      editing
        ? {
            size: editing.size,
            pickupLocationId: editing.pickupLocationId,
            factoryLocationId: editing.factoryLocationId,
            returnLocationId: editing.returnLocationId,
            liters: Number(editing.liters),
          }
        : initialValues ?? {},
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const locationOptions = useMemo(() => locations.map((l) => ({ value: l.id, label: l.name })), [locations])
  const factoryOptions = useMemo(
    () => locations.filter((l) => l.type === 'factory').map((l) => ({ value: l.id, label: l.name })),
    [locations],
  )
  const sizeOptions = SIZE_OPTIONS.map((s) => ({ value: s, label: s }))

  const handleSubmit = async (values: FuelStandardFormValues) => {
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/rates/fuel-standard/${editing.id}` : '/api/rates/fuel-standard', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, factoryLocationId: values.factoryLocationId ?? null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        message.error(err.error || 'เกิดข้อผิดพลาด')
        return
      }
      message.success(editing ? 'แก้ไขสำเร็จ' : 'เพิ่มสำเร็จ')
      onSaved()
      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'แก้ไขน้ำมันมาตรฐาน' : 'เพิ่มน้ำมันมาตรฐาน'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      okText={editing ? 'บันทึก' : 'เพิ่ม'}
      cancelText="ยกเลิก"
      okButtonProps={{ 'data-testid': 'fuel-standard-submit-btn' } as Record<string, string>}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="size" label="SIZE" rules={[{ required: true, message: 'กรุณาเลือก SIZE' }]}>
          <Select id="fuel-standard-size" showSearch options={sizeOptions} placeholder="เลือก SIZE" />
        </Form.Item>
        <Form.Item name="pickupLocationId" label="สถานที่รับตู้" rules={[{ required: true, message: 'กรุณาเลือกสถานที่รับตู้' }]}>
          <Select id="fuel-standard-pickup" showSearch options={locationOptions} filterOption={filterByLabel} placeholder="เลือกสถานที่รับตู้" />
        </Form.Item>
        <Form.Item name="factoryLocationId" label="โรงงาน" extra="ปล่อยว่างได้ สำหรับงานทอยที่ไม่มีโรงงาน">
          <Select id="fuel-standard-factory" showSearch allowClear options={factoryOptions} filterOption={filterByLabel} placeholder="ไม่ระบุโรงงาน" />
        </Form.Item>
        <Form.Item name="returnLocationId" label="สถานที่คืนตู้" rules={[{ required: true, message: 'กรุณาเลือกสถานที่คืนตู้' }]}>
          <Select id="fuel-standard-return" showSearch options={locationOptions} filterOption={filterByLabel} placeholder="เลือกสถานที่คืนตู้" />
        </Form.Item>
        <Form.Item name="liters" label="ลิตร" rules={[{ required: true, message: 'กรุณากรอกจำนวนลิตร' }]}>
          <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0" data-testid="fuel-standard-liters-input" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
