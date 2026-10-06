'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { App, Form, Modal } from 'antd'
import { COVERAGE_TYPE_LABELS } from '@/lib/renewals/constants'
import { nextPeriodDefaults } from '@/lib/renewals/renewalDefaults'
import type { CoverageDto, InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { sendJson } from './api'
import CoveragePeriodFields from './CoveragePeriodFields'
import { dtoToFormValues, formValuesToBody, type CoverageFormValues } from './coverageForm'

interface Props {
  item: CoverageDto | null
  insurers: InsurerDto[]
  vehicles: VehicleListItemDto[]
  onClose: () => void
  onDone: () => void
}

/** ต่อแล้ว (ทีละคัน) — ค่าเริ่มต้นมาจากงวดเดิม: วันเริ่ม = วันหมดเดิม + 1 วัน, วันหมด = +1 ปี */
export default function RenewModal({ item, insurers, vehicles, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<CoverageFormValues>()
  const [saving, setSaving] = useState(false)

  const initialValues = useMemo<CoverageFormValues | undefined>(() => {
    if (!item) return undefined
    const next = nextPeriodDefaults(item.endDate)
    return {
      ...dtoToFormValues(item),
      policyNumber: null,
      renewalNote: null,
      startDate: dayjs(next.startDate),
      endDate: dayjs(next.endDate),
    }
  }, [item])

  const handleOk = async () => {
    if (!item) return
    let values: CoverageFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    const res = await sendJson<{ id: string }>(`/api/renewals/coverages/${item.id}/renew`, formValuesToBody(values))
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกการต่ออายุสำเร็จ')
    onDone()
  }

  return (
    <Modal
      open={item !== null}
      title={item ? `ต่ออายุ${COVERAGE_TYPE_LABELS[item.type]} — ${item.vehicle.plate}` : ''}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {item && (
        <Form key={item.id} form={form} layout="vertical" initialValues={initialValues}>
          <CoveragePeriodFields
            type={item.type}
            insurers={insurers}
            vehicles={vehicles}
            vehicleId={item.vehicleId}
            currentInsurerId={item.insurerId}
          />
        </Form>
      )}
    </Modal>
  )
}
