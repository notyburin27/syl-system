'use client'

import { useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { App, AutoComplete, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd'
import { VEHICLE_STATUSES, VEHICLE_STATUS_LABELS, type VehicleStatusKey } from '@/lib/renewals/constants'
import type { VehicleDto } from '@/types/renewals'
import { sendJson } from './api'
import { DATE_FORMAT } from './coverageForm'

interface Props {
  vehicle: VehicleDto | 'new' | null
  ownerOptions: string[]
  typeOptions: string[]
  onClose: () => void
  onSaved: (vehicle: VehicleDto) => void
}

interface Values {
  plate: string
  fleetNumber?: string
  ownerName: string
  vehicleType: string
  brand?: string
  chassisNumber?: string
  fuelType?: string
  weightKg?: number | null
  status: VehicleStatusKey
  statusDate?: Dayjs | null
  note?: string
}

const orUndefined = (v: string | null) => v ?? undefined
const autoOptions = (values: string[]) => values.map((value) => ({ value }))
const containsFilter = (input: string, option?: { value?: unknown }) => String(option?.value ?? '').includes(input)

export default function VehicleFormModal({ vehicle, ownerOptions, typeOptions, onClose, onSaved }: Props) {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const isNew = vehicle === 'new'

  const initialValues = useMemo<Partial<Values>>(() => {
    if (vehicle === null || vehicle === 'new') return { status: 'ACTIVE' }
    return {
      plate: vehicle.plate,
      fleetNumber: orUndefined(vehicle.fleetNumber),
      ownerName: vehicle.ownerName,
      vehicleType: vehicle.vehicleType,
      brand: orUndefined(vehicle.brand),
      chassisNumber: orUndefined(vehicle.chassisNumber),
      fuelType: orUndefined(vehicle.fuelType),
      weightKg: vehicle.weightKg,
      status: vehicle.status,
      statusDate: vehicle.statusDate ? dayjs(vehicle.statusDate) : null,
      note: orUndefined(vehicle.note),
    }
  }, [vehicle])

  const save = async (values: Values) => {
    const body = {
      ...values,
      weightKg: values.weightKg ?? null,
      statusDate: values.statusDate ? values.statusDate.format('YYYY-MM-DD') : null,
    }
    setSaving(true)
    const res =
      vehicle === 'new' || vehicle === null
        ? await sendJson<VehicleDto>('/api/renewals/vehicles', body)
        : await sendJson<VehicleDto>(`/api/renewals/vehicles/${vehicle.id}`, body, 'PATCH')
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกสำเร็จ')
    onSaved(res.data)
  }

  const handleOk = async () => {
    let values: Values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const becomesSold = vehicle !== null && vehicle !== 'new' && values.status === 'SOLD' && vehicle.status !== 'SOLD'
    if (!becomesSold) {
      await save(values)
      return
    }
    modal.confirm({
      title: 'เปลี่ยนสถานะเป็น "ขาย"',
      content: 'งวดที่ยังเปิดอยู่ของรถคันนี้จะถูกปิดเป็น "ไม่ต่อ (ขายรถ)"',
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: () => save(values),
    })
  }

  return (
    <Modal
      open={vehicle !== null}
      title={isNew ? 'เพิ่มรถ' : 'แก้ไขรถ'}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      width={640}
      destroyOnHidden
    >
      {vehicle !== null && (
        <Form
          key={isNew ? 'new' : (vehicle as VehicleDto).id}
          form={form}
          layout="vertical"
          initialValues={initialValues}
          preserve={false}
          clearOnDestroy
        >
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="plate" label="ทะเบียน" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกทะเบียน' }]}>
                <Input data-testid="vehicle-plate-input" maxLength={30} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fleetNumber" label="เบอร์รถ">
                <Input data-testid="vehicle-fleet-input" maxLength={50} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ownerName" label="บริษัท" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกบริษัท' }]}>
                <AutoComplete id="vehicle-owner" options={autoOptions(ownerOptions)} filterOption={containsFilter} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="vehicleType" label="ลักษณะ" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกลักษณะรถ' }]}>
                <AutoComplete id="vehicle-type" options={autoOptions(typeOptions)} filterOption={containsFilter} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="brand" label="ยี่ห้อ">
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fuelType" label="เชื้อเพลิง">
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="weightKg" label="น้ำหนัก (กก.)">
                <InputNumber id="vehicle-weight" min={0} max={100000} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="chassisNumber" label="เลขตัวถัง">
            <Input maxLength={100} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="status" label="สถานะ">
                <Select id="vehicle-status" options={VEHICLE_STATUSES.map((s) => ({ value: s, label: VEHICLE_STATUS_LABELS[s] }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="statusDate" label="วันที่สถานะ (แจ้ง ม.79 / ม.89)">
                <DatePicker id="vehicle-status-date" format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="หมายเหตุ">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
