'use client'

import { useState, useEffect } from 'react'
import { Modal, Form, Input, InputNumber, Upload, App } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload'
import type { Product } from '@/types/stock'

interface ProductFormModalProps {
  open: boolean
  product: Product | null
  onClose: () => void
  onSuccess: () => void
}

export default function ProductFormModal({ open, product, onClose, onSuccess }: ProductFormModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])

  useEffect(() => {
    if (open) {
      if (product) {
        form.setFieldsValue({
          name: product.name,
          sellingPrice: product.sellingPrice,
        })
        if (product.image) {
          setFileList([{
            uid: '-1',
            name: 'image',
            status: 'done',
            url: product.image,
          }])
        } else {
          setFileList([])
        }
      } else {
        form.resetFields()
        setFileList([])
      }
    }
  }, [open, product, form])

  const handleSubmit = async (values: { name: string; sellingPrice: number }) => {
    setLoading(true)
    try {
      const url = product ? `/api/stock/products/${product.id}` : '/api/stock/products'
      const method = product ? 'PATCH' : 'POST'

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

      const savedProduct = await res.json()

      // Upload image if there's a new file
      const newFile = fileList.find(f => f.originFileObj)
      if (newFile?.originFileObj) {
        const formData = new FormData()
        formData.append('image', newFile.originFileObj)
        await fetch(`/api/stock/products/${savedProduct.id}/upload`, {
          method: 'POST',
          body: formData,
        })
      }

      message.success(product ? 'แก้ไขสินค้าสำเร็จ' : 'เพิ่มสินค้าสำเร็จ')
      onSuccess()
      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText={product ? 'บันทึก' : 'เพิ่ม'}
      cancelText="ยกเลิก"
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="name"
          label="ชื่อสินค้า"
          rules={[{ required: true, message: 'กรุณากรอกชื่อสินค้า' }]}
        >
          <Input placeholder="ชื่อสินค้า" />
        </Form.Item>

        <Form.Item
          name="sellingPrice"
          label="ราคาขาย (บาท)"
          rules={[{ required: true, message: 'กรุณากรอกราคาขาย' }]}
        >
          <InputNumber
            min={0}
            step={0.01}
            style={{ width: '100%' }}
            placeholder="0.00"
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          />
        </Form.Item>

        <Form.Item label="รูปภาพสินค้า">
          <Upload
            listType="picture-card"
            fileList={fileList}
            onChange={({ fileList: newFileList }) => setFileList(newFileList.slice(-1))}
            beforeUpload={() => false}
            accept="image/jpeg,image/png,image/webp"
          >
            {fileList.length === 0 && (
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 8 }}>อัพโหลด</div>
              </div>
            )}
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  )
}
