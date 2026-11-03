'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal, Form, Select, InputNumber, Radio, Checkbox, Space, App } from 'antd'
import type { Location } from '@/types/job'
import { SIZE_OPTIONS } from '@/types/job'
import type { FuelStandardKind } from '@/lib/utils/fuelSegments'
import { FUEL_KIND_LABELS } from '@/lib/utils/fuelStandardImport'

export interface FuelStandardRecord {
  id: string
  kind: FuelStandardKind
  size: string
  locationId: string
  pickupLaemChabang: boolean
  returnLaemChabang: boolean
  liters: number | string
  location: { id: string; name: string }
}

export interface FuelStandardFormValues {
  kind?: FuelStandardKind
  size?: string
  locationId?: string
  pickupLaemChabang?: boolean
  returnLaemChabang?: boolean
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

/** ชื่อ key สำหรับแสดงผล เช่น "วิ่ง · 40DC · โรงงาน B · รับแหลมฉบัง" */
export function fuelStandardLabel(
  r: { kind: FuelStandardKind; size: string | null; pickupLaemChabang: boolean; returnLaemChabang: boolean },
  locationName: string | null,
) {
  return [
    FUEL_KIND_LABELS[r.kind],
    r.size ?? '?',
    locationName ?? '?',
    ...(r.pickupLaemChabang ? ['รับแหลมฉบัง'] : []),
    ...(r.returnLaemChabang ? ['คืนแหลมฉบัง'] : []),
  ].join(' · ')
}

const filterByLabel = (input: string, option?: { label?: string }) =>
  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())

export default function FuelStandardFormModal({ open, editing, initialValues, onClose, onSaved }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FuelStandardFormValues>()
  const kind = Form.useWatch('kind', form) ?? 'run'
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
            kind: editing.kind,
            size: editing.size,
            locationId: editing.locationId,
            pickupLaemChabang: editing.pickupLaemChabang,
            returnLaemChabang: editing.returnLaemChabang,
            liters: Number(editing.liters),
          }
        : { kind: 'run', pickupLaemChabang: false, returnLaemChabang: false, ...initialValues },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // งานวิ่งดูโรงงาน, งานทอยดูสถานที่รับตู้ (สถานที่ใดก็ได้)
  const locationOptions = useMemo(
    () =>
      locations
        .filter((l) => kind === 'towing' || l.type === 'factory')
        .map((l) => ({ value: l.id, label: l.name })),
    [locations, kind],
  )
  const sizeOptions = SIZE_OPTIONS.map((s) => ({ value: s, label: s }))

  const handleKindChange = (next: FuelStandardKind) => {
    const locationId = form.getFieldValue('locationId')
    const loc = locations.find((l) => l.id === locationId)
    if (next === 'run' && loc && loc.type !== 'factory') form.setFieldValue('locationId', undefined)
    if (next === 'towing') form.setFieldsValue({ pickupLaemChabang: false, returnLaemChabang: false })
  }

  const handleSubmit = async (values: FuelStandardFormValues) => {
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/rates/fuel-standard/${editing.id}` : '/api/rates/fuel-standard', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          pickupLaemChabang: values.kind === 'run' && !!values.pickupLaemChabang,
          returnLaemChabang: values.kind === 'run' && !!values.returnLaemChabang,
        }),
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

  const locationLabel = kind === 'towing' ? 'สถานที่รับตู้ (ที่ทอย)' : 'โรงงาน'

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
        <Form.Item name="kind" label="ประเภท" rules={[{ required: true, message: 'กรุณาเลือกประเภท' }]}>
          <Radio.Group id="fuel-standard-kind" onChange={(e) => handleKindChange(e.target.value)}>
            <Radio value="run">งานวิ่ง</Radio>
            <Radio value="towing">งานทอย</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="size" label="SIZE" rules={[{ required: true, message: 'กรุณาเลือก SIZE' }]}>
          <Select id="fuel-standard-size" showSearch options={sizeOptions} placeholder="เลือก SIZE" />
        </Form.Item>
        <Form.Item name="locationId" label={locationLabel} rules={[{ required: true, message: `กรุณาเลือก${locationLabel}` }]}>
          <Select id="fuel-standard-location" showSearch options={locationOptions} filterOption={filterByLabel} placeholder={`เลือก${locationLabel}`} />
        </Form.Item>
        {kind === 'run' && (
          <Space size="large" style={{ marginBottom: 24 }}>
            <Form.Item name="pickupLaemChabang" valuePropName="checked" noStyle>
              <Checkbox id="fuel-standard-pickup-laem">รับแหลมฉบัง</Checkbox>
            </Form.Item>
            <Form.Item name="returnLaemChabang" valuePropName="checked" noStyle>
              <Checkbox id="fuel-standard-return-laem">คืนแหลมฉบัง</Checkbox>
            </Form.Item>
          </Space>
        )}
        <Form.Item name="liters" label="ลิตร" rules={[{ required: true, message: 'กรุณากรอกจำนวนลิตร' }]}>
          <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0" data-testid="fuel-standard-liters-input" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
