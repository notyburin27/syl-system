'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Button, Card, Empty, Modal, Segmented, Spin, Statistic, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { IncomeGroup, MissingJobView, MissingRatesData, MissingStatus, WageGroup } from '@/lib/utils/missingRates'
import { getJobTypeLabel } from '@/types/job'
import { toThaiMonthYear, toThaiShortDate } from '@/lib/utils/thaiDate'
import { MissingIncomeRateModal, MissingWageRateModal } from '@/components/jobs/MissingRateModals'

type Tab = 'income' | 'wage'
type StatusFilter = 'all' | MissingStatus

const STATUS_TAG: Record<MissingStatus, { color: string; label: string }> = {
  noRate: { color: 'orange', label: 'ไม่มีอัตรา' },
  hasRate: { color: 'blue', label: 'มีอัตราแล้ว' },
  incomplete: { color: 'gold', label: 'ข้อมูลไม่ครบ' },
}

const FIELD_LABEL = { customer: 'ลูกค้า', factory: 'โรงงาน', size: 'SIZE' } as const

const jobCount = (groups: { status: MissingStatus; jobs: unknown[] }[], status: MissingStatus) =>
  groups.filter((g) => g.status === status).reduce((s, g) => s + g.jobs.length, 0)

const fmtFuel = (min: number | null, max: number | null) => {
  if (min === null || max === null) return '-'
  return min === max ? min.toFixed(2) : `${min.toFixed(2)}–${max.toFixed(2)}`
}

