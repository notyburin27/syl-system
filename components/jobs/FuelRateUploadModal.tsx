'use client'

import { useMemo, useState } from 'react'
import { Modal, Select, Button, Upload, Table, Alert, App, Space, Typography, Divider } from 'antd'
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import {
  parseFuelRateRows,
  buildFuelRateSheetRows,
  FUEL_RATE_TEMPLATE_ROWS,
  type ParseFuelRateResult,
} from '@/lib/utils/fuelRateExcel'
import { getJobTypeLabel } from '@/types/job'
import type { Customer, Location } from '@/types/job'

interface RateForUpload {
  id: string
  jobType: string
  size: string
  factoryLocationId: string
  customerId: string
  income: number | string
  fuelSurcharges: { id: string; fuelPriceMin: number | string; fuelPriceMax: number | string; surcharge: number | string }[]
}

interface FuelRateUploadModalProps {
  open: boolean
  onClose: () => void
  customers: Customer[]
  factoryLocations: Location[]
  rates: RateForUpload[] // ข้อมูลทั้งหมดจากหน้าหลัก ใช้หา "ข้อมูลเดิม" ของลูกค้า+โรงงานที่เลือก
  onSuccess: () => void
}

export default function FuelRateUploadModal({
  open,
  onClose,
  customers,
  factoryLocations,
  rates,
  onSuccess,
}: FuelRateUploadModalProps) {
  const { message } = App.useApp()
  const [customerId, setCustomerId] = useState<string>()
  const [factoryLocationId, setFactoryLocationId] = useState<string>()
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParseFuelRateResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectionReady = !!customerId && !!factoryLocationId

  // ข้อมูลเดิมของลูกค้า+โรงงานที่เลือก (เฉพาะ rate ที่มีช่วงราคาน้ำมัน)
  const existingRates = useMemo(
    () =>
      rates.filter(
        (r) => r.customerId === customerId && r.factoryLocationId === factoryLocationId && r.fuelSurcharges.length > 0
      ),
    [rates, customerId, factoryLocationId]
  )

  // rate ทั้งหมด (รวมไม่มีช่วง) ไว้นับ "สร้างใหม่/อัปเดต" ใน preview
  const existingRateKeys = useMemo(
    () =>
      new Set(
        rates
          .filter((r) => r.customerId === customerId && r.factoryLocationId === factoryLocationId)
          .map((r) => `${r.jobType}|${r.size}`)
      ),
    [rates, customerId, factoryLocationId]
  )

  const downloadXlsx = (rows: (string | number)[][], filename: string) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'fuel-rates')
    XLSX.writeFile(wb, filename)
  }

  const handleDownloadCurrent = () => downloadXlsx(buildFuelRateSheetRows(existingRates), 'fuel_rates_current.xlsx')
  const handleDownloadTemplate = () => downloadXlsx(FUEL_RATE_TEMPLATE_ROWS, 'fuel_rates_template.xlsx')

  const handleFile = async (f: File) => {
    try {
      const workbook = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = sheet ? (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]) : []
      setFile(f)
      setParsed(parseFuelRateRows(rows))
    } catch {
      setFile(null)
      setParsed(null)
      message.error('อ่านไฟล์ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx')
    }
    return false // ห้าม antd upload เอง
  }

  const handleSubmit = async () => {
    if (!file || !customerId || !factoryLocationId) return
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('customerId', customerId)
      formData.append('factoryLocationId', factoryLocationId)
      const res = await fetch('/api/rates/income/fuel-table/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || data.errors?.[0]?.message || 'เกิดข้อผิดพลาด')
        return
      }
      message.success(`บันทึกสำเร็จ — rate ใหม่ ${data.created} / อัปเดต ${data.updated} / ${data.rangeCount} ช่วงราคา`)
      handleClose()
      onSuccess()
    } catch {
      message.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setCustomerId(undefined)
    setFactoryLocationId(undefined)
    setFile(null)
    setParsed(null)
    onClose()
  }

  const previewColumns = [
    { title: 'ลักษณะงาน', dataIndex: 'jobType', render: (v: string) => getJobTypeLabel(v) },
    { title: 'SIZE', dataIndex: 'size' },
    { title: 'ราคาฐาน', dataIndex: 'baseIncome', align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: 'จำนวนช่วง', key: 'count', align: 'right' as const, render: (_: unknown, r: { ranges: unknown[] }) => r.ranges.length },
    {
      title: 'สถานะ',
      key: 'status',
      render: (_: unknown, r: { jobType: string; size: string }) =>
        existingRateKeys.has(`${r.jobType}|${r.size}`) ? 'อัปเดต' : 'สร้างใหม่',
    },
  ]

  return (
    <Modal
      title="Upload ตารางราคาตามน้ำมัน"
      open={open}
      onCancel={handleClose}
      width={680}
      okText="บันทึก"
      cancelText="ยกเลิก"
      onOk={handleSubmit}
      confirmLoading={submitting}
      okButtonProps={{ disabled: !selectionReady || !parsed || !parsed.ok, 'data-testid': 'fuel-upload-save-btn' } as { disabled: boolean; 'data-testid': string }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space wrap>
          <Select
            id="fuel-upload-customer"
            showSearch
            placeholder="เลือกลูกค้า"
            style={{ width: 220 }}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={customerId}
            onChange={(v) => { setCustomerId(v); setFile(null); setParsed(null) }}
            popupMatchSelectWidth={false}
          />
          <Select
            id="fuel-upload-factory"
            showSearch
            placeholder="เลือกโรงงาน"
            style={{ width: 220 }}
            options={factoryLocations.map((l) => ({ value: l.id, label: l.name }))}
            filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            value={factoryLocationId}
            onChange={(v) => { setFactoryLocationId(v); setFile(null); setParsed(null) }}
            popupMatchSelectWidth={false}
          />
        </Space>

        {selectionReady && (
          <>
            {existingRates.length > 0 ? (
              <Button icon={<DownloadOutlined />} onClick={handleDownloadCurrent} data-testid="fuel-upload-download-current-btn">
                ดาวน์โหลดข้อมูลปัจจุบัน (แก้แล้วอัปโหลดกลับ)
              </Button>
            ) : (
              <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} data-testid="fuel-upload-download-template-btn">
                ดาวน์โหลด Template
              </Button>
            )}

            <Upload.Dragger accept=".xlsx,.xls" maxCount={1} showUploadList={!!file} beforeUpload={handleFile} onRemove={() => { setFile(null); setParsed(null) }}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">คลิกหรือลากไฟล์ Excel มาวางที่นี่</p>
              <p className="ant-upload-hint">รูปแบบ: ลักษณะงาน | SIZE | ช่วงราคาน้ำมัน | ค่าขนส่ง (ราคาเต็มต่อช่วง)</p>
            </Upload.Dragger>

            {parsed && !parsed.ok && (
              <Alert
                type="error"
                message="ไฟล์มีข้อผิดพลาด — ยังไม่บันทึก"
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {parsed.errors.map((e, i) => (
                      <li key={i}>แถว {e.row}: {e.message}</li>
                    ))}
                  </ul>
                }
              />
            )}

            {parsed && parsed.ok && (
              <>
                <Divider style={{ margin: '4px 0' }}>Preview</Divider>
                <Alert
                  type="warning"
                  showIcon
                  message={`การบันทึกจะแทนที่ช่วงราคาน้ำมันเดิมทั้งหมดของลูกค้า+โรงงานนี้ (เดิมมี ${existingRates.length} rate ที่มีช่วงราคา)`}
                />
                <Table
                  columns={previewColumns}
                  dataSource={parsed.rates}
                  rowKey={(r) => `${r.jobType}|${r.size}`}
                  size="small"
                  pagination={false}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  * ราคาฐานของแต่ละแถว = ค่าขนส่งของช่วงราคาน้ำมันต่ำสุดในไฟล์
                </Typography.Text>
              </>
            )}
          </>
        )}
      </Space>
    </Modal>
  )
}
