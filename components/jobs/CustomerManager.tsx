'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Modal, Form, Input, App, Space, Tag, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { Customer } from '@/types/job'
import dayjs from 'dayjs'

export default function CustomerManager() {
  const { message } = App.useApp()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data)
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer)
      form.setFieldsValue({ name: customer.name })
    } else {
      setEditingCustomer(null)
      form.resetFields()
    }
    setModalOpen(true)
  }

  const handleSubmit = async (values: { name: string }) => {
    setSubmitLoading(true)
    try {
      const url = editingCustomer
        ? `/api/customers/${editingCustomer.id}`
        : '/api/customers'
      const method = editingCustomer ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      if (!res.ok) {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
        return
      }

      message.success(editingCustomer ? 'แก้ไขลูกค้าสำเร็จ' : 'เพิ่มลูกค้าสำเร็จ')
      setModalOpen(false)
      fetchCustomers()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบลูกค้าสำเร็จ')
        fetchCustomers()
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
      title: 'ชื่อลูกค้า',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'สถานะ',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
        </Tag>
      ),
    },
    {
      title: 'วันที่สร้าง',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: Customer) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          />
          <Popconfirm
            title="ยืนยันการลบ"
            description="ต้องการลบลูกค้านี้ใช่หรือไม่?"
            onConfirm={() => handleDelete(record.id)}
            okText="ลบ"
            cancelText="ยกเลิก"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>จัดการลูกค้า</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          เพิ่มลูกค้า
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editingCustomer ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={submitLoading}
        okText={editingCustomer ? 'บันทึก' : 'เพิ่ม'}
        cancelText="ยกเลิก"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="ชื่อลูกค้า"
            rules={[{ required: true, message: 'กรุณากรอกชื่อลูกค้า' }]}
          >
            <Input placeholder="ชื่อลูกค้า" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
