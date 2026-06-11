'use client'

import { Modal, Table, Typography } from 'antd'
import { displayRangeLabel, effectiveIncome } from '@/lib/utils/fuelRateExcel'

interface FuelSurcharge {
  id: string
  fuelPriceMin: number | string
  fuelPriceMax: number | string
  surcharge: number | string
}

interface FuelRateViewModalProps {
  open: boolean
  onClose: () => void
  rateLabel: string // เช่น "ขาเข้า / 20DC / โรงงาน ABC / บริษัท XYZ"
  baseIncome: number | string
  surcharges: FuelSurcharge[]
  fuelPrice: number | null // ราคาน้ำมันปัจจุบัน
}

export default function FuelRateViewModal({
  open,
  onClose,
  rateLabel,
  baseIncome,
  surcharges,
  fuelPrice,
}: FuelRateViewModalProps) {
  const sorted = [...surcharges].sort((a, b) => Number(a.fuelPriceMin) - Number(b.fuelPriceMin))

  const isCurrent = (s: FuelSurcharge) =>
    fuelPrice != null && fuelPrice >= Number(s.fuelPriceMin) && fuelPrice < Number(s.fuelPriceMax)

  const columns = [
    {
      title: 'ช่วงราคาน้ำมัน (บาท/ลิตร)',
      key: 'range',
      render: (_: unknown, s: FuelSurcharge) => displayRangeLabel(s.fuelPriceMin, s.fuelPriceMax),
    },
    {
      title: 'ค่าขนส่ง (บาท)',
      key: 'income',
      align: 'right' as const,
      render: (_: unknown, s: FuelSurcharge) =>
        (Number(baseIncome) + Number(s.surcharge)).toLocaleString(),
    },
  ]

  return (
    <Modal title="ช่วงราคาน้ำมัน" open={open} onCancel={onClose} footer={null} width={480}>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {rateLabel}
      </Typography.Text>
      <Table
        columns={columns}
        dataSource={sorted}
        rowKey="id"
        size="small"
        pagination={false}
        rowClassName={(s) => (isCurrent(s) ? 'ant-table-row-selected' : '')}
      />
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        {fuelPrice != null
          ? `⛽ ราคาน้ำมันปัจจุบัน ${fuelPrice.toFixed(2)} บาท/ลิตร → ค่าขนส่ง ${effectiveIncome({ income: baseIncome, fuelSurcharges: surcharges }, fuelPrice).toLocaleString()} บาท (แถวที่ไฮไลต์)`
          : 'ยังไม่มีบันทึกราคาน้ำมัน — ใช้ราคาฐาน'}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
        * แก้ไขข้อมูลโดยการ Upload Excel ทับเท่านั้น
      </Typography.Text>
    </Modal>
  )
}
