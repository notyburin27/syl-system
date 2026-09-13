'use client'

import { useState, useRef, useEffect } from 'react'
import { InputNumber, Spin } from 'antd'
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'

/** ชื่อ field ที่แก้ได้ — ต้องตรงกับ whitelist ฝั่ง API */
export type EditableField =
  | 'carryTrips'
  | 'fuelDeduction'
  | 'otherExpenses'
  | 'driverPayout'

export default function EditableSummaryRow({
  label,
  value,
  unit,
  field,
  month,
  color,
  background,
  integer,
  editing,
  saving,
  onStartEdit,
  onCancel,
  onSave,
  format,
}: {
  label: string
  value: number | null
  unit: string
  field: EditableField
  /** ใช้ทำ id ให้ไม่ซ้ำ เพราะหลายการ์ดมี field ชื่อเดียวกัน */
  month: string
  color?: string
  background?: string
  /** จำนวนเที่ยว — กรอกทศนิยมไม่ได้ */
  integer?: boolean
  /** แถวนี้กำลังแก้อยู่ไหม (ควบคุมจากการ์ด เพื่อให้แก้ได้ทีละช่อง) */
  editing: boolean
  saving: boolean
  onStartEdit: (field: EditableField) => void
  onCancel: () => void
  onSave: (field: EditableField, value: number | null) => void
  /** ฟังก์ชันจัดรูปแบบตอนไม่ได้แก้ */
  format: (v: number | null) => string
}) {
  const [draft, setDraft] = useState<number | null>(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // ตั้งค่าตั้งต้นทุกครั้งที่เข้าโหมดแก้ แล้วโฟกัส+เลือกข้อความทั้งหมด
  useEffect(() => {
    if (editing) {
      setDraft(value)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [editing, value])

  const commit = () => onSave(field, draft)

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
        <span style={{ width: 112, display: 'flex', alignItems: 'center', gap: 4 }}>
          <InputNumber
            ref={inputRef}
            size="small"
            autoFocus
            disabled={saving}
            value={draft}
            onChange={(v) => setDraft(v as number | null)}
            onPressEnter={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel()
            }}
            precision={integer ? 0 : 2}
            style={{ width: '100%' }}
            /* antd ใส่ id ลงบน <input> โดยตรง — test จับด้วย id ได้ (แบบเดียวกับที่อื่นในโปรเจกต์) */
            id={`entry-input-${month}-${field}`}
          />
        </span>
      ) : (
        <span
          style={{
            width: 112,
            // ช่องที่ยังไม่กรอกมีข้อความว่าง ถ้าไม่ตั้ง minHeight span จะยุบเป็น 0px
            // ทำให้แถวเสียรูปและ Playwright มองว่า hidden
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

      {/* ปุ่มควบคุม — กว้างคงที่ทุกโหมด ไม่ให้แถวขยับตอนสลับ */}
      <span style={{ width: 34, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        {saving ? (
          <Spin size="small" />
        ) : editing ? (
          <>
            <CheckOutlined
              onClick={commit}
              data-testid={`entry-save-${field}`}
              style={{ color: '#389e0d', cursor: 'pointer' }}
            />
            <CloseOutlined
              onClick={onCancel}
              data-testid={`entry-cancel-${field}`}
              style={{ color: '#999', cursor: 'pointer' }}
            />
          </>
        ) : (
          <EditOutlined
            onClick={() => onStartEdit(field)}
            data-testid={`entry-edit-${field}`}
            style={{ color: '#bbb', cursor: 'pointer', fontSize: 12 }}
          />
        )}
      </span>
    </div>
  )
}
