'use client'

import { useState } from 'react'
import { Modal, Upload, Button, Table, Alert, App, Space, Typography } from 'antd'
import { UploadOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'

const { Text } = Typography

interface ImportJobModalProps {
  open: boolean
  driverId: string
  onClose: () => void
  onSuccess: () => void
}

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ParsedRow {
  [key: string]: string | number | undefined
}

const CSV_HEADERS = [
  'jobDate',
  'jobType',
  'customerName',
  'jobNumber',
  'size',
  'pickupLocationName',
  'factoryLocationName',
  'returnLocationName',
  'estimatedTransfer',
  'income',
  'driverWage',
  'actualTransfer',
  'advance',
  'toll',
  'pickupFee',
  'returnFee',
  'liftFee',
  'storageFee',
  'tire',
  'other',
  'mileage',
  'fuelOfficeLiters',
  'fuelCashLiters',
  'fuelCashAmount',
  'fuelCreditLiters',
  'fuelCreditAmount',
]

const CSV_HEADER_LABELS: Record<string, string> = {
  jobDate: 'วันที่ (YYYY-MM-DD)',
  jobType: 'ลักษณะงาน',
  customerName: 'ชื่อลูกค้า',
  jobNumber: 'เลขที่งาน',
  size: 'ขนาดตู้',
  pickupLocationName: 'สถานที่รับตู้',
  factoryLocationName: 'โรงงาน',
  returnLocationName: 'สถานที่คืนตู้',
  estimatedTransfer: 'คาดการณ์โอน',
  income: 'รายได้',
  driverWage: 'ค่าเที่ยวคนขับรถ',
  actualTransfer: 'ยอดโอนครั้งแรก',
  advance: 'เบิกล่วงหน้า',
  toll: 'ค่าทางด่วน',
  pickupFee: 'ค่ารับตู้',
  returnFee: 'ค่าคืนตู้',
  liftFee: 'ค่ายกตู้',
  storageFee: 'ค่าฝากตู้',
  tire: 'ค่ายาง',
  other: 'อื่นๆ',
  mileage: 'ไมล์รถ',
  fuelOfficeLiters: 'น้ำมัน OFF (ลิตร)',
  fuelCashLiters: 'น้ำมันสด (ลิตร)',
  fuelCashAmount: 'น้ำมันสด (฿)',
  fuelCreditLiters: 'น้ำมันเครดิต (ลิตร)',
  fuelCreditAmount: 'น้ำมันเครดิต (฿)',
}

const NUMERIC_FIELDS = [
  'estimatedTransfer',
  'income',
  'driverWage',
  'actualTransfer',
  'advance',
  'toll',
  'pickupFee',
  'returnFee',
  'liftFee',
  'storageFee',
  'tire',
  'other',
  'mileage',
  'fuelOfficeLiters',
  'fuelCashLiters',
  'fuelCashAmount',
  'fuelCreditLiters',
  'fuelCreditAmount',
]

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim())
  const rows: ParsedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: ParsedRow = {}

    headers.forEach((header, idx) => {
      const value = values[idx] || ''
      if (NUMERIC_FIELDS.includes(header) && value !== '') {
        const num = Number(value)
        row[header] = isNaN(num) ? value : num
      } else {
        row[header] = value || undefined
      }
    })

    // Skip completely empty rows
    if (Object.values(row).some((v) => v !== undefined && v !== '')) {
      rows.push(row)
    }
  }

  return rows
}

