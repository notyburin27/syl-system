'use client'

import { useMemo, useState } from 'react'
import { Modal, Select, Button, Upload, Table, Alert, App, Space, Typography, Divider } from 'antd'
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons'
import {
  displayRangeLabel,
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
  const [parsing, setParsing] = useState(false)

  const selectionReady = !!customerId && !!factoryLocationId

  // ข้อมูลเดิมของลูกค้า+โรงงานที่เลือก (เฉพาะ rate ที่มีช่วงราคาน้ำมัน)
  const existingRates = useMemo(
    () =>
      rates.filter(
        (r) => r.customerId === customerId && r.factoryLocationId === factoryLocationId && r.fuelSurcharges.length > 0
      ),
    [rates, customerId, factoryLocationId]
  )

  // ไฟล์สร้างฝั่ง server — ไม่ต้องโหลด xlsx (~400KB) มาที่เครื่องผู้ใช้
  const handleDownloadCurrent = () => {
    if (!selectionReady) return
    const params = new URLSearchParams({ customerId: customerId!, factoryLocationId: factoryLocationId! })
    window.location.href = `/api/rates/income/fuel-table/export?${params}`
  }

  const handleDownloadTemplate = () => {
    window.location.href = '/api/rates/income/fuel-table/export?template=1'
  }

  const handleFile = async (f: File) => {
    setParsing(true)
    try {
      const formData = new FormData()
      formData.append('file', f)
      const res = await fetch('/api/rates/income/fuel-table/parse', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setFile(null)
        setParsed(null)
        message.error(data.error || 'อ่านไฟล์ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx')
        return false
      }
      setFile(f)
      setParsed(data as ParseFuelRateResult)
    } catch {
      setFile(null)
      setParsed(null)
      message.error('อ่านไฟล์ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx')
    } finally {
      setParsing(false)
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

  // ข้อมูลปัจจุบันแตกเป็นแถวละช่วง — แสดงทันทีหลังเลือกลูกค้า+โรงงาน (ซ่อนเมื่อแนบไฟล์)
  const currentRows = useMemo(
    () =>
      existingRates.flatMap((r) => {
        const sorted = [...r.fuelSurcharges].sort((a, b) => Number(a.fuelPriceMin) - Number(b.fuelPriceMin))
        return sorted.map((s, i) => ({
          key: s.id,
          jobType: r.jobType,
          size: r.size,
          rangeLabel: displayRangeLabel(s.fuelPriceMin, s.fuelPriceMax),
          income: Number(r.income) + Number(s.surcharge),
          isBase: i === 0,
        }))
      }),
    [existingRates]
  )

  const currentColumns = [
    { title: 'ลักษณะงาน', dataIndex: 'jobType', render: (v: string) => getJobTypeLabel(v) },
    { title: 'SIZE', dataIndex: 'size' },
    { title: 'ช่วงราคาน้ำมัน (บาท/ลิตร)', dataIndex: 'rangeLabel' },
    {
      title: 'ค่าขนส่ง (บาท)',
      dataIndex: 'income',
      align: 'right' as const,
      render: (v: number, r: { isBase: boolean }) => (
        <>
          {v.toLocaleString()}
          {r.isBase && <Typography.Text type="secondary" style={{ fontSize: 12 }}> (ราคาฐาน)</Typography.Text>}
        </>
      ),
    },
  ]

  // แตกเป็นแถวละช่วง ให้ตรงกับไฟล์ที่ upload (ตรวจสายตาได้ทันที)
  const previewRows = useMemo(() => {
    if (!parsed || !parsed.ok) return []
    return parsed.rates.flatMap((rate) =>
      rate.ranges.map((range, i) => ({
        key: `${rate.jobType}|${rate.size}|${range.fuelPriceMin}`,
        jobType: rate.jobType,
        size: rate.size,
        rangeLabel: `${range.fuelPriceMin.toFixed(2)}-${range.fuelPriceMax.toFixed(2)}`,
        income: range.income,
        isBase: i === 0, // ช่วงต่ำสุด = ราคาฐาน
        baseIncome: rate.baseIncome,
      }))
    )
  }, [parsed])

  type PreviewRow = (typeof previewRows)[number]

  const previewColumns = [
    { title: 'ลักษณะงาน', dataIndex: 'jobType', render: (v: string) => getJobTypeLabel(v) },
    { title: 'SIZE', dataIndex: 'size' },
    { title: 'ช่วงราคาน้ำมัน (บาท/ลิตร)', dataIndex: 'rangeLabel' },
    {
      title: 'ค่าขนส่ง (บาท)',
      dataIndex: 'income',
      align: 'right' as const,
      render: (v: number, r: PreviewRow) => (
        <>
          {v.toLocaleString()}
          {r.isBase && <Typography.Text type="secondary" style={{ fontSize: 12 }}> (ราคาฐาน)</Typography.Text>}
        </>
      ),
    },
  ]

  return (
    <Modal
      title="Upload ตารางราคาตามน้ำมัน"
      open={open}
      onCancel={handleClose}
      width={960}
      okText="บันทึก"
      cancelText="ยกเลิก"
      onOk={handleSubmit}
      confirmLoading={submitting}
      okButtonProps={{ disabled: !selectionReady || !parsed || !parsed.ok || parsing, 'data-testid': 'fuel-upload-save-btn' } as { disabled: boolean; 'data-testid': string }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
          {selectionReady &&
            (existingRates.length > 0 ? (
              <Button icon={<DownloadOutlined />} onClick={handleDownloadCurrent} data-testid="fuel-upload-download-current-btn">
                ดาวน์โหลดข้อมูลปัจจุบัน (แก้แล้วอัปโหลดกลับ)
              </Button>
            ) : (
              <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} data-testid="fuel-upload-download-template-btn">
                ดาวน์โหลด Template
              </Button>
            ))}
        </div>

        {selectionReady && (
          <>
            {!file && (
              <>
                <Divider style={{ margin: '4px 0' }}>ข้อมูลปัจจุบัน</Divider>
                {currentRows.length > 0 ? (
                  <Table
                    columns={currentColumns}
                    dataSource={currentRows}
                    rowKey="key"
                    size="small"
                    pagination={false}
                    scroll={{ y: 320 }}
                  />
                ) : (
                  <Typography.Text type="secondary">
                    ยังไม่มีช่วงราคาน้ำมันของลูกค้า+โรงงานนี้ — ดาวน์โหลด Template เพื่อเริ่มกรอกได้เลย
                  </Typography.Text>
                )}
              </>
            )}

            <Upload.Dragger accept=".xlsx,.xls" maxCount={1} showUploadList={!!file} disabled={parsing} beforeUpload={handleFile} onRemove={() => { setFile(null); setParsed(null) }}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{parsing ? 'กำลังอ่านไฟล์...' : 'คลิกหรือลากไฟล์ Excel มาวางที่นี่'}</p>
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
                  dataSource={previewRows}
                  rowKey="key"
                  size="small"
                  pagination={false}
                  scroll={{ y: 320 }}
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
