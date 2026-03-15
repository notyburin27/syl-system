'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Modal, Form, Input, Select, App, Space, Tag, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined } from '@ant-design/icons'
import ImportCSVModal from './ImportCSVModal'
import type { Location } from '@/types/job'
import dayjs from 'dayjs'

export default function LocationManager() {
  const { message } = App.useApp()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [form] = Form.useForm()
  const [submitLoading, setSubmitLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const fetchLocations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/locations')
      if (res.ok) {
        const data = await res.json()
        setLocations(data)
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    fetchLocations()
  }, [fetchLocations])

  const handleOpenModal = (location?: Location) => {
    if (location) {
      setEditingLocation(location)
      form.setFieldsValue({ name: location.name, type: location.type })
    } else {
      setEditingLocation(null)
      form.resetFields()
      form.setFieldsValue({ type: 'general' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (values: { name: string; type: string }) => {
    setSubmitLoading(true)
    try {
      const url = editingLocation
        ? `/api/locations/${editingLocation.id}`
        : '/api/locations'
      const method = editingLocation ? 'PATCH' : 'POST'

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

      message.success(editingLocation ? 'แก้ไขสถานที่สำเร็จ' : 'เพิ่มสถานที่สำเร็จ')
      setModalOpen(false)
      fetchLocations()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('ลบสถานที่สำเร็จ')
        fetchLocations()
      } else {
        const error = await res.json()
        message.error(error.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const columns = [
    { title: 'ชื่อสถานที่', dataIndex: 'name', key: 'name' },
    {
      title: 'ประเภท',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Tag color={type === 'factory' ? 'blue' : 'default'}>
          {type === 'factory' ? 'โรงงาน' : 'ทั่วไป'}
        </Tag>
      ),
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
      render: (_: unknown, record: Location) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          />
          <Popconfirm
            title="ยืนยันการลบ"
            description="ต้องการลบสถานที่นี้ใช่หรือไม่?"
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
        <h2 style={{ margin: 0 }}>จัดการสถานที่</h2>
        <Space>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            เพิ่มสถานที่
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={locations}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editingLocation ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={submitLoading}
        okText={editingLocation ? 'บันทึก' : 'เพิ่ม'}
        cancelText="ยกเลิก"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="ชื่อสถานที่"
            rules={[{ required: true, message: 'กรุณากรอกชื่อสถานที่' }]}
          >
            <Input placeholder="ชื่อสถานที่" />
          </Form.Item>
          <Form.Item
            name="type"
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
        </Form>
      </Modal>

      <ImportCSVModal
        open={importOpen}
        title="Import สถานที่"
        apiEndpoint="/api/locations/import"
        headers={['name', 'type']}
        headerLabels={{ name: 'ชื่อสถานที่', type: 'ประเภท (factory/general)' }}
        exampleRow={['โรงงาน ABC', 'factory']}
        templateFileName="location_import_template.csv"
        onClose={() => setImportOpen(false)}
        onSuccess={fetchLocations}
      />
    </>
  )
}
