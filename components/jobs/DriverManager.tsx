'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Modal, Form, Input, App, Space, Tag, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { Driver, DriverBankAccount } from '@/types/job'
import dayjs from 'dayjs'

export default function DriverManager() {
  const { message } = App.useApp()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)

  // Bank account modal
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<DriverBankAccount | null>(null)
  const [bankDriverId, setBankDriverId] = useState<string | null>(null)
  const [bankForm] = Form.useForm()
  const [bankSubmitLoading, setBankSubmitLoading] = useState(false)

  const fetchDrivers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/drivers')
      if (res.ok) {
        const data = await res.json()
        setDrivers(data)
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    fetchDrivers()
  }, [fetchDrivers])

  const handleOpenModal = (driver?: Driver) => {
    if (driver) {
      setEditingDriver(driver)
      form.setFieldsValue({ name: driver.name })
    } else {
      setEditingDriver(null)
      form.resetFields()
    }
    setModalOpen(true)
  }

  const handleSubmit = async (values: { name: string }) => {
    setSubmitLoading(true)
    try {
      const url = editingDriver ? `/api/drivers/${editingDriver.id}` : '/api/drivers'
      const method = editingDriver ? 'PATCH' : 'POST'

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

      message.success(editingDriver ? 'แก้ไขคนขับสำเร็จ' : 'เพิ่มคนขับสำเร็จ')
      setModalOpen(false)
      fetchDrivers()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/drivers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบคนขับสำเร็จ')
        fetchDrivers()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  // Bank account handlers
  const handleOpenBankModal = (driverId: string, account?: DriverBankAccount) => {
    setBankDriverId(driverId)
    if (account) {
      setEditingAccount(account)
      bankForm.setFieldsValue({
        bankName: account.bankName,
        accountNo: account.accountNo,
        accountName: account.accountName,
      })
    } else {
      setEditingAccount(null)
      bankForm.resetFields()
    }
    setBankModalOpen(true)
  }

  const handleBankSubmit = async (values: { bankName: string; accountNo: string; accountName: string }) => {
    if (!bankDriverId) return
    setBankSubmitLoading(true)
    try {
      const url = editingAccount
        ? `/api/drivers/${bankDriverId}/bank-accounts/${editingAccount.id}`
        : `/api/drivers/${bankDriverId}/bank-accounts`
      const method = editingAccount ? 'PATCH' : 'POST'

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

      message.success(editingAccount ? 'แก้ไขบัญชีสำเร็จ' : 'เพิ่มบัญชีสำเร็จ')
      setBankModalOpen(false)
      fetchDrivers()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setBankSubmitLoading(false)
    }
  }

  const handleDeleteBank = async (driverId: string, accountId: string) => {
    try {
      const res = await fetch(`/api/drivers/${driverId}/bank-accounts/${accountId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        message.success('ลบบัญชีสำเร็จ')
        fetchDrivers()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const expandedRowRender = (record: Driver) => {
    const bankColumns = [
      { title: 'ชื่อธนาคาร', dataIndex: 'bankName', key: 'bankName' },
      { title: 'เลขบัญชี', dataIndex: 'accountNo', key: 'accountNo' },
      { title: 'ชื่อบัญชี', dataIndex: 'accountName', key: 'accountName' },
      {
        title: 'จัดการ',
        key: 'actions',
        width: 120,
        render: (_: unknown, account: DriverBankAccount) => (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenBankModal(record.id, account)}
            />
            <Popconfirm
              title="ยืนยันการลบ"
              description="ต้องการลบบัญชีนี้ใช่หรือไม่?"
              onConfirm={() => handleDeleteBank(record.id, account.id)}
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
      <div>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>บัญชีธนาคาร</strong>
          <Button size="small" icon={<PlusOutlined />} onClick={() => handleOpenBankModal(record.id)}>
            เพิ่มบัญชี
          </Button>
        </div>
        <Table
          columns={bankColumns}
          dataSource={record.bankAccounts}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </div>
    )
  }

  const columns = [
    { title: 'ชื่อคนขับ', dataIndex: 'name', key: 'name' },
    {
      title: 'จำนวนบัญชี',
      key: 'bankCount',
      width: 120,
      render: (_: unknown, record: Driver) => record.bankAccounts?.length || 0,
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
      render: (_: unknown, record: Driver) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          />
          <Popconfirm
            title="ยืนยันการลบ"
            description="ต้องการลบคนขับนี้ใช่หรือไม่?"
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
        <h2 style={{ margin: 0 }}>จัดการคนขับรถ</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          เพิ่มคนขับ
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={drivers}
        rowKey="id"
        loading={loading}
        expandable={{ expandedRowRender }}
        pagination={{ pageSize: 20 }}
      />

      {/* Driver Modal */}
      <Modal
        title={editingDriver ? 'แก้ไขคนขับ' : 'เพิ่มคนขับ'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={submitLoading}
        okText={editingDriver ? 'บันทึก' : 'เพิ่ม'}
        cancelText="ยกเลิก"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="ชื่อคนขับ"
            rules={[{ required: true, message: 'กรุณากรอกชื่อคนขับ' }]}
          >
            <Input placeholder="ชื่อคนขับ" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Bank Account Modal */}
      <Modal
        title={editingAccount ? 'แก้ไขบัญชีธนาคาร' : 'เพิ่มบัญชีธนาคาร'}
        open={bankModalOpen}
        onCancel={() => setBankModalOpen(false)}
        onOk={() => bankForm.submit()}
        confirmLoading={bankSubmitLoading}
        okText={editingAccount ? 'บันทึก' : 'เพิ่ม'}
        cancelText="ยกเลิก"
      >
        <Form form={bankForm} layout="vertical" onFinish={handleBankSubmit}>
          <Form.Item
            name="bankName"
            label="ชื่อธนาคาร"
            rules={[{ required: true, message: 'กรุณากรอกชื่อธนาคาร' }]}
          >
            <Input placeholder="เช่น กสิกร, กรุงเทพ, ไทยพาณิชย์" />
          </Form.Item>
          <Form.Item
            name="accountNo"
            label="เลขบัญชี"
            rules={[{ required: true, message: 'กรุณากรอกเลขบัญชี' }]}
          >
            <Input placeholder="เลขบัญชี" />
          </Form.Item>
          <Form.Item
            name="accountName"
            label="ชื่อบัญชี"
            rules={[{ required: true, message: 'กรุณากรอกชื่อบัญชี' }]}
          >
            <Input placeholder="ชื่อบัญชี" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