function downloadTemplate() {
  const headerRow = CSV_HEADERS.join(',')
  const labelRow = CSV_HEADERS.map((h) => CSV_HEADER_LABELS[h] || h).join(',')
  const exampleRow = [
    '2026-03-15',
    'ขาเข้า',
    'ชื่อลูกค้า',
    'JOB-001',
    '40DC',
    'สถานที่รับ',
    'ชื่อโรงงาน',
    'สถานที่คืน',
    '10000',
    '15000',
    '3000',
    '10000',
    '2000',
    '200',
    '500',
    '500',
    '300',
    '0',
    '0',
    '0',
    '150000',
    '100',
    '50',
    '1500',
    '80',
    '2400',
  ].join(',')

  const csv = `${headerRow}\n${labelRow}\n${exampleRow}`

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'job_import_template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export default function ImportJobModal({
  open,
  driverId,
  onClose,
  onSuccess,
}: ImportJobModalProps) {
  const { message } = App.useApp()
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [validated, setValidated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])

  const reset = () => {
    setParsedRows([])
    setErrors([])
    setValidated(false)
    setLoading(false)
    setImporting(false)
    setFileList([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFileRead = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const rows = parseCSV(text)
      setParsedRows(rows)
      setErrors([])
      setValidated(false)

      if (rows.length === 0) {
        message.warning('ไม่พบข้อมูลในไฟล์')
      }
    }
    reader.readAsText(file, 'utf-8')
    return false // prevent upload
  }

  const handleValidate = async () => {
    if (parsedRows.length === 0) {
      message.warning('ไม่มีข้อมูลสำหรับตรวจสอบ')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/jobs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows, driverId, validate: true }),
      })
      const data = await res.json()
      setErrors(data.errors || [])
      setValidated(true)

      if (data.valid) {
        message.success(`ตรวจสอบผ่าน ${data.totalRows} รายการ`)
      } else {
        message.error(`พบข้อผิดพลาด ${data.errors?.length || 0} รายการ`)
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการตรวจสอบ')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/jobs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows, driverId }),
      })

      if (res.ok) {
        const data = await res.json()
        message.success(`Import สำเร็จ ${data.created} รายการ`)
        onSuccess()
        handleClose()
      } else {
        const data = await res.json()
        if (data.errors) {
          setErrors(data.errors)
          message.error('พบข้อผิดพลาด กรุณาตรวจสอบข้อมูล')
        } else {
          message.error(data.error || 'เกิดข้อผิดพลาดในการ import')
        }
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการ import')
    } finally {
      setImporting(false)
    }
  }

  const errorColumns = [
    {
      title: 'แถว',
      dataIndex: 'row',
      key: 'row',
      width: 70,
    },
    {
      title: 'ฟิลด์',
      dataIndex: 'field',
      key: 'field',
      width: 150,
      render: (field: string) => CSV_HEADER_LABELS[field] || field,
    },
    {
      title: 'ข้อผิดพลาด',
      dataIndex: 'message',
      key: 'message',
    },
  ]

  const previewColumns = CSV_HEADERS.slice(0, 8).map((header) => ({
    title: CSV_HEADER_LABELS[header] || header,
    dataIndex: header,
    key: header,
    width: 120,
    ellipsis: true,
    render: (value: unknown) => (value !== undefined && value !== null ? String(value) : '-'),
  }))

  const isValid = validated && errors.length === 0

  return (
    <Modal
      title="Import ข้อมูลงาน"
      open={open}
      onCancel={handleClose}
      width={900}
      footer={[
        <Button key="template" icon={<DownloadOutlined />} onClick={downloadTemplate}>
          ดาวน์โหลด Template
        </Button>,
        <Button key="cancel" onClick={handleClose}>
          ยกเลิก
        </Button>,
        <Button
          key="validate"
          onClick={handleValidate}
          loading={loading}
          disabled={parsedRows.length === 0}
        >
          ตรวจสอบข้อมูล
        </Button>,
        <Button
          key="import"
          type="primary"
          onClick={handleImport}
          loading={importing}
          disabled={!isValid}
        >
          ยืนยัน Import ({parsedRows.length} รายการ)
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Upload */}
        <Upload
          accept=".csv"
          maxCount={1}
          fileList={fileList}
          beforeUpload={(file) => {
            setFileList([file as unknown as UploadFile])
            handleFileRead(file)
            return false
          }}
          onRemove={() => {
            reset()
          }}
        >
          <Button icon={<UploadOutlined />}>เลือกไฟล์ CSV</Button>
        </Upload>

        {/* Parsed data summary */}
        {parsedRows.length > 0 && (
          <Alert
            type="info"
            message={`พบข้อมูล ${parsedRows.length} รายการ`}
            description="กดปุ่ม 'ตรวจสอบข้อมูล' เพื่อตรวจสอบความถูกต้องก่อน import"
          />
        )}

        {/* Validation result */}
        {validated && isValid && (
          <Alert
            type="success"
            icon={<CheckCircleOutlined />}
            message="ตรวจสอบผ่านทั้งหมด"
            description="กดปุ่ม 'ยืนยัน Import' เพื่อนำเข้าข้อมูล"
            showIcon
          />
        )}

        {/* Errors table */}
        {errors.length > 0 && (
          <>
            <Alert
              type="error"
              icon={<CloseCircleOutlined />}
              message={`พบข้อผิดพลาด ${errors.length} รายการ`}
              description="กรุณาแก้ไขไฟล์ CSV แล้วอัปโหลดใหม่"
              showIcon
            />
            <Table
              columns={errorColumns}
              dataSource={errors}
              rowKey={(_, i) => `err-${i}`}
              size="small"
              pagination={{ pageSize: 10 }}
              scroll={{ y: 200 }}
            />
          </>
        )}

        {/* Data preview */}
        {parsedRows.length > 0 && (
          <>
            <Text strong>ตัวอย่างข้อมูล (8 คอลัมน์แรก)</Text>
            <Table
              columns={previewColumns}
              dataSource={parsedRows.slice(0, 5)}
              rowKey={(_, i) => `preview-${i}`}
              size="small"
              pagination={false}
              scroll={{ x: 900 }}
            />
            {parsedRows.length > 5 && (
              <Text type="secondary">... และอีก {parsedRows.length - 5} รายการ</Text>
            )}
          </>
        )}
      </Space>
    </Modal>
  )
}
