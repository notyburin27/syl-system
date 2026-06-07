'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Modal, Form, Input, DatePicker, App, Space, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { CompanyHoliday } from '@/types/leave'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/th'

dayjs.locale('th')

export default function HolidayManager() {
  const { message } = App.useApp()
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)

  const fetchHolidays = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/jobs/holidays')
      if (res.ok) setHolidays(await res.json())
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    fetchHolidays()
  }, [fetchHolidays])

  const handleOpenModal = () => {
    form.resetFields()
    setModalOpen(true)
  }

  const handleSubmit = async (values: { holidayDate: Dayjs; name: string }) => {
    setSubmitLoading(true)
    try {
      const res = await fetch('/api/jobs/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holidayDate: values.holidayDate.format('YYYY-MM-DD'),
          name: values.name,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
        return
      }
      message.success('เพิ่มวันหยุดสำเร็จ')
      setModalOpen(false)
      fetchHolidays()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/holidays/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบวันหยุดสำเร็จ')
        fetchHolidays()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const columns = [
    {
      title: 'วันที่',
      dataIndex: 'holidayDate',
      key: 'holidayDate',
      width: 200,
      sorter: (a: CompanyHoliday, b: CompanyHoliday) =>
        new Date(a.holidayDate).getTime() - new Date(b.holidayDate).getTime(),
      defaultSortOrder: 'ascend' as const,
      render: (d: string) => dayjs(d).format('D MMMM YYYY'),
    },
    {
      title: 'ชื่อวันหยุด',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: CompanyHoliday) => (
        <Popconfirm
          title="ยืนยันการลบ"
          description="ต้องการลบวันหยุดนี้ใช่หรือไม่?"
          onConfirm={() => handleDelete(record.id)}
          okText="ลบ"
          cancelText="ยกเลิก"
        >
          <Button data-testid={`delete-holiday-${record.id}`} type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>วันหยุดบริษัท</h2>
        <Button data-testid="add-holiday-btn" type="primary" icon={<PlusOutlined />} onClick={handleOpenModal}>
          เพิ่มวันหยุด
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={holidays}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="เพิ่มวันหยุด"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={submitLoading}
        okText="เพิ่ม"
        cancelText="ยกเลิก"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="holidayDate"
            label="วันที่"
            rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}
          >
            <DatePicker id="holiday-date" style={{ width: '100%' }} format="D MMMM YYYY" />
          </Form.Item>
          <Form.Item
            name="name"
            label="ชื่อวันหยุด"
            rules={[{ required: true, message: 'กรุณากรอกชื่อวันหยุด' }]}
          >
            <Input data-testid="holiday-name-input" placeholder="เช่น วันเฉลิมพระชนมพรรษา" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
