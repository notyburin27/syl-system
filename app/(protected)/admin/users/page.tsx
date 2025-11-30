'use client'

import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, App, Space, Popconfirm, Card } from 'antd'
import { PlusOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'

interface User {
  id: string
  username: string
  role: 'ADMIN' | 'STAFF'
  name: string | null
  createdAt: string
}

export default function UsersManagementPage() {
  const { message } = App.useApp()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [form] = Form.useForm()
  const [passwordForm] = Form.useForm()

  // Fetch users
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (error) {
      message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Create user
  const handleCreateUser = async (values: any) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      if (res.ok) {
        message.success('สร้างผู้ใช้สำเร็จ')
        setIsModalOpen(false)
        form.resetFields()
        fetchUsers()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch (error) {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  // Delete user
  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' })

      if (res.ok) {
        message.success('ลบผู้ใช้สำเร็จ')
        fetchUsers()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch (error) {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  // Change password
  const handleChangePassword = async (values: any) => {
    if (!selectedUser) return

    try {
      const res = await fetch(`/api/users/${selectedUser.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      if (res.ok) {
        message.success('เปลี่ยนรหัสผ่านสำเร็จ')
        setIsPasswordModalOpen(false)
        setSelectedUser(null)
        passwordForm.resetFields()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch (error) {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const columns: ColumnsType<User> = [
    {
      title: 'ชื่อผู้ใช้',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: 'ชื่อ',
      dataIndex: 'name',
      key: 'name',
      render: (name) => name || '-',
    },
    {
      title: 'สิทธิ์',
      dataIndex: 'role',
      key: 'role',
      render: (role) => (
        <span style={{ color: role === 'ADMIN' ? '#1890ff' : '#52c41a' }}>
          {role === 'ADMIN' ? 'แอดมิน' : 'พนักงาน'}
        </span>
      ),
    },
    {
      title: 'วันที่สร้าง',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => dayjs(date).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'การดำเนินการ',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            icon={<KeyOutlined />}
            size="small"
            onClick={() => {
              setSelectedUser(record)
              setIsPasswordModalOpen(true)
            }}
          >
            เปลี่ยนรหัสผ่าน
          </Button>
          <Popconfirm
            title="ยืนยันการลบ"
            description="คุณแน่ใจหรือไม่ที่จะลบผู้ใช้นี้?"
            onConfirm={() => handleDeleteUser(record.id)}
            okText="ยืนยัน"
            cancelText="ยกเลิก"
          >
            <Button danger icon={<DeleteOutlined />} size="small">
              ลบ
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="จัดการผู้ใช้งาน"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
          >
            สร้างผู้ใช้ใหม่
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Create User Modal */}
      <Modal
        title="สร้างผู้ใช้ใหม่"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false)
          form.resetFields()
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateUser}>
          <Form.Item
            name="username"
            label="ชื่อผู้ใช้"
            rules={[
              { required: true, message: 'กรุณากรอกชื่อผู้ใช้' },
              { min: 3, message: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร' },
            ]}
          >
            <Input placeholder="username" />
          </Form.Item>

          <Form.Item
            name="password"
            label="รหัสผ่าน"
            rules={[
              { required: true, message: 'กรุณากรอกรหัสผ่าน' },
              { min: 8, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' },
            ]}
          >
            <Input.Password placeholder="รหัสผ่าน" />
          </Form.Item>

          <Form.Item
            name="name"
            label="ชื่อ-นามสกุล"
          >
            <Input placeholder="ชื่อจริง" />
          </Form.Item>

          <Form.Item
            name="role"
            label="สิทธิ์"
            rules={[{ required: true, message: 'กรุณาเลือกสิทธิ์' }]}
          >
            <Select>
              <Select.Option value="STAFF">พนักงาน</Select.Option>
              <Select.Option value="ADMIN">แอดมิน</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                สร้างผู้ใช้
              </Button>
              <Button onClick={() => {
                setIsModalOpen(false)
                form.resetFields()
              }}>
                ยกเลิก
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title="เปลี่ยนรหัสผ่าน"
        open={isPasswordModalOpen}
        onCancel={() => {
          setIsPasswordModalOpen(false)
          setSelectedUser(null)
          passwordForm.resetFields()
        }}
        footer={null}
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item
            name="password"
            label="รหัสผ่านใหม่"
            rules={[
              { required: true, message: 'กรุณากรอกรหัสผ่าน' },
              { min: 8, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' },
            ]}
          >
            <Input.Password placeholder="รหัสผ่านใหม่" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                เปลี่ยนรหัสผ่าน
              </Button>
              <Button onClick={() => {
                setIsPasswordModalOpen(false)
                setSelectedUser(null)
                passwordForm.resetFields()
              }}>
                ยกเลิก
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
