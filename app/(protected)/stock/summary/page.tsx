'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, Statistic, Row, Col, Table, DatePicker, Tag, App } from 'antd'
import { DollarOutlined, RiseOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { ReceiptMonthlySummary } from '@/types/stock'
import dayjs from 'dayjs'

const money = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const profitColor = (v: number) => (v >= 0 ? '#3f8600' : '#cf1322')

export default function StockMonthlySummaryPage() {
  const { message } = App.useApp()
  const [summary, setSummary] = useState<ReceiptMonthlySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(dayjs())

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/stock/summary/receipts?year=${selectedMonth.year()}&month=${selectedMonth.month() + 1}`
      )
      if (res.ok) setSummary(await res.json())
      else message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } catch {
      message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, message])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const productColumns: ColumnsType<ReceiptMonthlySummary['details'][0]> = [
    {
      title: 'สินค้า',
      dataIndex: 'productName',
      key: 'productName',
      render: (name: string, record) => (
        <>
          {name} {record.isRice ? <Tag color="gold">ข้าวสาร</Tag> : <Tag>สินค้า</Tag>}
        </>
      ),
    },
    { title: 'จำนวนขาย', dataIndex: 'quantity', key: 'quantity', align: 'right' },
    { title: 'ยอดขาย (บาท)', dataIndex: 'revenue', key: 'revenue', render: money, align: 'right' },
    { title: 'ต้นทุนขาย (บาท)', dataIndex: 'cost', key: 'cost', render: money, align: 'right' },
    {
      title: 'กำไร (บาท)',
      dataIndex: 'profit',
      key: 'profit',
      render: (v: number) => <span style={{ color: profitColor(v), fontWeight: 500 }}>{money(v)}</span>,
      align: 'right',
    },
  ]

  const invoiceColumns: ColumnsType<ReceiptMonthlySummary['invoices'][0]> = [
    {
      title: 'ครบกำหนดชำระ',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
    },
    { title: 'ลูกค้า', dataIndex: 'buyerName', key: 'buyerName' },
    { title: 'ยอดรวม (บาท)', dataIndex: 'totalAmount', key: 'totalAmount', render: money, align: 'right' },
    {
      title: 'สถานะ',
      key: 'status',
      render: (_, record) =>
        record.isPaid ? <Tag color="green">ชำระแล้ว</Tag> : <Tag color="red">ค้างชำระ</Tag>,
    },
    {
      title: '',
      key: 'print',
      render: (_, record) => <Link href={`/stock/invoices/${record.id}/print`} target="_blank">ดูใบเสร็จ</Link>,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>สรุปยอดขายรายเดือน</h2>
        <DatePicker
          id="receipt-summary-month"
          picker="month"
          value={selectedMonth}
          onChange={(date) => date && setSelectedMonth(date)}
          format="MM/YYYY"
          allowClear={false}
        />
      </div>
      <p style={{ color: '#888', marginTop: 0 }}>อ้างอิงจากใบเสร็จที่วันครบกำหนดชำระอยู่ในเดือนที่เลือก</p>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="1 1 200px">
          <Card loading={loading}>
            <Statistic
              title="ขายได้ทั้งหมด"
              value={summary?.revenue ?? 0}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="บาท"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col flex="1 1 200px">
          <Card loading={loading}>
            <Statistic
              title="กำไรทั้งหมด"
              value={summary?.profit ?? 0}
              precision={2}
              prefix={<RiseOutlined />}
              suffix="บาท"
              valueStyle={{ color: profitColor(summary?.profit ?? 0) }}
            />
          </Card>
        </Col>
        <Col flex="1 1 200px">
          <Card loading={loading}>
            <Statistic
              title="กำไรสินค้า"
              value={summary?.productProfit ?? 0}
              precision={2}
              prefix={<RiseOutlined />}
              suffix="บาท"
              valueStyle={{ color: profitColor(summary?.productProfit ?? 0) }}
            />
          </Card>
        </Col>
        <Col flex="1 1 200px">
          <Card loading={loading}>
            <Statistic
              title="กำไรข้าวสาร"
              value={summary?.riceProfit ?? 0}
              precision={2}
              prefix={<RiseOutlined />}
              suffix="บาท"
              valueStyle={{ color: profitColor(summary?.riceProfit ?? 0) }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="แยกตามสินค้า" style={{ marginBottom: 24 }}>
        <Table
          columns={productColumns}
          dataSource={summary?.details ?? []}
          rowKey="productId"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Card title={`ใบเสร็จในเดือนนี้ (${summary?.invoices.length ?? 0} ใบ)`}>
        <Table
          columns={invoiceColumns}
          dataSource={summary?.invoices ?? []}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  )
}
