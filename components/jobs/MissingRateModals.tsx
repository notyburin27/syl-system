'use client'

import { useEffect, useState } from 'react'
import { Alert, App, InputNumber, Modal, Table, Tag, Typography } from 'antd'
import { checkEditedRanges, type IncomeGroup, type WageGroup, type PricedRange } from '@/lib/utils/missingRates'
import { getJobTypeLabel } from '@/types/job'
import { fromStoredMax, toStoredMax } from '@/lib/utils/fuelRateExcel'

// ระยะห่างระหว่างส่วนต่าง ๆ ใน modal
const bodyStyle = { display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16, marginBottom: 8 } as const
const baht = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 })

// ช่องกรอกจำนวนเงิน: คั่นหลักพัน
const moneyInputProps = {
  min: 0,
  formatter: (v: string | number | undefined) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
  // ช่องว่างต้องคืน '' (rc-input-number มองเป็นค่าว่าง → onChange(null)); Number('') = 0 จะกลายเป็นราคา 0
  parser: (v: string | undefined) => {
    const t = (v ?? '').replace(/,/g, '').trim()
    return (t === '' ? '' : Number(t)) as unknown as number
  },
}

/** ข้อมูลกลุ่มเป็นตารางแถวเดียว — ไม่ส่ง customer (undefined) = ไม่มีคอลัมน์ลูกค้า (ค่าเที่ยวไม่ผูกลูกค้า) */
function GroupInfo(props: {
  customer?: string | null
  factory: string | null
  jobType: string
  size: string | null
}) {
  const columns = [
    ...(props.customer !== undefined ? [{ title: 'ลูกค้า', key: 'c', render: () => props.customer ?? '—' }] : []),
    { title: 'โรงงาน', key: 'f', render: () => props.factory ?? '—' },
    { title: 'ลักษณะงาน', key: 't', render: () => getJobTypeLabel(props.jobType) },
    { title: 'SIZE', key: 's', width: 90, render: () => props.size ?? '—' },
  ]
  return <Table size="small" pagination={false} rowKey="k" dataSource={[{ k: 'group' }]} columns={columns} />
}

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
  // ช่วงที่แสดง/แก้ใน modal: max แบบรวมขอบ (เช่น 42.00) — ตอนเก็บแปลงเป็น exclusive ด้วย toStoredMax
  const [edits, setEdits] = useState<{ min: number | null; max: number | null }[]>([])
  const [basePrice, setBasePrice] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPrices(group ? group.suggestedRanges.map(() => null) : [])
    setEdits(group ? group.suggestedRanges.map((r) => ({ min: r.fuelPriceMin, max: fromStoredMax(r.fuelPriceMax) })) : [])
    setBasePrice(null)
  }, [group])

  const missingFuelCount = group ? group.jobs.filter((j) => j.fuelPrice === null).length : 0
  const stored = edits.map((e) => ({ fuelPriceMin: e.min, fuelPriceMax: e.max === null ? null : toStoredMax(e.max) }))
  const rangeError = group ? checkEditedRanges(stored, group.jobs.map((j) => j.fuelPrice)) : null
  const setEdit = (idx: number, field: 'min' | 'max', v: number | null) =>
    setEdits((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: v } : e)))

  const handleOk = async () => {
    if (!group) return
    if (rangeError) {
      message.error(rangeError)
      return
    }
    if (prices.some((p) => p === null) || (group.hasMissingFuelPrice && basePrice === null)) {
      message.error('กรุณากรอกราคาให้ครบทุกช่อง')
      return
    }
    const ranges: PricedRange[] = stored.map((r, i) => ({
      fuelPriceMin: r.fuelPriceMin as number,
      fuelPriceMax: r.fuelPriceMax as number,
      price: prices[i] as number,
    }))
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
    message.success(`บันทึกและดึงข้อมูลค่าขนส่ง ${result.filled} งาน`)
    onSaved(result.filled)
  }

  const filled = prices.filter((p): p is number => p !== null)
  // ราคาฐานตาม buildIncomeRateData: กรอกเอง (กรณีมีงานไม่มีราคาน้ำมัน) หรือราคาต่ำสุดที่กรอก
  const base = group?.hasMissingFuelPrice ? basePrice : filled.length > 0 ? Math.min(...filled) : null

  const rows = group
    ? stored.map((r, i) => ({
        idx: i,
        count: r.fuelPriceMin === null || r.fuelPriceMax === null
          ? 0
          : group.jobs.filter((j) => j.fuelPrice !== null && r.fuelPriceMin! <= j.fuelPrice && j.fuelPrice < r.fuelPriceMax!).length,
      }))
    : []

  return (
    <Modal
      title="ตั้งค่าขนส่ง"
      width={640}
      open={!!group}
      onCancel={onClose}
      onOk={handleOk}
      okText={`บันทึกและดึงข้อมูล ${group?.jobs.length ?? 0} งาน`}
      cancelText="ยกเลิก"
      confirmLoading={saving}
      destroyOnHidden
    >
      {group && (
        <div style={bodyStyle}>
          <GroupInfo customer={group.customerName} factory={group.factoryName} jobType={group.jobType} size={group.size} />
          {group.hasMissingFuelPrice && (
            <Alert
              type="warning"
              showIcon
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
                {
                  title: 'ช่วงราคาน้ำมัน (บาท/ลิตร)', key: 'range',
                  render: (_: unknown, r) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <InputNumber
                        data-testid={`missing-range-min-${r.idx}`}
                        min={0}
                        precision={2}
                        style={{ width: 90 }}
                        value={edits[r.idx]?.min ?? null}
                        onChange={(v) => setEdit(r.idx, 'min', v)}
                      />
                      <span>–</span>
                      <InputNumber
                        data-testid={`missing-range-max-${r.idx}`}
                        min={0}
                        precision={2}
                        style={{ width: 90 }}
                        value={edits[r.idx]?.max ?? null}
                        onChange={(v) => setEdit(r.idx, 'max', v)}
                      />
                    </div>
                  ),
                },
                { title: 'งาน', key: 'count', align: 'right' as const, width: 60, render: (_: unknown, r) => r.count },
                {
                  title: 'ค่าขนส่ง', key: 'price', width: 170,
                  render: (_: unknown, r) => (
                    <InputNumber
                      data-testid={`missing-range-price-${r.idx}`}
                      {...moneyInputProps}
                      autoFocus={r.idx === 0}
                      style={{ width: '100%' }}
                      value={prices[r.idx] ?? null}
                      onChange={(v) => setPrices((prev) => prev.map((p, i) => (i === r.idx ? v : p)))}
                    />
                  ),
                },
                {
                  title: 'ส่วนต่าง', key: 'diff', align: 'right' as const, width: 80,
                  render: (_: unknown, r) => {
                    const p = prices[r.idx]
                    if (p === null || p === undefined || base === null) return <Typography.Text type="secondary">—</Typography.Text>
                    const d = p - base
                    if (d === 0) return <Tag color="blue" style={{ marginInlineEnd: 0 }}>ฐาน</Tag>
                    return <Typography.Text type={d < 0 ? 'danger' : undefined}>{d > 0 ? '+' : '−'}{baht(Math.abs(d))}</Typography.Text>
                  },
                },
              ]}
            />
          )}
          {rows.length > 0 && rangeError && <Alert type="error" showIcon message={rangeError} />}
          {group.hasMissingFuelPrice && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>ราคาฐาน (ใช้กับงานที่ไม่มีราคาน้ำมัน)</span>
              <InputNumber
                data-testid="missing-base-price"
                {...moneyInputProps}
                style={{ width: 170 }}
                value={basePrice}
                onChange={setBasePrice}
              />
            </div>
          )}
          {rows.length > 1 && (
            <Typography.Text type="secondary">
              {group.hasMissingFuelPrice
                ? 'ราคาฐานใช้กับงานที่ไม่มีราคาน้ำมัน แต่ละช่วงเก็บเป็นส่วนต่างจากราคาฐาน'
                : 'ช่วงที่ราคาต่ำสุดใช้เป็นราคาฐาน ช่วงอื่นเก็บเป็นส่วนต่างจากราคาฐาน'}
            </Typography.Text>
          )}
        </div>
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
    message.success(`บันทึกและดึงข้อมูลค่าเที่ยว ${result.filled} งาน`)
    onSaved(result.filled)
  }

  return (
    <Modal
      title="ตั้งค่าเที่ยว"
      width={640}
      open={!!group}
      onCancel={onClose}
      onOk={handleOk}
      okText={`บันทึกและดึงข้อมูล ${group?.jobs.length ?? 0} งาน`}
      cancelText="ยกเลิก"
      confirmLoading={saving}
      destroyOnHidden
    >
      {group && (
        <div style={bodyStyle}>
          <GroupInfo factory={group.factoryName} jobType={group.jobType} size={group.size} />
          <Table
            size="small"
            pagination={false}
            rowKey="k"
            dataSource={[{ k: 'all' }]}
            columns={[
              { title: 'งาน', key: 'count', render: () => `${group.jobs.length} งาน` },
              {
                title: 'ค่าเที่ยว', key: 'wage', width: 170,
                render: () => (
                  <InputNumber
                    data-testid="missing-wage-input"
                    {...moneyInputProps}
                    autoFocus
                    style={{ width: '100%' }}
                    value={wage}
                    onChange={setWage}
                  />
                ),
              },
              { title: '', key: 'pad', width: 80 },
            ]}
          />
        </div>
      )}
    </Modal>
  )
}
