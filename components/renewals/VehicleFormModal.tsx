'use client'

import { useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { App, AutoComplete, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd'
import { VEHICLE_STATUSES, VEHICLE_STATUS_LABELS, VEHICLE_TEXT_MAX, type VehicleStatusKey } from '@/lib/renewals/constants'
import { THAI_PROVINCES } from '@/lib/renewals/provinces'
import type { VehicleDto } from '@/types/renewals'
import { sendJson } from './api'
import { DATE_FORMAT } from './coverageForm'
import PendingFilesUpload from './PendingFilesUpload'
import ThaiDatePicker from './ThaiDatePicker'
import { uploadAttachments } from './uploadAttachments'

interface Props {
  vehicle: VehicleDto | 'new' | null
  ownerOptions: string[]
  typeOptions: string[]
  onClose: () => void
  onSaved: (vehicle: VehicleDto) => void
}

interface Values {
  registrationDate?: Dayjs | null
  plate: string
  plateProvince?: string
  fleetNumber?: string
  ownerName: string
  vehicleType: string
  brand?: string
  modelName?: string
  color?: string
  chassisNumber?: string
  chassisPosition?: string
  engineNumber?: string
  engineCylinders?: number | null
  engineHorsepower?: number | null
  axleCount?: number | null
  fuelType?: string
  weightKg?: number | null
  status: VehicleStatusKey
  statusDate?: Dayjs | null
  note?: string
}

const orUndefined = (v: string | null) => v ?? undefined
const autoOptions = (values: string[]) => values.map((value) => ({ value }))
const containsFilter = (input: string, option?: { value?: unknown }) => String(option?.value ?? '').includes(input)
const provinceOptions = THAI_PROVINCES.map((p) => ({ value: p, label: p }))
const toYmd = (d?: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null)

export default function VehicleFormModal({ vehicle, ownerOptions, typeOptions, onClose, onSaved }: Props) {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  /** เอกสารสำเนารถที่เลือกไว้ — อัปโหลดหลังบันทึกรถสำเร็จ */
  const [files, setFiles] = useState<File[]>([])
  const isNew = vehicle === 'new'

  const initialValues = useMemo<Partial<Values>>(() => {
    if (vehicle === null || vehicle === 'new') return { status: 'ACTIVE' }
    return {
      registrationDate: vehicle.registrationDate ? dayjs(vehicle.registrationDate) : null,
      plate: vehicle.plate,
      plateProvince: orUndefined(vehicle.plateProvince),
      fleetNumber: orUndefined(vehicle.fleetNumber),
      ownerName: vehicle.ownerName,
      vehicleType: vehicle.vehicleType,
      brand: orUndefined(vehicle.brand),
      modelName: orUndefined(vehicle.modelName),
      color: orUndefined(vehicle.color),
      chassisNumber: orUndefined(vehicle.chassisNumber),
      chassisPosition: orUndefined(vehicle.chassisPosition),
      engineNumber: orUndefined(vehicle.engineNumber),
      engineCylinders: vehicle.engineCylinders,
      engineHorsepower: vehicle.engineHorsepower,
      axleCount: vehicle.axleCount,
      fuelType: orUndefined(vehicle.fuelType),
      weightKg: vehicle.weightKg,
      status: vehicle.status,
      statusDate: vehicle.statusDate ? dayjs(vehicle.statusDate) : null,
      note: orUndefined(vehicle.note),
    }
  }, [vehicle])

  const close = () => {
    setFiles([])
    onClose()
  }

  const save = async (values: Values) => {
    const body = {
      ...values,
      plateProvince: values.plateProvince ?? null,
      engineCylinders: values.engineCylinders ?? null,
      engineHorsepower: values.engineHorsepower ?? null,
      axleCount: values.axleCount ?? null,
      weightKg: values.weightKg ?? null,
      registrationDate: toYmd(values.registrationDate),
      statusDate: toYmd(values.statusDate),
    }
    setSaving(true)
    const res =
      vehicle === 'new' || vehicle === null
        ? await sendJson<VehicleDto>('/api/renewals/vehicles', body)
        : await sendJson<VehicleDto>(`/api/renewals/vehicles/${vehicle.id}`, body, 'PATCH')
    if (!res.ok) {
      setSaving(false)
      message.error(res.error)
      return
    }
    if (files.length > 0) {
      const uploaded = await uploadAttachments(`/api/renewals/vehicles/${res.data.id}/attachments`, files)
      if (!uploaded.ok) message.warning(`บันทึกรถสำเร็จ แต่แนบเอกสารไม่สำเร็จ (แนบใหม่ที่หน้ารถ): ${uploaded.error}`)
    }
    setSaving(false)
    setFiles([])
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
      onCancel={close}
      width={720}
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
              <Form.Item name="registrationDate" label="วันที่จดทะเบียน">
                <ThaiDatePicker id="vehicle-registration-date" format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fleetNumber" label="เบอร์รถ">
                <Input data-testid="vehicle-fleet-input" maxLength={VEHICLE_TEXT_MAX.fleetNumber} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="plate" label="ทะเบียนรถ" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกทะเบียน' }]}>
                <Input data-testid="vehicle-plate-input" maxLength={VEHICLE_TEXT_MAX.plate} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="plateProvince" label="จังหวัด (ทะเบียนรถ)">
                <Select id="vehicle-plate-province" options={provinceOptions} showSearch allowClear placeholder="เลือกจังหวัด" />
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
              <Form.Item name="vehicleType" label="ลักษณะรถ" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกลักษณะรถ' }]}>
                <AutoComplete id="vehicle-type" options={autoOptions(typeOptions)} filterOption={containsFilter} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="brand" label="ยี่ห้อรถ">
                <Input maxLength={VEHICLE_TEXT_MAX.brand} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="modelName" label="แบบ/รุ่น">
                <Input data-testid="vehicle-model-input" maxLength={VEHICLE_TEXT_MAX.modelName} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="color" label="สีรถ">
                <Input data-testid="vehicle-color-input" maxLength={VEHICLE_TEXT_MAX.color} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="chassisNumber" label="เลขตัวรถ (คัสซี)">
                <Input data-testid="vehicle-chassis-input" maxLength={VEHICLE_TEXT_MAX.chassisNumber} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="chassisPosition" label="ตำแหน่งคัสซี">
                <Input data-testid="vehicle-chassis-position-input" maxLength={VEHICLE_TEXT_MAX.chassisPosition} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="engineNumber" label="เลขเครื่องยนต์">
            <Input data-testid="vehicle-engine-number-input" maxLength={VEHICLE_TEXT_MAX.engineNumber} />
          </Form.Item>
          <Form.Item label="ขนาดเครื่องยนต์" style={{ marginBottom: 0 }}>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="engineCylinders">
                  <InputNumber id="vehicle-engine-cylinders" min={0} max={100} precision={0} addonAfter="สูบ" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="engineHorsepower">
                  <InputNumber id="vehicle-engine-horsepower" min={0} max={10000} precision={0} addonAfter="แรงม้า" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="axleCount">
                  <InputNumber id="vehicle-axle-count" min={0} max={20} precision={0} addonAfter="เพลา" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="weightKg" label="น้ำหนักตัวรถ (กก.)">
                <InputNumber id="vehicle-weight" min={0} max={100000} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fuelType" label="เชื้อเพลิง">
                <Input maxLength={VEHICLE_TEXT_MAX.fuelType} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="status" label="สถานะ">
                <Select id="vehicle-status" options={VEHICLE_STATUSES.map((s) => ({ value: s, label: VEHICLE_STATUS_LABELS[s] }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="statusDate" label="วันที่แจ้งสถานะ (แจ้ง ม.79 / ม.89)">
                <ThaiDatePicker id="vehicle-status-date" format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="หมายเหตุ">
            <Input.TextArea rows={2} maxLength={VEHICLE_TEXT_MAX.note} />
          </Form.Item>
          <Form.Item
            label="เอกสารสำเนารถ"
            extra={isNew ? 'PDF/JPG/PNG ไม่เกิน 10 MB' : 'PDF/JPG/PNG ไม่เกิน 10 MB — ไฟล์ที่แนบไว้แล้ว ดู/ลบได้ที่หน้ารายละเอียดรถ'}
          >
            <PendingFilesUpload files={files} onChange={setFiles} buttonTestId="vehicle-doc-attach-btn" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
