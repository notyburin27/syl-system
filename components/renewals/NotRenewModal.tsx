'use client'

import { useState } from 'react'
import { App, Form, Input, Modal, Select } from 'antd'
import { NOT_RENEWED_REASONS, NOT_RENEWED_REASON_LABELS, type NotRenewedReasonKey } from '@/lib/renewals/constants'
import { sendJson } from './api'

interface Props {
  ids: string[] | null
  defaultReason?: NotRenewedReasonKey
  onClose: () => void
  onDone: () => void
}

interface Values {
  reason: NotRenewedReasonKey
  note?: string
}

/** ไม่ต่อ — ใช้ทั้งทีละแถวและหลายแถว */
export default function NotRenewModal({ ids, defaultReason, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const reason = Form.useWatch('reason', form)

  const handleOk = async () => {
    if (!ids) return
    let values: Values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    const res = await sendJson('/api/renewals/coverages/bulk-status', {
      ids,
      status: 'NOT_RENEWED',
      reason: values.reason,
      note: values.note?.trim() || null,
    })
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกสำเร็จ')
    onDone()
  }

  return (
    <Modal
      open={ids !== null}
      title={`ไม่ต่อ (${ids?.length ?? 0} รายการ)`}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {ids && (
        <Form form={form} layout="vertical" initialValues={{ reason: defaultReason }} preserve={false} clearOnDestroy>
          <Form.Item name="reason" label="เหตุผล" rules={[{ required: true, message: 'กรุณาเลือกเหตุผล' }]}>
            <Select
              id="not-renew-reason"
              options={NOT_RENEWED_REASONS.map((r) => ({ value: r, label: NOT_RENEWED_REASON_LABELS[r] }))}
            />
          </Form.Item>
          <Form.Item
            name="note"
            label="หมายเหตุ"
            rules={[{ required: reason === 'OTHER', whitespace: true, message: 'เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ' }]}
          >
            <Input.TextArea data-testid="not-renew-note" rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
