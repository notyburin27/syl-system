'use client'

import { InputNumber } from 'antd'

/** ชื่อ field ที่แก้ได้ — ต้องตรงกับ whitelist ฝั่ง API */
export type EditableField =
  | 'carryTrips'
  | 'fuelDeduction'
  | 'otherExpenses'
  | 'driverPayout'

/**
 * แถวที่แก้ได้ในการ์ดสรุป
 *
 * ตัวแถวเองไม่มีปุ่มควบคุม — การ์ดเป็นคนคุมว่าทั้งใบอยู่โหมดแก้หรือโหมดอ่าน
 * (กดดินสอที่หัวการ์ดครั้งเดียว ทั้ง 4 ช่องกลายเป็น input พร้อมกัน)
 */
export default function EditableSummaryRow({
  label,
  value,
  draft,
  unit,
  field,
  month,
  color,
  background,
  integer,
  editing,
  disabled,
  onDraftChange,
  format,
}: {
  label: string
  value: number | null
  /** ค่าที่กำลังพิมพ์อยู่ (ใช้เฉพาะตอน editing) */
  draft: number | null
  unit: string
  field: EditableField
  /** ใช้ทำ id ให้ไม่ซ้ำ เพราะหลายการ์ดมี field ชื่อเดียวกัน */
  month: string
  color?: string
  background?: string
  /** จำนวนเที่ยว — กรอกทศนิยมไม่ได้ */
  integer?: boolean
  editing: boolean
  disabled?: boolean
  onDraftChange: (field: EditableField, value: number | null) => void
  format: (v: number | null) => string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        minHeight: 30,
        background,
        gap: 8,
      }}
    >
      <span
        style={{ flex: 1, textAlign: 'right', color, fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        {label}
      </span>

      {editing ? (
        <span style={{ width: 112, display: 'flex', alignItems: 'center' }}>
          <InputNumber
            size="small"
            disabled={disabled}
            value={draft}
            onChange={(v) => onDraftChange(field, v as number | null)}
            precision={integer ? 0 : 2}
            style={{ width: '100%' }}
            /* antd ใส่ id ลงบน <input> โดยตรง — test จับด้วย id ได้ */
            id={`entry-input-${month}-${field}`}
          />
        </span>
      ) : (
        <span
          style={{
            width: 112,
            // ช่องที่ยังไม่กรอกมีข้อความว่าง ถ้าไม่ตั้ง minHeight span จะยุบเป็น 0px
            minHeight: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            color,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
          data-testid={`entry-value-${field}`}
        >
          {format(value)}
        </span>
      )}

      <span style={{ width: 38, color, fontSize: 13, whiteSpace: 'nowrap' }}>{unit}</span>
    </div>
  )
}
