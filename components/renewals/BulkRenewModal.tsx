'use client'

import { useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { Alert, App, Col, DatePicker, Form, Modal, Row, Select } from 'antd'
import { COVERAGE_TYPE_LABELS } from '@/lib/renewals/constants'
import { nextPeriodDefaults } from '@/lib/renewals/renewalDefaults'
import type { DashboardItemDto, InsurerDto } from '@/types/renewals'
import { sendJson } from './api'
import { DATE_FORMAT } from './coverageForm'

interface Props {
  open: boolean
  items: DashboardItemDto[]
  insurers: InsurerDto[]
  onClose: () => void
  onDone: () => void
}

interface Values {
  insurerId?: string | null
  startDate?: Dayjs | null
  endDate?: Dayjs | null
}

/** ต่อแล้วหลายรายการ (ประเภทเดียวกัน) — เบี้ย/ค่าบริการคัดลอกจากงวดเดิมฝั่ง server */
export default function BulkRenewModal({ open, items, insurers, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const type = items[0]?.type

  const initialValues = useMemo<Values>(() => {
    const sameEnd = items.length > 0 && items.every((i) => i.endDate === items[0].endDate)
    if (!sameEnd) return {}
    const next = nextPeriodDefaults(items[0].endDate)
    return { startDate: dayjs(next.startDate), endDate: dayjs(next.endDate) }
  }, [items])

  const handleOk = async () => {
    let values: Values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    const res = await sendJson<{ count: number }>('/api/renewals/coverages/bulk-renew', {
      ids: items.map((i) => i.id),
      insurerId: values.insurerId ?? null,
      startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
      endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : '',
    })
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success(`ต่ออายุ ${res.data.count} รายการสำเร็จ`)
    onDone()
  }

  return (
    <Modal
      open={open}
      title={`ต่อแล้ว ${type ? COVERAGE_TYPE_LABELS[type] : ''} (${items.length} รายการ)`}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      {open && (
        <Form form={form} layout="vertical" initialValues={initialValues} preserve={false} clearOnDestroy>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="เบี้ย/ค่าบริการคัดลอกจากงวดเดิมของแต่ละคัน — เลขกรมธรรม์และไฟล์แนบแก้ทีหลังที่หน้ารถ"
          />
          {type !== 'TAX' && (
            <Form.Item name="insurerId" label="บริษัทประกัน">
              <Select
                id="bulk-renew-insurer"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="คงบริษัทเดิมของแต่ละคัน"
                options={insurers.filter((i) => i.isActive).map((i) => ({ value: i.id, label: i.name }))}
              />
            </Form.Item>
          )}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="startDate" label="วันเริ่ม">
                <DatePicker id="bulk-renew-start-date" format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="วันสิ้นสุด" rules={[{ required: true, message: 'กรุณาเลือกวันสิ้นสุด' }]}>
                <DatePicker id="bulk-renew-end-date" format={DATE_FORMAT} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )}
    </Modal>
  )
}
