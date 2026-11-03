'use client'

import { useEffect, useState } from 'react'
import { Alert, App, InputNumber, Modal, Table, Typography } from 'antd'
import type { IncomeGroup, WageGroup, PricedRange } from '@/lib/utils/missingRates'
import { getJobTypeLabel } from '@/types/job'

const fmt = (n: number) => n.toFixed(2)

async function postJson(url: string, body: unknown): Promise<{ filled: number } | { error: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'เกิดข้อผิดพลาดในการบันทึก' }
    return data
  } catch {
    return { error: 'เกิดข้อผิดพลาดในการบันทึก' }
  }
}

interface IncomeProps {
  group: IncomeGroup | null
  onClose: () => void
  onSaved: (filled: number) => void
}

export function MissingIncomeRateModal({ group, onClose, onSaved }: IncomeProps) {
  const { message } = App.useApp()
  const [prices, setPrices] = useState<(number | null)[]>([])
  const [basePrice, setBasePrice] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPrices(group ? group.suggestedRanges.map(() => null) : [])
    setBasePrice(null)
  }, [group])

  const missingFuelCount = group ? group.jobs.filter((j) => j.fuelPrice === null).length : 0

  const handleOk = async () => {
    if (!group) return
    if (prices.some((p) => p === null) || (group.hasMissingFuelPrice && basePrice === null)) {
      message.error('กรุณากรอกราคาให้ครบทุกช่อง')
      return
    }
    const ranges: PricedRange[] = group.suggestedRanges.map((r, i) => ({ ...r, price: prices[i] as number }))
    setSaving(true)
    const result = await postJson('/api/rates/missing/income', {
      jobType: group.jobType,
      size: group.size,
      factoryLocationId: group.factoryLocationId,
      customerId: group.customerId,
      ranges,
      basePrice: group.hasMissingFuelPrice ? basePrice : null,
    })
    setSaving(false)
    if ('error' in result) {
      message.error(result.error)
      return
    }
    message.success(`บันทึกและเติมค่าขนส่ง ${result.filled} งาน`)
    onSaved(result.filled)
  }

  const rows = group
    ? group.suggestedRanges.map((r, i) => ({
        idx: i,
        range: r,
        count: group.jobs.filter((j) => j.fuelPrice !== null && r.fuelPriceMin <= j.fuelPrice && j.fuelPrice < r.fuelPriceMax).length,
      }))
    : []

  return (
    <Modal
      title="ตั้งค่าขนส่ง"
      open={!!group}
      onCancel={onClose}
      onOk={handleOk}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      destroyOnClose
    >
      {group && (
        <>
          <Typography.Paragraph>
            {group.customerName} · {group.factoryName} · {getJobTypeLabel(group.jobType)} · {group.size} · {group.jobs.length} งาน
          </Typography.Paragraph>
          {group.hasMissingFuelPrice && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`มี ${missingFuelCount} งานที่ไม่มีราคาน้ำมัน ณ วันงาน — ใช้ราคาฐาน`}
            />
          )}
          {rows.length > 0 && (
            <Table
              size="small"
              pagination={false}
              rowKey="idx"
              dataSource={rows}
              columns={[
                { title: 'ราคาน้ำมัน', key: 'range', render: (_: unknown, r) => `${fmt(r.range.fuelPriceMin)} – ${fmt(r.range.fuelPriceMax)}` },
                { title: 'จำนวน job', key: 'count', align: 'right' as const, width: 100, render: (_: unknown, r) => r.count },
                {
                  title: 'ราคา', key: 'price', width: 140,
                  render: (_: unknown, r) => (
                    <InputNumber
                      data-testid={`missing-range-price-${r.idx}`}
                      min={0}
                      style={{ width: '100%' }}
                      value={prices[r.idx] ?? null}
                      onChange={(v) => setPrices((prev) => prev.map((p, i) => (i === r.idx ? v : p)))}
                    />
                  ),
                },
              ]}
            />
          )}
          {group.hasMissingFuelPrice && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>ราคาฐาน</span>
              <InputNumber
                data-testid="missing-base-price"
                min={0}
                style={{ width: 160 }}
                value={basePrice}
                onChange={setBasePrice}
              />
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

interface WageProps {
  group: WageGroup | null
  onClose: () => void
  onSaved: (filled: number) => void
}

export function MissingWageRateModal({ group, onClose, onSaved }: WageProps) {
  const { message } = App.useApp()
  const [wage, setWage] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setWage(null)
  }, [group])

  const handleOk = async () => {
    if (!group) return
    if (wage === null) {
      message.error('กรุณากรอกค่าเที่ยว')
      return
    }
    setSaving(true)
    const result = await postJson('/api/rates/missing/driver-wage', {
      jobType: group.jobType,
      size: group.size,
      factoryLocationId: group.factoryLocationId,
      driverWage: wage,
    })
    setSaving(false)
    if ('error' in result) {
      message.error(result.error)
      return
    }
    message.success(`บันทึกและเติมค่าเที่ยว ${result.filled} งาน`)
    onSaved(result.filled)
  }

  return (
    <Modal
      title="ตั้งค่าเที่ยว"
      open={!!group}
      onCancel={onClose}
      onOk={handleOk}
      okText="บันทึก"
      cancelText="ยกเลิก"
      confirmLoading={saving}
      destroyOnClose
    >
      {group && (
        <>
          <Typography.Paragraph>
            {group.factoryName ?? '—'} · {getJobTypeLabel(group.jobType)} · {group.size} · {group.jobs.length} งาน
          </Typography.Paragraph>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>ค่าเที่ยว</span>
            <InputNumber
              data-testid="missing-wage-input"
              min={0}
              style={{ width: 160 }}
              value={wage}
              onChange={setWage}
            />
          </div>
        </>
      )}
    </Modal>
  )
}
