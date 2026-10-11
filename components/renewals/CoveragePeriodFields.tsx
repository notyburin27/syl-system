'use client'

import { AutoComplete, Col, Form, Input, InputNumber, Row, Select } from 'antd'
import { COVERAGE_CLASSES, COVERAGE_TEXT_MAX, MAX_MONEY, type CoverageTypeKey } from '@/lib/renewals/constants'
import type { InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { DATE_FORMAT } from './coverageForm'
import ThaiDatePicker from './ThaiDatePicker'

interface Props {
  type: CoverageTypeKey
  insurers: InsurerDto[]
  /** ชื่อตัวแทนที่เคยกรอก — ตัวเลือก AutoComplete */
  agents: string[]
  vehicles: VehicleListItemDto[]
  vehicleId: string
  /** บริษัทที่ปิดใช้งานแล้วแต่งวดนี้ใช้อยู่ ยังต้องแสดงในตัวเลือก */
  currentInsurerId?: string | null
}

/** ช่องกรอกงวด — ใช้ร่วมกันระหว่าง "ต่อแล้ว" และ เพิ่ม/แก้งวด; ต้องอยู่ใน <Form> */
export default function CoveragePeriodFields({ type, insurers, agents, vehicles, vehicleId, currentInsurerId }: Props) {
  const isMotor = type === 'MOTOR_INSURANCE'
  const insurerOptions = insurers
    .filter((i) => i.isActive || i.id === currentInsurerId)
    .map((i) => ({ value: i.id, label: i.isActive ? i.name : `${i.name} (ปิดใช้งาน)` }))
  const pairedOptions = vehicles
    .filter((v) => v.id !== vehicleId && v.status !== 'SOLD')
    .map((v) => ({ value: v.id, label: v.fleetNumber ? `${v.plate} (${v.fleetNumber})` : v.plate }))

  return (
    <>
      {type !== 'TAX' && (
        <Form.Item name="insurerId" label="บริษัทประกัน">
          <Select id="coverage-insurer" allowClear showSearch optionFilterProp="label" options={insurerOptions} placeholder="เลือกบริษัทประกัน" />
        </Form.Item>
      )}
      {type !== 'TAX' && (
        <Form.Item name="agentName" label="ตัวแทน">
          <AutoComplete
            id="coverage-agent"
            maxLength={COVERAGE_TEXT_MAX.agentName}
            allowClear
            placeholder="ทำกับตัวแทนไหน"
            options={agents.map((value) => ({ value }))}
            filterOption={(input, option) => String(option?.value ?? '').includes(input)}
          />
        </Form.Item>
      )}
      {isMotor && (
        <Form.Item name="coverageClass" label="ชั้น">
          <Select id="coverage-class" allowClear options={COVERAGE_CLASSES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
      )}
      <Form.Item name="policyNumber" label={type === 'TAX' ? 'เลขที่อ้างอิง' : 'เลขกรมธรรม์'}>
        <Input data-testid="coverage-policy-input" maxLength={COVERAGE_TEXT_MAX.policyNumber} />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="startDate" label="วันเริ่ม">
            <ThaiDatePicker id="coverage-start-date" format={DATE_FORMAT} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="endDate" label="วันสิ้นสุด" rules={[{ required: true, message: 'กรุณาเลือกวันสิ้นสุด' }]}>
            <ThaiDatePicker id="coverage-end-date" format={DATE_FORMAT} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="amount" label={type === 'TAX' ? 'ค่าภาษี (บาท)' : 'เบี้ย (บาท)'}>
            <InputNumber id="coverage-amount" min={0} max={MAX_MONEY} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="serviceFee" label="ค่าบริการ (บาท)">
            <InputNumber id="coverage-service-fee" min={0} max={MAX_MONEY} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      {isMotor && (
        <Form.Item name="pairedVehicleId" label="หางคู่">
          <Select id="coverage-paired" allowClear showSearch optionFilterProp="label" options={pairedOptions} />
        </Form.Item>
      )}
      <Form.Item name="renewalNote" label="หมายเหตุ">
        <Input.TextArea data-testid="coverage-note-input" rows={2} maxLength={COVERAGE_TEXT_MAX.renewalNote} />
      </Form.Item>
    </>
  )
}