export default function MissingRatesDashboard() {
  const { message } = App.useApp()
  const [data, setData] = useState<MissingRatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('income')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [jobsOf, setJobsOf] = useState<MissingJobView[] | null>(null)
  const [incomeGroup, setIncomeGroup] = useState<IncomeGroup | null>(null)
  const [wageGroup, setWageGroup] = useState<WageGroup | null>(null)
  const [fillingKey, setFillingKey] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rates/missing')
      const body = await res.json()
      if (!res.ok) {
        message.error(body.error || 'เกิดข้อผิดพลาดในการดึงข้อมูล')
        return
      }
      setData(body)
    } catch {
      message.error('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const income = useMemo(() => data?.income ?? [], [data])
  const wage = useMemo(() => data?.driverWage ?? [], [data])

  const fill = async (key: string, body: Record<string, unknown>) => {
    setFillingKey(key)
    try {
      const res = await fetch('/api/rates/missing/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) {
        message.error(result.error || 'เกิดข้อผิดพลาดในการเติมค่า')
        return
      }
      message.success(`เติมค่า ${result.filled} งาน`)
      fetchData()
    } catch {
      message.error('เกิดข้อผิดพลาดในการเติมค่า')
    } finally {
      setFillingKey(null)
    }
  }

  const jobsBtn = (jobs: MissingJobView[]) => (
    <Button type="link" size="small" style={{ padding: 0 }} data-testid="missing-jobs-btn" onClick={() => setJobsOf(jobs)}>
      {jobs.length} งาน
    </Button>
  )

  const statusCol = {
    title: 'สถานะ', dataIndex: 'status', key: 'status', width: 130,
    render: (v: MissingStatus) => <Tag color={STATUS_TAG[v].color}>{STATUS_TAG[v].label}</Tag>,
  }

  const incompleteText = (fields: (keyof typeof FIELD_LABEL)[], only: (keyof typeof FIELD_LABEL)[]) => {
    const shown = fields.filter((f) => only.includes(f))
    if (shown.length === 0) return null
    return (
      <Typography.Text type="warning">
        job กรอกข้อมูลไม่ครบ (ไม่มี {shown.map((f) => FIELD_LABEL[f]).join('/')})
      </Typography.Text>
    )
  }

  const incomeColumns = [
    { title: 'ลูกค้า', key: 'customer', render: (_: unknown, g: IncomeGroup) => g.customerName ?? '—' },
    { title: 'โรงงาน', key: 'factory', render: (_: unknown, g: IncomeGroup) => g.factoryName ?? '—' },
    { title: 'ลักษณะงาน', key: 'jobType', render: (_: unknown, g: IncomeGroup) => getJobTypeLabel(g.jobType) },
    { title: 'SIZE', key: 'size', width: 80, render: (_: unknown, g: IncomeGroup) => g.size ?? '—' },
    { title: 'จำนวน job', key: 'count', align: 'right' as const, width: 100, render: (_: unknown, g: IncomeGroup) => jobsBtn(g.jobs) },
    { title: 'ราคาน้ำมัน', key: 'fuel', align: 'right' as const, width: 130, render: (_: unknown, g: IncomeGroup) => fmtFuel(g.fuelPriceMin, g.fuelPriceMax) },
    statusCol,
    {
      title: '', key: 'action', align: 'right' as const, width: 260,
      render: (_: unknown, g: IncomeGroup) => {
        if (g.status === 'noRate') {
          return <Button size="small" data-testid="missing-setup-btn" onClick={() => setIncomeGroup(g)}>ตั้งค่า</Button>
        }
        if (g.status === 'hasRate') {
          return (
            <Button
              size="small"
              type="primary"
              data-testid="missing-fill-btn"
              loading={fillingKey === g.key}
              onClick={() =>
                fill(g.key, {
                  kind: 'income', jobType: g.jobType, size: g.size,
                  factoryLocationId: g.factoryLocationId, customerId: g.customerId,
                })
              }
            >
              เติมเลย
            </Button>
          )
        }
        return incompleteText(g.missingFields, ['customer', 'factory', 'size'])
      },
    },
  ]

  const wageColumns = [
    { title: 'โรงงาน', key: 'factory', render: (_: unknown, g: WageGroup) => g.factoryName ?? '—' },
    { title: 'ลักษณะงาน', key: 'jobType', render: (_: unknown, g: WageGroup) => getJobTypeLabel(g.jobType) },
    { title: 'SIZE', key: 'size', width: 80, render: (_: unknown, g: WageGroup) => g.size ?? '—' },
    { title: 'จำนวน job', key: 'count', align: 'right' as const, width: 100, render: (_: unknown, g: WageGroup) => jobsBtn(g.jobs) },
    statusCol,
    {
      title: '', key: 'action', align: 'right' as const, width: 260,
      render: (_: unknown, g: WageGroup) => {
        if (g.status === 'noRate') {
          return <Button size="small" data-testid="missing-setup-btn" onClick={() => setWageGroup(g)}>ตั้งค่า</Button>
        }
        if (g.status === 'hasRate') {
          return (
            <Button
              size="small"
              type="primary"
              data-testid="missing-fill-btn"
              loading={fillingKey === g.key}
              onClick={() =>
                fill(g.key, {
                  kind: 'driverWage', jobType: g.jobType, size: g.size,
                  factoryLocationId: g.factoryLocationId,
                })
              }
            >
              เติมเลย
            </Button>
          )
        }
        return incompleteText(g.missingFields, ['factory', 'size'])
      },
    },
  ]

  const jobColumns = [
    { title: 'เลขงาน', dataIndex: 'jobNumber', key: 'jobNumber' },
    { title: 'วันที่', dataIndex: 'jobDate', key: 'jobDate', render: (v: string) => toThaiShortDate(v) },
    { title: 'คนขับ', dataIndex: 'driverName', key: 'driverName', render: (v: string | null) => v ?? '—' },
    { title: 'เบอร์รถ', dataIndex: 'vehicleNumber', key: 'vehicleNumber', render: (v: string | null) => v ?? '—' },
    { title: 'ราคาน้ำมัน', dataIndex: 'fuelPrice', key: 'fuelPrice', align: 'right' as const, render: (v: number | null) => (v === null ? '-' : v.toFixed(2)) },
  ]

  const filterGroups = <T extends { status: MissingStatus }>(groups: T[]) =>
    filter === 'all' ? groups : groups.filter((g) => g.status === filter)

  const isEmpty = !!data && income.length === 0 && wage.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          ค่าที่ยังขาด{data ? ` · ${toThaiMonthYear(data.month)}` : ''}
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} data-testid="missing-refresh-btn">
          รีเฟรช
        </Button>
      </div>

      {!data ? (
        <Spin spinning={loading}><div style={{ minHeight: 120 }} /></Spin>
      ) : isEmpty ? (
        <Empty description="งานเดือนนี้มีค่าครบแล้ว" />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Card size="small" style={{ minWidth: 170 }} data-testid="missing-card-income">
              <Statistic title="ไม่มีค่าขนส่ง" value={jobCount(income, 'noRate')} suffix="งาน" />
            </Card>
            <Card size="small" style={{ minWidth: 170 }} data-testid="missing-card-wage">
              <Statistic title="ไม่มีค่าเที่ยว" value={jobCount(wage, 'noRate')} suffix="งาน" />
            </Card>
            <Card size="small" style={{ minWidth: 170 }} data-testid="missing-card-hasrate">
              <Statistic title="มีอัตราแล้ว ยังไม่เติม" value={jobCount(income, 'hasRate') + jobCount(wage, 'hasRate')} suffix="งาน" />
            </Card>
            <Card size="small" style={{ minWidth: 170 }} data-testid="missing-card-incomplete">
              <Statistic title="ข้อมูลไม่ครบ" value={jobCount(income, 'incomplete') + jobCount(wage, 'incomplete')} suffix="งาน" />
            </Card>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Segmented
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              options={[
                { value: 'income', label: `ค่าขนส่ง (${income.length} กลุ่ม)` },
                { value: 'wage', label: `ค่าเที่ยว (${wage.length} กลุ่ม)` },
              ]}
            />
            <Segmented
              value={filter}
              onChange={(v) => setFilter(v as StatusFilter)}
              options={[
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'noRate', label: 'ไม่มีอัตรา' },
                { value: 'hasRate', label: 'มีอัตราแล้ว' },
                { value: 'incomplete', label: 'ข้อมูลไม่ครบ' },
              ]}
            />
          </div>

          {tab === 'income' ? (
            <Table<IncomeGroup>
              size="small"
              rowKey="key"
              loading={loading}
              pagination={false}
              columns={incomeColumns}
              dataSource={filterGroups(income)}
            />
          ) : (
            <Table<WageGroup>
              size="small"
              rowKey="key"
              loading={loading}
              pagination={false}
              columns={wageColumns}
              dataSource={filterGroups(wage)}
            />
          )}
        </>
      )}

      <Modal title="รายการงาน" open={!!jobsOf} onCancel={() => setJobsOf(null)} footer={null} width={720} destroyOnClose>
        <Table<MissingJobView> size="small" rowKey="id" pagination={false} columns={jobColumns} dataSource={jobsOf ?? []} />
      </Modal>

      <MissingIncomeRateModal
        group={incomeGroup}
        onClose={() => setIncomeGroup(null)}
        onSaved={() => { setIncomeGroup(null); fetchData() }}
      />
      <MissingWageRateModal
        group={wageGroup}
        onClose={() => setWageGroup(null)}
        onSaved={() => { setWageGroup(null); fetchData() }}
      />
    </div>
  )
}
