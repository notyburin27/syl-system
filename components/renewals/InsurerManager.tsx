'use client'

import { useCallback, useEffect, useState } from 'react'
import { App, Button, Form, Input, Modal, Space, Table, Tag } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import type { InsurerDto } from '@/types/renewals'
import { getJson, sendJson } from './api'

export default function InsurerManager() {
  const { message, modal } = App.useApp()
  const [rows, setRows] = useState<InsurerDto[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<InsurerDto | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string }>()

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await getJson<InsurerDto[]>('/api/renewals/insurers')
    if (res.ok) setRows(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [message])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const handleSave = async () => {
    let name: string
    try {
      ;({ name } = await form.validateFields())
    } catch {
      return
    }
    setSaving(true)
    const res =
      editing === 'new'
        ? await sendJson('/api/renewals/insurers', { name })
        : await sendJson(`/api/renewals/insurers/${(editing as InsurerDto).id}`, { name }, 'PATCH')
    setSaving(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success('บันทึกสำเร็จ')
    setEditing(null)
    fetchRows()
  }

  const toggleActive = (row: InsurerDto) => {
    modal.confirm({
      title: row.isActive ? 'ปิดใช้งานบริษัทประกัน' : 'เปิดใช้งานบริษัทประกัน',
      content: row.isActive ? `${row.name} จะไม่แสดงในตัวเลือก (งวดเดิมยังอ้างถึงได้)` : row.name,
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: async () => {
        const res = await sendJson(`/api/renewals/insurers/${row.id}`, { isActive: !row.isActive }, 'PATCH')
        if (res.ok) {
          message.success('บันทึกสำเร็จ')
          fetchRows()
        } else {
          message.error(res.error)
        }
      },
    })
  }

  const columns = [
    { title: 'ชื่อบริษัทประกัน', dataIndex: 'name', key: 'name' },
    {
      title: 'สถานะ',
      key: 'isActive',
      width: 120,
      render: (_: unknown, r: InsurerDto) =>
        r.isActive ? <Tag color="green">ใช้งาน</Tag> : <Tag>ปิดใช้งาน</Tag>,
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 180,
      render: (_: unknown, r: InsurerDto) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(r)
              form.setFieldsValue({ name: r.name })
            }}
            data-testid={`insurer-edit-btn-${r.id}`}
          />
          <Button type="link" size="small" danger={r.isActive} onClick={() => toggleActive(r)}>
            {r.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>บริษัทประกัน</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing('new')
            form.setFieldsValue({ name: '' })
          }}
          data-testid="insurer-add-btn"
        >
          เพิ่ม
        </Button>
      </div>
      <Table size="small" rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={false} />
      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'เพิ่มบริษัทประกัน' : 'แก้ไขบริษัทประกัน'}
        okText="บันทึก"
        cancelText="ยกเลิก"
        confirmLoading={saving}
        onOk={handleSave}
        onCancel={() => {
          setEditing(null)
          form.resetFields()
        }}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="ชื่อ" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อ' }]}>
            <Input data-testid="insurer-name-input" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
