'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Statistic, Row, Col, Table, DatePicker, App } from 'antd'
import {
  ShoppingOutlined,
  DollarOutlined,
  RiseOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { MonthlySummary } from '@/types/stock'
import dayjs from 'dayjs'

export default function StockDashboardPage() {
  const { message } = App.useApp()
  const [summary, setSummary] = useState<MonthlySummary & { productCount?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(dayjs())

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/stock/summary?year=${selectedMonth.year()}&month=${selectedMonth.month() + 1}`
      )
      if (res.ok) setSummary(await res.json())
    } catch {
      message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, message])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const detailColumns: ColumnsType<MonthlySummary['details'][0]> = [
    {
      title: 'สินค้า',
      dataIndex: 'productName',
      key: 'productName',
    },
    {
      title: 'จำนวนขาย',
      dataIndex: 'quantitySold',
      key: 'quantitySold',
      align: 'right',
    },
    {
      title: 'ยอดขาย (บาท)',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'จำนวนซื้อ',
      dataIndex: 'quantityPurchased',
      key: 'quantityPurchased',
      align: 'right',
    },
    {
      title: 'ต้นทุน (บาท)',
      dataIndex: 'cost',
      key: 'cost',
      render: (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      align: 'right',
    },
    {
      title: 'กำไร (บาท)',
      key: 'profit',
      render: (_, record) => {
        const profit = record.revenue - record.cost
        return (
          <span style={{ color: profit >= 0 ? '#3f8600' : '#cf1322', fontWeight: 500 }}>
            {profit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </span>
        )
      },
      align: 'right',
    },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>ภาพรวมคลังสินค้า</h2>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="จำนวนสินค้า"
              value={summary?.productCount ?? 0}
              prefix={<ShoppingOutlined />}
              suffix="รายการ"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="ยอดขายเดือนนี้"
              value={summary?.revenue ?? 0}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="บาท"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="กำไรเดือนนี้"
              value={summary?.profit ?? 0}
              precision={2}
              prefix={<RiseOutlined />}
              suffix="บาท"
              valueStyle={{ color: (summary?.profit ?? 0) >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="ยอดค้างชำระรวม"
              value={summary?.totalOutstanding ?? 0}
              precision={2}
              prefix={<WarningOutlined />}
              suffix="บาท"
              valueStyle={{ color: (summary?.totalOutstanding ?? 0) > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="สรุปกำไรรายเดือน"
        extra={
          <DatePicker
            picker="month"
            value={selectedMonth}
            onChange={(date) => date && setSelectedMonth(date)}
            format="MM/YYYY"
          />
        }
      >
        <Table
          columns={detailColumns}
          dataSource={summary?.details ?? []}
          rowKey="productId"
          loading={loading}
          pagination={false}
          summary={() => {
            if (!summary || summary.details.length === 0) return null
            return (
              <Table.Summary.Row style={{ fontWeight: 'bold' }}>
                <Table.Summary.Cell index={0}>รวมทั้งหมด</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  {summary.details.reduce((s, d) => s + d.quantitySold, 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  {summary.revenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  {summary.details.reduce((s, d) => s + d.quantityPurchased, 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  {summary.cost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <span style={{ color: summary.profit >= 0 ? '#3f8600' : '#cf1322' }}>
                    {summary.profit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }}
        />
      </Card>
    </div>
  )
}
