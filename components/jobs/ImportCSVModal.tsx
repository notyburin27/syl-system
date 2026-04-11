'use client'

import { useState } from 'react'
import { Modal, Upload, Button, Table, Alert, App, Space, Typography } from 'antd'
import { UploadOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'

const { Text } = Typography

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ParsedRow {
  [key: string]: string | undefined
}

interface ImportCSVModalProps {
  open: boolean
  title: string
  apiEndpoint: string
  headers: string[]
  headerLabels: Record<string, string>
  /** headers ที่ไม่บังคับ — จะแสดง (optional) ใน template */
  optionalHeaders?: string[]
  /** ใช้ exampleRows แทน exampleRow เพื่อรองรับหลายแถวตัวอย่าง */
  exampleRows?: string[][]
  /** @deprecated ใช้ exampleRows แทน */
  exampleRow?: string[]
  templateFileName: string
  onClose: () => void
  onSuccess: () => void
}

function parseCSV(text: string, headers: string[]): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []

  const fileHeaders = lines[0].split(',').map((h) => h.trim())
  const rows: ParsedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: ParsedRow = {}

    fileHeaders.forEach((header, idx) => {
      // Map file header to expected header
      const mappedHeader = headers.includes(header) ? header : fileHeaders[idx]
      const value = values[idx] || ''
      row[mappedHeader] = value || undefined
    })

    if (Object.values(row).some((v) => v !== undefined && v !== '')) {
      rows.push(row)
    }
  }

  return rows
}

export default function ImportCSVModal({
  open,
  title,
  apiEndpoint,
  headers,
  headerLabels,
  optionalHeaders = [],
  exampleRows,
  exampleRow,
  templateFileName,
  onClose,
  onSuccess,
}: ImportCSVModalProps) {
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
      const rows = parseCSV(text, headers)
      setParsedRows(rows)
      setErrors([])
      setValidated(false)

      if (rows.length === 0) {
        message.warning('ไม่พบข้อมูลในไฟล์')
      }
    }
    reader.readAsText(file, 'utf-8')
    return false
  }

  const downloadTemplate = () => {
    const headerRow = headers.join(',')
    const rows = exampleRows ?? (exampleRow ? [exampleRow] : [])
    const csv = [headerRow, ...rows.map((r) => r.join(','))].join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = templateFileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleValidate = async () => {
    if (parsedRows.length === 0) {
      message.warning('ไม่มีข้อมูลสำหรับตรวจสอบ')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows, validate: true }),
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
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows }),
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
    { title: 'แถว', dataIndex: 'row', key: 'row', width: 70 },
    {
      title: 'ฟิลด์',
      dataIndex: 'field',
      key: 'field',
      width: 150,
      render: (field: string) => headerLabels[field] || field,
    },
    { title: 'ข้อผิดพลาด', dataIndex: 'message', key: 'message' },
  ]

  const previewColumns = headers.map((header) => ({
    title: optionalHeaders.includes(header)
      ? `${headerLabels[header] || header} (optional)`
      : headerLabels[header] || header,
    dataIndex: header,
    key: header,
    ellipsis: true,
    render: (value: unknown) => (value !== undefined && value !== null && value !== '' ? String(value) : '-'),
  }))

  const isValid = validated && errors.length === 0

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleClose}
      width={700}
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
        <Upload
          accept=".csv"
          maxCount={1}
          fileList={fileList}
          beforeUpload={(file) => {
            setFileList([file as unknown as UploadFile])
            handleFileRead(file)
            return false
          }}
          onRemove={() => reset()}
        >
          <Button icon={<UploadOutlined />}>เลือกไฟล์ CSV</Button>
        </Upload>

        {parsedRows.length > 0 && !validated && (
          <Alert
            type="info"
            message={`พบข้อมูล ${parsedRows.length} รายการ`}
            description="กดปุ่ม 'ตรวจสอบข้อมูล' เพื่อตรวจสอบความถูกต้องก่อน import"
          />
        )}

        {validated && isValid && (
          <Alert
            type="success"
            icon={<CheckCircleOutlined />}
            message="ตรวจสอบผ่านทั้งหมด"
            description="กดปุ่ม 'ยืนยัน Import' เพื่อนำเข้าข้อมูล"
            showIcon
          />
        )}

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

        {parsedRows.length > 0 && (
          <>
            <Text strong>ตัวอย่างข้อมูล</Text>
            <Table
              columns={previewColumns}
              dataSource={parsedRows.slice(0, 5)}
              rowKey={(_, i) => `preview-${i}`}
              size="small"
              pagination={false}
              scroll={{ x: true }}
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
