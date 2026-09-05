'use client'

import { memo } from 'react'
import dayjs from 'dayjs'

export type CellType = 'text' | 'number' | 'select' | 'date' | 'checkbox' | 'computed'

interface CellProps {
  value: unknown
  cellType: CellType
  options?: { value: string; label: string }[]
  format?: (val: unknown) => string
  precision?: number
  dateFormat?: string
  /** สีตัวอักษรสำหรับ cellType 'computed' (เช่น ส่วนต่างบวก/ลบ) */
  valueColor?: string
}

// แสดงค่าหนึ่งช่องในตารางงาน — อ่านอย่างเดียว (แก้ไขทำผ่าน JobFormModal)
function JobTableCell({
  value,
  cellType,
  options,
  format,
  precision = 0,
  dateFormat = 'DD/MM/YYYY',
  valueColor,
}: CellProps) {
  const cellStyle: React.CSSProperties = {
    height: 32,
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  }

  if (cellType === 'checkbox') {
    return (
      <div style={{ ...cellStyle, justifyContent: 'center' }}>
        {value ? '✓' : ''}
      </div>
    )
  }

  if (cellType === 'computed') {
    const displayVal = format
      ? format(value)
      : typeof value === 'number'
        ? value.toLocaleString('th-TH', { minimumFractionDigits: precision, maximumFractionDigits: precision })
        : (value ?? '-')
    return (
      <div style={{ ...cellStyle, color: valueColor ?? '#666', justifyContent: 'flex-end' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: valueColor ? 600 : undefined }}>
          {String(displayVal)}
        </span>
      </div>
    )
  }

  let displayVal: string
  if (format) {
    displayVal = format(value)
  } else if (cellType === 'date' && value) {
    displayVal = dayjs(value as string).format(dateFormat)
  } else if (cellType === 'select' && options) {
    displayVal = options.find((o) => o.value === value)?.label || String(value ?? '')
  } else if (cellType === 'number') {
    const num = typeof value === 'number' ? value : Number(value)
    displayVal =
      value != null && value !== '' && !isNaN(num) && num !== 0
        ? num.toLocaleString('th-TH', { minimumFractionDigits: precision, maximumFractionDigits: precision })
        : ''
  } else {
    displayVal = String(value ?? '')
  }

  return (
    <div style={cellStyle}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: cellType === 'number' ? 'right' : 'left' }}>
        {displayVal || <span style={{ color: '#ccc' }}>-</span>}
      </span>
    </div>
  )
}

// ตารางงานมี 42 คอลัมน์ × ทุกแถวของเดือน — ถ้าไม่ memo ทุก state change ของตาราง
// จะ re-render cell ทั้งหมด ทำให้ iPad/แท็บเล็ตรุ่นเก่ากระตุก
//
// ข้าม format โดยตั้งใจ: ถูกสร้างใหม่ทุก render ของ parent (identity ไม่เคยเท่า)
// ถ้าเอามาเทียบ memo จะไม่มีผลเลย — และเป็น presentational ล้วนที่ขึ้นกับ
// cellType/field ซึ่งคงที่
export default memo(JobTableCell, (prev, next) =>
  prev.value === next.value &&
  prev.cellType === next.cellType &&
  prev.options === next.options &&
  prev.precision === next.precision &&
  prev.dateFormat === next.dateFormat &&
  prev.valueColor === next.valueColor
)
