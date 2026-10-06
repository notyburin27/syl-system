'use client'

import { useState } from 'react'
import { App, Form, Input, Modal } from 'antd'
import type { CoverageDto } from '@/types/renewals'
import { sendJson } from './api'
import { dtoToBody } from './coverageForm'

interface Props {
  item: CoverageDto | null
  onClose: () => void
  onDone: () => void
}

export default function NoteModal({ item, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ renewalNote?: string }>()
  const [saving, setSaving] = useState(false)

  const handleOk = async () => {
    if (!item) return
    let renewalNote: string | undefined
    try {
      ;({ renewalNote } = await form.validateFields())
    } catch {
      return
    }
    setSaving(true)
    const res = await sendJson(
      `/api/renewals/coverages/${item.id}`,
      { ...dtoToBody(item), renewalNote: renewalNote?.trim() || null },
      'PATCH',
    )
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกหมายเหตุสำเร็จ')
    onDone()
  }

  return (
    <Modal
      open={item !== null}
      title={item ? `หมายเหตุ — ${item.vehicle.plate}` : ''}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {item && (
        <Form key={item.id} form={form} layout="vertical" initialValues={{ renewalNote: item.renewalNote ?? '' }} preserve={false} clearOnDestroy>
          <Form.Item name="renewalNote" label="หมายเหตุ">
            <Input.TextArea data-testid="note-input" rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
