'use client'

import { useState } from 'react'
import { App, Form, Modal } from 'antd'
import { COVERAGE_TYPE_LABELS, type CoverageTypeKey } from '@/lib/renewals/constants'
import type { CoverageDto, InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { sendJson } from './api'
import CoveragePeriodFields from './CoveragePeriodFields'
import { dtoToFormValues, formValuesToBody, type CoverageFormValues } from './coverageForm'
import PendingFilesUpload from './PendingFilesUpload'
import { uploadAttachments } from './uploadAttachments'

interface Props {
  open: boolean
  vehicleId: string
  /** ประเภทของงวดใหม่ (ตอนแก้ใช้ประเภทของงวดเดิม) */
  type: CoverageTypeKey
  coverage: CoverageDto | null
  insurers: InsurerDto[]
  agents: string[]
  vehicles: VehicleListItemDto[]
  onClose: () => void
  onSaved: () => void
}

export default function CoverageFormModal({ open, vehicleId, type, coverage, insurers, agents, vehicles, onClose, onSaved }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<CoverageFormValues>()
  const [saving, setSaving] = useState(false)
  /** ไฟล์กรมธรรม์ที่เลือกไว้ — อัปโหลดหลังบันทึกงวดสำเร็จ */
  const [files, setFiles] = useState<File[]>([])
  const effectiveType = coverage?.type ?? type
  // ภาษีแนบป้ายภาษีได้ที่ปุ่มไฟล์แนบในตาราง — ฟอร์มนี้แนบเฉพาะกรมธรรม์
  const canAttach = effectiveType !== 'TAX'

  const close = () => {
    setFiles([])
    onClose()
  }

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
      : await sendJson<{ id: string }>('/api/renewals/coverages', { ...body, vehicleId, type: effectiveType })
    if (!res.ok) {
      setSaving(false)
      message.error(res.error)
      return
    }
    const coverageId = coverage?.id ?? (res.data as { id: string }).id
    if (canAttach && files.length > 0) {
      const uploaded = await uploadAttachments(`/api/renewals/coverages/${coverageId}/attachments`, files)
      if (!uploaded.ok) message.warning(`บันทึกงวดสำเร็จ แต่แนบไฟล์ไม่สำเร็จ (แนบใหม่ที่ปุ่มไฟล์แนบ): ${uploaded.error}`)
    }
    setSaving(false)
    setFiles([])
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
      onCancel={close}
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
            agents={agents}
            vehicles={vehicles}
            vehicleId={vehicleId}
            currentInsurerId={coverage?.insurerId}
          />
          {canAttach && (
            <Form.Item
              label="แนบกรมธรรม์"
              extra={coverage ? 'PDF/JPG/PNG ไม่เกิน 10 MB — ไฟล์ที่แนบไว้แล้ว ดู/ลบได้ที่ปุ่มไฟล์แนบในตาราง' : 'PDF/JPG/PNG ไม่เกิน 10 MB'}
            >
              <PendingFilesUpload files={files} onChange={setFiles} buttonTestId="coverage-attach-btn" />
            </Form.Item>
          )}
        </Form>
      )}
    </Modal>
  )
}
