'use client'

import { useState } from 'react'
import { Modal, Form, Input, Select, App } from 'antd'

interface QuickAddModalProps {
  open: boolean
  type: 'customer' | 'driver' | 'location'
  locationType?: 'factory' | 'general'
  onClose: () => void
  onSuccess: (item: { id: string; name: string; type?: string }) => void
}

export default function QuickAddModal({
  open,
  type,
  locationType,
  onClose,
  onSuccess,
}: QuickAddModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const titles: Record<string, string> = {
    customer: 'เพิ่มลูกค้าใหม่',
    driver: 'เพิ่มคนขับใหม่',
    location: 'เพิ่มสถานที่ใหม่',
  }

  const labels: Record<string, string> = {
    customer: 'ชื่อลูกค้า',
    driver: 'ชื่อคนขับ',
    location: 'ชื่อสถานที่',
  }

  const apiPaths: Record<string, string> = {
    customer: '/api/customers',
    driver: '/api/drivers',
    location: '/api/locations',
  }

  const handleSubmit = async (values: { name: string; locType?: string }) => {
    setLoading(true)
    try {
      const body: { name: string; type?: string } = { name: values.name }
      if (type === 'location') {
        body.type = values.locType || locationType || 'general'
      }

      const res = await fetch(apiPaths[type], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
        return
      }

      const item = await res.json()
      form.resetFields()
      onSuccess(item)
      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={titles[type]}
      open={open}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText="เพิ่ม"
      cancelText="ยกเลิก"
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ locType: locationType || 'general' }}
      >
        <Form.Item
          name="name"
          label={labels[type]}
          rules={[{ required: true, message: `กรุณากรอก${labels[type]}` }]}
        >
          <Input placeholder={labels[type]} autoFocus />
        </Form.Item>
        {type === 'location' && !locationType && (
          <Form.Item
            name="locType"
            label="ประเภท"
            rules={[{ required: true, message: 'กรุณาเลือกประเภท' }]}
          >
            <Select
              options={[
                { value: 'general', label: 'ทั่วไป (สถานที่รับตู้/คืนตู้)' },
                { value: 'factory', label: 'โรงงาน' },
              ]}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
