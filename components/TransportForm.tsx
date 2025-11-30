'use client'

import { Form, Input, DatePicker, Button, Card, App } from 'antd'
import { ClearOutlined, FilePdfOutlined, CopyOutlined, SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { generateSinglePDF, validateFormForPDF } from '@/lib/utils/pdfUtils'
import type { FormState } from '@/types/document'

interface TransportFormProps {
  form: FormState
  onFieldChange: (formId: number, fieldName: string, value: any) => void
  onClearForm: (formId: number) => void
  onFormValidation: (formId: number, hasErrors: boolean) => void
  onDuplicateForm: (fieldsToOopy: any) => void
  onSaveForm: (formId: number) => Promise<void>
}

export default function TransportForm({
  form,
  onFieldChange,
  onClearForm,
  onFormValidation,
  onDuplicateForm,
  onSaveForm,
}: TransportFormProps) {
  const { message } = App.useApp()
  const [antForm] = Form.useForm()

  // Handle form field changes
  const handleFieldChange = (fieldName: string, value: any) => {
    onFieldChange(form.id, fieldName, value)

    // Trigger form validation
    if (onFormValidation) {
      const validation = validateFormForPDF({
        ...form.data,
        [fieldName]: value,
      })
      onFormValidation(form.id, !validation.isValid)
    }
  }

  // Handle clear form
  const handleClearForm = () => {
    antForm.resetFields()
    onClearForm(form.id)
    message.success('ล้างฟอร์มสำเร็จ')
  }

  // Handle single PDF generation
  const handleGeneratePDF = async () => {
    const validation = validateFormForPDF(form.data)

    if (!validation.isValid) {
      message.error(
        `ข้อมูลไม่ครบ: ${validation.missingFields.join(', ')}`
      )
      return
    }

    try {
      message.loading('กำลังสร้าง PDF...', 0)
      const result = await generateSinglePDF(form.data, form.title)
      message.destroy()

      if (result.success) {
        message.success(`สร้าง PDF สำเร็จ: ${result.filename}`)
      } else {
        message.error(`สร้าง PDF ล้มเหลว: ${result.error}`)
      }
    } catch {
      message.destroy()
      message.error('สร้าง PDF ล้มเหลว')
    }
  }

  // Handle duplicate form with specific fields
  const handleDuplicateForm = () => {
    if (onDuplicateForm) {
      const fieldsToOopy = {
        booking: form.data.booking,
        agent: form.data.agent,
        shipName: form.data.shipName,
        shipping: form.data.shipping,
        pickupLocation: form.data.pickupLocation,
        returnLocation: form.data.returnLocation,
        closingTime: form.data.closingTime,
      }
      onDuplicateForm(fieldsToOopy)
      message.success('คัดลอกฟอร์มสำเร็จ')
    }
  }

  // Handle save form
  const handleSaveForm = async () => {
    try {
      await onSaveForm(form.id)
    } catch (error) {
      console.error('Error saving form:', error)
    }
  }

  return (
    <Card className="form-container">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {form.title}
          {form.hasUnsavedChanges && <span style={{ color: '#ff4d4f', marginLeft: 8 }}>*</span>}
        </h2>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSaveForm}
          disabled={!form.hasUnsavedChanges}
        >
          บันทึก
        </Button>
      </div>

      <Form
        form={antForm}
        layout="horizontal"
        className="transport-form"
        size="middle"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
      >
        <Form.Item label="วันที่">
          <DatePicker
            value={form.data.date ? dayjs(form.data.date) : null}
            onChange={(date) =>
              handleFieldChange('date', date ? date.toDate() : null)
            }
            format={(value) => {
              if (!value) return ''
              const buddhistYear = value.year() + 543
              return `${value.date()}/${value.month() + 1}/${buddhistYear
                .toString()
                .slice(-2)}`
            }}
            style={{ width: '100%' }}
            placeholder="เลือกวันที่"
          />
        </Form.Item>

        <Form.Item label="ชื่อลูกค้า">
          <Input
            value={form.data.customerName}
            onChange={(e) => handleFieldChange('customerName', e.target.value)}
            placeholder="กรอกชื่อลูกค้า"
          />
        </Form.Item>

        <Form.Item label="บุ๊คกิ้ง">
          <Input
            value={form.data.booking}
            onChange={(e) => handleFieldChange('booking', e.target.value)}
            placeholder="กรอกบุ๊คกิ้ง"
          />
        </Form.Item>

        <Form.Item label="เอเย่นต์">
          <Input
            value={form.data.agent}
            onChange={(e) => handleFieldChange('agent', e.target.value)}
            placeholder="กรอกเอเย่นต์"
          />
        </Form.Item>

        <Form.Item label="ชื่อเรือ">
          <Input
            value={form.data.shipName}
            onChange={(e) => handleFieldChange('shipName', e.target.value)}
            placeholder="กรอกชื่อเรือ"
          />
        </Form.Item>

        <Form.Item label="อินวอยซ์">
          <Input
            value={form.data.invoice}
            onChange={(e) => handleFieldChange('invoice', e.target.value)}
            placeholder="กรอกอินวอยซ์"
          />
        </Form.Item>

        <Form.Item label="ขนาดตู้">
          <Input
            value={form.data.containerSize}
            onChange={(e) => handleFieldChange('containerSize', e.target.value)}
            placeholder="กรอกขนาดตู้"
          />
        </Form.Item>

        <Form.Item label="เบอร์ตู้">
          <Input
            value={form.data.containerNumber}
            onChange={(e) =>
              handleFieldChange('containerNumber', e.target.value)
            }
            placeholder="กรอกเบอร์ตู้"
          />
        </Form.Item>

        <Form.Item label="เบอร์ซีล">
          <Input
            value={form.data.sealNumber}
            onChange={(e) => handleFieldChange('sealNumber', e.target.value)}
            placeholder="กรอกเบอร์ซีล"
          />
        </Form.Item>

        <Form.Item label="ชิปปิ้ง">
          <Input
            value={form.data.shipping}
            onChange={(e) => handleFieldChange('shipping', e.target.value)}
            placeholder="กรอกชิปปิ้ง"
          />
        </Form.Item>

        <Form.Item label="สถานที่รับตู้">
          <Input
            value={form.data.pickupLocation}
            onChange={(e) =>
              handleFieldChange('pickupLocation', e.target.value)
            }
            placeholder="กรอกสถานที่รับตู้"
          />
        </Form.Item>

        <Form.Item label="สถานที่คืนตู้">
          <Input
            value={form.data.returnLocation}
            onChange={(e) =>
              handleFieldChange('returnLocation', e.target.value)
            }
            placeholder="กรอกสถานที่คืนตู้"
          />
        </Form.Item>

        <Form.Item label="CLOSING TIME">
          <DatePicker
            showTime
            value={form.data.closingTime ? dayjs(form.data.closingTime) : null}
            onChange={(datetime) =>
              handleFieldChange(
                'closingTime',
                datetime ? datetime.toDate() : null
              )
            }
            format={(value) => {
              if (!value) return ''
              const buddhistYear = value.year() + 543
              return `${value.date()}/${
                value.month() + 1
              }/${buddhistYear} ${value.format('HH:mm')}`
            }}
            style={{ width: '100%' }}
            placeholder="เลือกวันที่และเวลา"
          />
        </Form.Item>

        <Form.Item label="เวลาเข้าโรงงาน">
          <Input
            value={form.data.factoryTime}
            onChange={(e) => handleFieldChange('factoryTime', e.target.value)}
            placeholder="กรอกเวลาเข้าโรงงาน"
          />
        </Form.Item>

        <Form.Item label="ช่องโหลด">
          <Input
            value={form.data.loadingSlot}
            onChange={(e) => handleFieldChange('loadingSlot', e.target.value)}
            placeholder="กรอกช่องโหลด"
          />
        </Form.Item>

        <Form.Item label="ชื่อ พขร.">
          <Input
            value={form.data.driverName}
            onChange={(e) => handleFieldChange('driverName', e.target.value)}
            placeholder="กรอกชื่อ พขร."
          />
        </Form.Item>

        <Form.Item label="ทะเบียนรถ">
          <Input
            value={form.data.vehicleRegistration}
            onChange={(e) =>
              handleFieldChange('vehicleRegistration', e.target.value)
            }
            placeholder="กรอกทะเบียนรถ"
          />
        </Form.Item>

        <Form.Item label="เบอร์โทร">
          <Input
            value={form.data.phoneNumber}
            onChange={(e) => handleFieldChange('phoneNumber', e.target.value)}
            placeholder="กรอกเบอร์โทร"
          />
        </Form.Item>

        <Form.Item label="หมายเหตุ">
          <Input.TextArea
            value={form.data.remarks}
            onChange={(e) => handleFieldChange('remarks', e.target.value)}
            placeholder="กรอกหมายเหตุ"
            rows={3}
          />
        </Form.Item>
      </Form>

      <div
        className="form-actions"
        style={{ marginTop: 24, textAlign: 'right' }}
      >
        <Button
          icon={<CopyOutlined />}
          onClick={handleDuplicateForm}
          style={{ marginRight: 12 }}
        >
          คัดลอกฟอร์ม
        </Button>
        <Button
          icon={<ClearOutlined />}
          onClick={handleClearForm}
          style={{ marginRight: 12 }}
        >
          ล้างฟอร์ม
        </Button>
        <Button
          type="primary"
          icon={<FilePdfOutlined />}
          onClick={handleGeneratePDF}
        >
          สร้าง PDF
        </Button>
      </div>
    </Card>
  )
}
