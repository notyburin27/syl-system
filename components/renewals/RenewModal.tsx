'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { App, Button, Form, Modal, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { COVERAGE_TYPE_LABELS } from '@/lib/renewals/constants'
import { validateAttachment } from '@/lib/renewals/attachmentRules'
import { nextPeriodDefaults } from '@/lib/renewals/renewalDefaults'
import type { CoverageDto, InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { sendJson } from './api'
import CoveragePeriodFields from './CoveragePeriodFields'
import { dtoToFormValues, formValuesToBody, type CoverageFormValues } from './coverageForm'
import { uploadAttachments } from './uploadAttachments'

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
  const [files, setFiles] = useState<File[]>([])

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

  const close = () => {
    setFiles([])
    onClose()
  }

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
    if (!res.ok) {
      setSaving(false)
      message.error(res.error)
      return
    }
    if (files.length > 0) {
      const uploaded = await uploadAttachments(res.data.id, files)
      if (!uploaded.ok) message.warning(`ต่ออายุสำเร็จ แต่แนบไฟล์ไม่สำเร็จ (แนบใหม่ที่หน้ารถ): ${uploaded.error}`)
    }
    setSaving(false)
    setFiles([])
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
      onCancel={close}
      destroyOnHidden
    >
      {item && (
        <Form key={item.id} form={form} layout="vertical" initialValues={initialValues} preserve={false} clearOnDestroy>
          <CoveragePeriodFields
            type={item.type}
            insurers={insurers}
            vehicles={vehicles}
            vehicleId={item.vehicleId}
            currentInsurerId={item.insurerId}
          />
          <Form.Item label="แนบไฟล์ (กรมธรรม์ / ป้ายภาษี)">
            <Upload
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              fileList={files.map((f, i) => ({ uid: String(i), name: f.name, status: 'done' as const }))}
              beforeUpload={(file) => {
                const checked = validateAttachment(file.name, file.type, file.size)
                if ('error' in checked) {
                  message.error(checked.error)
                  return Upload.LIST_IGNORE
                }
                setFiles((prev) => [...prev, file])
                return false
              }}
              onRemove={(removed) => setFiles((prev) => prev.filter((_, i) => String(i) !== removed.uid))}
            >
              <Button icon={<UploadOutlined />} data-testid="renew-attach-btn">
                เลือกไฟล์
              </Button>
            </Upload>
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
