'use client'

import { useState } from 'react'
import { App, Form, Modal } from 'antd'
import { COVERAGE_TYPE_LABELS, type CoverageTypeKey } from '@/lib/renewals/constants'
import type { CoverageDto, InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { sendJson } from './api'
import CoveragePeriodFields from './CoveragePeriodFields'
import { dtoToFormValues, formValuesToBody, type CoverageFormValues } from './coverageForm'

interface Props {
  open: boolean
  vehicleId: string
  /** ประเภทของงวดใหม่ (ตอนแก้ใช้ประเภทของงวดเดิม) */
  type: CoverageTypeKey
  coverage: CoverageDto | null
  insurers: InsurerDto[]
  vehicles: VehicleListItemDto[]
  onClose: () => void
  onSaved: () => void
}

export default function CoverageFormModal({ open, vehicleId, type, coverage, insurers, vehicles, onClose, onSaved }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<CoverageFormValues>()
  const [saving, setSaving] = useState(false)
  const effectiveType = coverage?.type ?? type

  const handleOk = async () => {
    let values: CoverageFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const body = formValuesToBody(values)
    setSaving(true)
    const res = coverage
      ? await sendJson(`/api/renewals/coverages/${coverage.id}`, body, 'PATCH')
      : await sendJson('/api/renewals/coverages', { ...body, vehicleId, type: effectiveType })
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกสำเร็จ')
    onSaved()
  }

  return (
    <Modal
      open={open}
      title={`${coverage ? 'แก้ไข' : 'เพิ่ม'}งวด${COVERAGE_TYPE_LABELS[effectiveType]}`}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {open && (
        <Form
          key={coverage?.id ?? `new-${effectiveType}`}
          form={form}
          layout="vertical"
          initialValues={coverage ? dtoToFormValues(coverage) : {}}
          preserve={false}
          clearOnDestroy
        >
          <CoveragePeriodFields
            type={effectiveType}
            insurers={insurers}
            vehicles={vehicles}
            vehicleId={vehicleId}
            currentInsurerId={coverage?.insurerId}
          />
        </Form>
      )}
    </Modal>
  )
}
