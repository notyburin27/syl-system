'use client'

import { InputNumber } from 'antd'

/** ความสูงแถวคงที่ — ต้องตรงกับ SummaryRow ใน SummaryDetail */
export const ROW_HEIGHT = 32

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
        padding: '0 8px',
        // ล็อกความสูงคงที่ ไม่ให้การ์ดขยับตอนสลับโหมดอ่าน/แก้ไข
        // (input ของ antd สูงกว่าข้อความธรรมดา 2px ต่อแถว)
        height: ROW_HEIGHT,
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
        // ต้องกว้าง 112 เท่าช่องค่าปกติ ไม่งั้น label/หน่วยถูกดันจนคอลัมน์ไม่ตรงกับแถวอื่น
        <span
          style={{
            width: 112,
            minWidth: 112,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
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
            minWidth: 112,
            flexShrink: 0,
            // ช่องที่ยังไม่กรอกมีข้อความว่าง — ต้องสูงเต็มแถว ไม่งั้นยุบเป็น 0px
            // แล้ว Playwright มองว่า hidden (และคลิกไม่โดน)
            height: '100%',
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

      <span style={{ width: 38, minWidth: 38, flexShrink: 0, color, fontSize: 13, whiteSpace: 'nowrap' }}>
        {unit}
      </span>
    </div>
  )
}
