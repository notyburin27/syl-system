'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { App, Button, Card, Descriptions, Result, Space, Spin, Table, Tabs, Tag, type TableColumnsType } from 'antd'
import { DeleteOutlined, EditOutlined, PaperClipOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons'
import {
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  NOT_RENEWED_REASON_LABELS,
  RENEWAL_STATUS_COLORS,
  RENEWAL_STATUS_LABELS,
  VEHICLE_STATUS_COLORS,
  VEHICLE_STATUS_LABELS,
  type CoverageTypeKey,
} from '@/lib/renewals/constants'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { CoverageDto, VehicleDetailResponse } from '@/types/renewals'
import { getJson, sendJson } from './api'
import AttachmentPanel from './AttachmentPanel'
import AttachmentsModal from './AttachmentsModal'
import CoverageFormModal from './CoverageFormModal'
import { useRenewalLookups } from './useRenewalLookups'
import VehicleFormModal from './VehicleFormModal'

const orDash = (v: string | null) => v ?? '-'
const countWithUnit = (v: number | null, unit: string) => (v === null ? null : `${v.toLocaleString('th-TH')} ${unit}`)

/** "6 สูบ 360 แรงม้า 3 เพลา" — ข้ามส่วนที่ไม่ได้กรอก */
function engineSize(v: { engineCylinders: number | null; engineHorsepower: number | null; axleCount: number | null }) {
  const parts = [countWithUnit(v.engineCylinders, 'สูบ'), countWithUnit(v.engineHorsepower, 'แรงม้า'), countWithUnit(v.axleCount, 'เพลา')]
  return parts.filter(Boolean).join(' ') || '-'
}

const money = (v: number | null) =>
  v === null ? '-' : v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function VehicleDetail({ id }: { id: string }) {
  const { message, modal } = App.useApp()
  const router = useRouter()
  const { insurers, vehicles, agents, reloadAgents } = useRenewalLookups()
  const [detail, setDetail] = useState<VehicleDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<CoverageTypeKey>('PRB')
  const [editingVehicle, setEditingVehicle] = useState(false)
  const [coverageForm, setCoverageForm] = useState<{ coverage: CoverageDto | null } | null>(null)
  const [attachmentsFor, setAttachmentsFor] = useState<CoverageDto | null>(null)
  /** เพิ่มทุกครั้งที่บันทึกฟอร์มรถ — ฟอร์มอาจอัปโหลดเอกสารสำเนารถมาด้วย */
  const [docsVersion, setDocsVersion] = useState(0)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    const res = await getJson<VehicleDetailResponse>(`/api/renewals/vehicles/${id}`)
    if (res.ok) {
      setDetail(res.data)
      setLoadError(null)
    } else {
      setLoadError(res.error)
      message.error(res.error)
    }
    setLoading(false)
  }, [id, message])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  const ownerOptions = useMemo(() => [...new Set(vehicles.map((v) => v.ownerName))], [vehicles])
  const typeOptions = useMemo(() => [...new Set(vehicles.map((v) => v.vehicleType))], [vehicles])

  const confirmAction = (title: string, content: string, okText: string, run: () => Promise<{ ok: boolean; error?: string }>, after: () => void) => {
    modal.confirm({
      title,
      content,
      okText,
      cancelText: 'ยกเลิก',
      okButtonProps: { danger: okText === 'ลบ' },
      onOk: async () => {
        const res = await run()
        if (res.ok) {
          message.success('บันทึกสำเร็จ')
          after()
        } else {
          message.error(res.error)
        }
      },
    })
  }

  const handleDeleteVehicle = () =>
    confirmAction('ลบรถ', detail?.vehicle.plate ?? '', 'ลบ', () => sendJson(`/api/renewals/vehicles/${id}`, undefined, 'DELETE'), () =>
      router.push('/renewals/vehicles'),
    )

  const handleDeleteCoverage = (c: CoverageDto) =>
    confirmAction(
      'ลบงวด',
      `${COVERAGE_TYPE_LABELS[c.type]} หมด ${toThaiShortDate(c.endDate)} — ถ้างวดนี้ต่อมาจากงวดก่อนหน้า งวดก่อนหน้าจะกลับเป็น "รอต่อ"${c.attachmentCount > 0 ? ` และไฟล์แนบ ${c.attachmentCount} ไฟล์จะถูกลบถาวร` : ''}`,
      'ลบ',
      () => sendJson(`/api/renewals/coverages/${c.id}`, undefined, 'DELETE'),
      fetchDetail,
    )

  const handleReopen = (c: CoverageDto) =>
    confirmAction('เปิดงวดนี้ใหม่', 'สถานะจะกลับเป็น "รอต่อ"', 'ยืนยัน', () => sendJson(`/api/renewals/coverages/${c.id}/reopen`), fetchDetail)

  const columns: TableColumnsType<CoverageDto> = [
    { title: 'วันเริ่ม', key: 'startDate', width: 90, render: (_, c) => toThaiShortDate(c.startDate) || '-' },
    { title: 'วันสิ้นสุด', key: 'endDate', width: 90, render: (_, c) => toThaiShortDate(c.endDate) },
    ...(activeType === 'TAX'
      ? []
      : [
          { title: 'บ.ประกัน', key: 'insurer', render: (_: unknown, c: CoverageDto) => c.insurerName ?? '-' },
          { title: 'ตัวแทน', key: 'agent', render: (_: unknown, c: CoverageDto) => c.agentName ?? '-' },
        ]),
    ...(activeType === 'MOTOR_INSURANCE'
      ? [
          { title: 'ชั้น', key: 'class', width: 70, render: (_: unknown, c: CoverageDto) => c.coverageClass ?? '-' },
          { title: 'หางคู่', key: 'paired', width: 120, render: (_: unknown, c: CoverageDto) => c.pairedPlate ?? '-' },
        ]
      : []),
    { title: 'เลขกรมธรรม์', key: 'policy', render: (_, c) => c.policyNumber ?? '-' },
    { title: 'เบี้ย/ภาษี', key: 'amount', width: 110, align: 'right', render: (_, c) => money(c.amount) },
    { title: 'ค่าบริการ', key: 'fee', width: 100, align: 'right', render: (_, c) => money(c.serviceFee) },
    {
      title: 'สถานะ',
      key: 'status',
      width: 170,
      render: (_, c) => (
        <Tag color={RENEWAL_STATUS_COLORS[c.renewalStatus]} data-testid={`coverage-status-${c.id}`}>
          {RENEWAL_STATUS_LABELS[c.renewalStatus]}
          {c.notRenewedReason ? ` (${NOT_RENEWED_REASON_LABELS[c.notRenewedReason]})` : ''}
        </Tag>
      ),
    },
    { title: 'หมายเหตุ', key: 'note', ellipsis: true, render: (_, c) => c.renewalNote },
    {
      title: 'ไฟล์',
      key: 'files',
      width: 70,
      render: (_, c) => (
        <Button size="small" icon={<PaperClipOutlined />} onClick={() => setAttachmentsFor(c)} data-testid={`attachments-btn-${c.id}`}>
          {c.attachmentCount}
        </Button>
      ),
    },
    {
      title: 'จัดการ',
      key: 'actions',
      width: 120,
      render: (_, c) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setCoverageForm({ coverage: c })} data-testid={`coverage-edit-btn-${c.id}`} />
          {c.renewalStatus === 'NOT_RENEWED' && (
            <Button type="link" size="small" icon={<RollbackOutlined />} onClick={() => handleReopen(c)} data-testid={`coverage-reopen-btn-${c.id}`} />
          )}
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteCoverage(c)} data-testid={`coverage-delete-btn-${c.id}`} />
        </Space>
      ),
    },
  ]

  if (!detail) {
    if (loading) return <Spin spinning />
    return (
      <Result
        status="warning"
        title={loadError ?? 'ไม่พบข้อมูลรถ'}
        extra={
          <Link href="/renewals/vehicles">
            <Button type="primary">กลับไปรายการรถ</Button>
          </Link>
        }
      />
    )
  }

  const { vehicle, coverages } = detail
  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Link href="/renewals/vehicles">← ทะเบียนรถ</Link>
          <h2 style={{ margin: 0 }}>{vehicle.plate}</h2>
          <Tag color={VEHICLE_STATUS_COLORS[vehicle.status]}>{VEHICLE_STATUS_LABELS[vehicle.status]}</Tag>
        </Space>
        <Space>
          <Button icon={<EditOutlined />} onClick={() => setEditingVehicle(true)} data-testid="vehicle-detail-edit-btn">
            แก้ไขรถ
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleDeleteVehicle} data-testid="vehicle-detail-delete-btn">
            ลบรถ
          </Button>
        </Space>
      </div>

      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, md: 3 }}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'registrationDate', label: 'วันที่จดทะเบียน', children: toThaiShortDate(vehicle.registrationDate) || '-' },
          { key: 'province', label: 'จังหวัด', children: orDash(vehicle.plateProvince) },
          { key: 'fleet', label: 'เบอร์รถ', children: orDash(vehicle.fleetNumber) },
          { key: 'owner', label: 'บริษัท', children: vehicle.ownerName },
          { key: 'type', label: 'ลักษณะรถ', children: vehicle.vehicleType },
          { key: 'brand', label: 'ยี่ห้อรถ', children: orDash(vehicle.brand) },
          { key: 'model', label: 'แบบ/รุ่น', children: orDash(vehicle.modelName) },
          { key: 'color', label: 'สีรถ', children: orDash(vehicle.color) },
          { key: 'chassis', label: 'เลขตัวรถ (คัสซี)', children: orDash(vehicle.chassisNumber) },
          { key: 'chassisPosition', label: 'ตำแหน่งคัสซี', children: orDash(vehicle.chassisPosition) },
          { key: 'engineNumber', label: 'เลขเครื่องยนต์', children: orDash(vehicle.engineNumber) },
          { key: 'engineSize', label: 'ขนาดเครื่องยนต์', children: engineSize(vehicle) },
          { key: 'weight', label: 'น้ำหนักตัวรถ (กก.)', children: vehicle.weightKg?.toLocaleString('th-TH') ?? '-' },
          { key: 'fuel', label: 'เชื้อเพลิง', children: orDash(vehicle.fuelType) },
          { key: 'statusDate', label: 'วันที่แจ้งสถานะ', children: toThaiShortDate(vehicle.statusDate) || '-' },
          { key: 'note', label: 'หมายเหตุ', children: orDash(vehicle.note) },
        ]}
      />

      <Card size="small" title="เอกสารสำเนารถ" style={{ marginBottom: 16 }} data-testid="vehicle-docs">
        <AttachmentPanel
          listUrl={`/api/renewals/vehicles/${vehicle.id}/attachments`}
          fileUrl={(a) => `/api/renewals/vehicle-attachments/${a.id}`}
          reloadKey={docsVersion}
        />
      </Card>

      <Tabs
        activeKey={activeType}
        onChange={(key) => setActiveType(key as CoverageTypeKey)}
        tabBarExtraContent={
          <Space size={4} wrap>
            {COVERAGE_TYPES.map((t) => (
              <Button
                key={t}
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  // สลับไปแท็บประเภทนั้นด้วย — ฟอร์มใช้ activeType และบันทึกแล้วเห็นงวดใหม่ทันที
                  setActiveType(t)
                  setCoverageForm({ coverage: null })
                }}
                data-testid={`coverage-add-btn-${t}`}
              >
                {COVERAGE_TYPE_LABELS[t]}
              </Button>
            ))}
          </Space>
        }
        items={COVERAGE_TYPES.map((t) => ({
          key: t,
          label: `${COVERAGE_TYPE_LABELS[t]} (${coverages.filter((c) => c.type === t).length})`,
        }))}
      />
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={coverages.filter((c) => c.type === activeType)}
        pagination={false}
      />

      <VehicleFormModal
        vehicle={editingVehicle ? vehicle : null}
        ownerOptions={ownerOptions}
        typeOptions={typeOptions}
        onClose={() => setEditingVehicle(false)}
        onSaved={() => {
          setEditingVehicle(false)
          setDocsVersion((n) => n + 1)
          fetchDetail()
        }}
      />
      <CoverageFormModal
        open={coverageForm !== null}
        vehicleId={vehicle.id}
        type={activeType}
        coverage={coverageForm?.coverage ?? null}
        insurers={insurers}
        agents={agents}
        vehicles={vehicles}
        onClose={() => setCoverageForm(null)}
        onSaved={() => {
          setCoverageForm(null)
          fetchDetail()
          reloadAgents()
        }}
      />
      <AttachmentsModal coverage={attachmentsFor} onClose={() => setAttachmentsFor(null)} onChanged={fetchDetail} />
    </>
  )
}
