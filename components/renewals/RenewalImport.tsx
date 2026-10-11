'use client'

import { useState } from 'react'
import { Alert, App, Button, Descriptions, Space, Table, Upload, type TableColumnsType } from 'antd'
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { ImportCommitResponse, ImportErrorDto, ImportPreviewResponse, ImportSummaryDto } from '@/types/renewals'
import { SESSION_EXPIRED_ERROR, handleSessionExpired, sendJson } from './api'

const SUMMARY_LABELS: [keyof ImportSummaryDto, string][] = [
  ['vehiclesCreated', 'รถใหม่'],
  ['vehiclesUpdated', 'รถที่อัปเดต'],
  ['coveragesCreated', 'งวดใหม่'],
  ['coveragesUpdated', 'งวดที่อัปเดต'],
  ['coveragesAutoClosed', 'งวดเก่าที่ปิดอัตโนมัติ'],
]

const describeSummary = (s: ImportSummaryDto) => SUMMARY_LABELS.map(([key, label]) => `${label} ${s[key]}`).join(', ')

type ImportResponseBody = Partial<ImportPreviewResponse> & Partial<ImportCommitResponse> & { error?: string }

const errorColumns: TableColumnsType<ImportErrorDto> = [
  { title: 'ชีต', dataIndex: 'sheet', key: 'sheet', width: 70 },
  { title: 'แถว', dataIndex: 'row', key: 'row', width: 70 },
  { title: 'คอลัมน์', dataIndex: 'field', key: 'field', width: 140 },
  { title: 'ปัญหา', dataIndex: 'message', key: 'message' },
]

export default function RenewalImport() {
  const { message, modal } = App.useApp()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async (mode: 'preview' | 'commit'): Promise<{ status: number; body: ImportResponseBody } | null> => {
    if (!file) return null
    const form = new FormData()
    form.append('file', file)
    form.append('mode', mode)
    try {
      const res = await fetch('/api/renewals/import', { method: 'POST', body: form })
      let isJson = true
      const body = (await res.json().catch(() => {
        isJson = false
        return {}
      })) as ImportResponseBody
      if (handleSessionExpired(res, isJson)) {
        message.error(SESSION_EXPIRED_ERROR)
        return null
      }
      return { status: res.status, body }
    } catch {
      message.error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      return null
    }
  }

  const runPreview = async () => {
    setBusy(true)
    const res = await send('preview')
    setBusy(false)
    if (!res) return
    if (res.status !== 200) {
      setPreview(null)
      message.error(res.body.error || 'ตรวจสอบไฟล์ไม่สำเร็จ')
      return
    }
    setPreview(res.body as ImportPreviewResponse)
  }

  const addUnknownInsurers = () => {
    if (!preview) return
    modal.confirm({
      title: 'เพิ่มบริษัทประกัน',
      content: preview.unknownInsurers.join(', '),
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: async () => {
        const res = await sendJson('/api/renewals/insurers', { names: preview.unknownInsurers })
        if (!res.ok) {
          message.error(res.error)
          return
        }
        message.success('เพิ่มบริษัทประกันสำเร็จ')
        await runPreview()
      },
    })
  }

  const runCommit = () => {
    modal.confirm({
      title: 'ยืนยันนำเข้า',
      content: 'บันทึกข้อมูลทั้งไฟล์เข้าระบบ',
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: async () => {
        setBusy(true)
        const res = await send('commit')
        setBusy(false)
        if (!res) return
        if (res.status !== 201 || !res.body.summary) {
          message.error(res.body.error || 'นำเข้าไม่สำเร็จ — ตรวจสอบไฟล์อีกครั้ง')
          if (res.body.errors) setPreview(res.body as ImportPreviewResponse)
          return
        }
        message.success(`นำเข้าสำเร็จ: ${describeSummary(res.body.summary)}`)
        setPreview(null)
        setFile(null)
      },
    })
  }

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>นำเข้า Excel</h2>
        <Button icon={<DownloadOutlined />} href="/api/renewals/import/template" data-testid="import-template-btn">
          ดาวน์โหลด template
        </Button>
      </div>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space>
          <Upload
            accept=".xlsx"
            maxCount={1}
            fileList={file ? [{ uid: 'import-file', name: file.name, status: 'done' }] : []}
            beforeUpload={(f) => {
              setFile(f)
              setPreview(null)
              return false
            }}
            onRemove={() => {
              setFile(null)
              setPreview(null)
            }}
          >
            <Button icon={<UploadOutlined />} data-testid="import-select-btn">
              เลือกไฟล์ .xlsx
            </Button>
          </Upload>
          <Button type="primary" disabled={!file} loading={busy} onClick={runPreview} data-testid="import-preview-btn">
            ตรวจสอบไฟล์
          </Button>
        </Space>

        {preview && (
          <>
            <Descriptions
              size="small"
              bordered
              column={{ xs: 1, md: 5 }}
              items={SUMMARY_LABELS.map(([key, label]) => ({
                key,
                label,
                children: <span data-testid={`import-summary-${key}`}>{preview.summary[key]}</span>,
              }))}
            />
            {preview.unknownInsurers.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`บริษัทประกันที่ยังไม่มีในระบบ: ${preview.unknownInsurers.join(', ')}`}
                action={
                  <Button size="small" onClick={addUnknownInsurers} data-testid="import-add-insurers-btn">
                    เพิ่มบริษัทประกันที่ยังไม่มี ({preview.unknownInsurers.length} ราย)
                  </Button>
                }
              />
            )}
            {preview.valid ? (
              <Alert type="success" showIcon message="ไฟล์ถูกต้อง พร้อมนำเข้า" />
            ) : (
              <Table
                size="small"
                rowKey={(e) => `${e.sheet}-${e.row}-${e.field}-${e.message}`}
                dataSource={preview.errors}
                columns={errorColumns}
                pagination={{ pageSize: 50 }}
              />
            )}
            <Button type="primary" disabled={!preview.valid} loading={busy} onClick={runCommit} data-testid="import-commit-btn">
              ยืนยันนำเข้า
            </Button>
          </>
        )}
      </Space>
    </>
  )
}
