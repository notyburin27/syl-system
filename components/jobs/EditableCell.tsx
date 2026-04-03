'use client'

import { useState, useEffect } from 'react'
import { Select, DatePicker, Input, Checkbox, Tooltip } from 'antd'
import dayjs from 'dayjs'

export type CellType = 'text' | 'number' | 'select' | 'date' | 'checkbox' | 'computed'

interface EditableCellProps {
  value: unknown
  cellType: CellType
  editable: boolean
  locked: boolean
  options?: { value: string; label: string }[]
  onSave: (value: unknown) => Promise<boolean>
  onSaveStatus?: (status: 'saving' | 'saved' | 'error') => void
  format?: (val: unknown) => string
  precision?: number
  dropdownRenderExtra?: React.ReactNode
  dateFormat?: string
}

export default function EditableCell({
  value,
  cellType,
  editable,
  locked,
  options,
  onSave,
  onSaveStatus,
  format,
  precision = 0,
  dropdownRenderExtra,
  dateFormat = 'DD/MM/YYYY',
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEditValue(value)
  }, [value])

  const handleSave = async (newValue: unknown) => {
    if (newValue === value) {
      setEditing(false)
      return
    }
    onSaveStatus?.('saving')
    setError(null)
    try {
      const success = await onSave(newValue)
      if (success) {
        onSaveStatus?.('saved')
        setEditing(false)
      } else {
        onSaveStatus?.('error')
        setEditValue(value)
        setEditing(false)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'บันทึกล้มเหลว'
      if (msg) setError(msg)
      onSaveStatus?.('error')
      setEditValue(value)
      setEditing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditValue(value)
      setEditing(false)
    }
  }

  // Fixed cell height style
  const cellStyle: React.CSSProperties = {
    height: 32,
    display: 'flex',
    alignItems: 'center',
    opacity: 1,
    position: 'relative',
    width: '100%',
  }

  // Checkbox type
  if (cellType === 'checkbox') {
    return (
      <div style={cellStyle} onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={!!value}
          disabled={!editable || locked}
          onChange={async (e) => {
            await handleSave(e.target.checked)
          }}
        />
      </div>
    )
  }

  // Computed/disabled type
  if (cellType === 'computed') {
    const displayVal = format ? format(value) : (typeof value === 'number' ? value.toLocaleString('th-TH', { minimumFractionDigits: precision, maximumFractionDigits: precision }) : (value ?? '-'))
    return (
      <div style={{ ...cellStyle, cursor: 'default', color: '#666', justifyContent: 'flex-end' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {String(displayVal)}
        </span>
      </div>
    )
  }

  // Display mode
  if (!editing) {
    let displayVal: string
    if (format) {
      displayVal = format(value)
    } else if (cellType === 'date' && value) {
      displayVal = dayjs(value as string).format(dateFormat)
    } else if (cellType === 'select' && options) {
      const opt = options.find((o) => o.value === value)
      displayVal = opt?.label || String(value ?? '')
    } else if (cellType === 'number') {
      const num = typeof value === 'number' ? value : Number(value)
      displayVal = (value != null && value !== '' && !isNaN(num) && num !== 0) ? num.toLocaleString('th-TH', { minimumFractionDigits: precision, maximumFractionDigits: precision }) : ''
    } else {
      displayVal = String(value ?? '')
    }

    return (
      <Tooltip title={error} color="red" open={!!error}>
        <div
          style={cellStyle}
          onClick={() => {
            if (editable && !locked) {
              setEditing(true)
              setError(null)
            }
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: cellType === 'number' ? 'right' : 'left' }}>
            {displayVal || <span style={{ color: '#ccc' }}>-</span>}
          </span>
        </div>
      </Tooltip>
    )
  }

  // Edit mode
  const inputStyle: React.CSSProperties = { width: '100%', height: 32 }

  if (cellType === 'date') {
    return (
      <div style={cellStyle} onKeyDown={handleKeyDown}>
        <DatePicker
          size="small"
          value={editValue ? dayjs(editValue as string) : null}
          format="DD/MM/YYYY"
          style={inputStyle}
          autoFocus
          open={editing}
          onChange={(val) => {
            const dateStr = val?.format('YYYY-MM-DD') || null
            setEditValue(dateStr)
            handleSave(dateStr)
          }}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(false)
            }
          }}
        />
      </div>
    )
  }

  if (cellType === 'select') {
    return (
      <div style={cellStyle} onKeyDown={handleKeyDown}>
        <Select
          size="small"
          showSearch
          allowClear
          value={editValue as string}
          options={options}
          style={inputStyle}
          autoFocus
          defaultOpen
          popupMatchSelectWidth={false}
          styles={{ popup: { root: { minWidth: 200 } } }}
          filterOption={(input, option) =>
            (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
          }
          onChange={(val) => {
            setEditValue(val ?? null)
            handleSave(val ?? null)
          }}
          onBlur={() => {
            if (editing) setEditing(false)
          }}
          dropdownRender={dropdownRenderExtra ? (menu) => (
            <>
              {menu}
              {dropdownRenderExtra}
            </>
          ) : undefined}
        />
      </div>
    )
  }

  if (cellType === 'number') {
    const parseNumber = (val: unknown) => {
      const str = String(val ?? '').trim()
      if (str === '') return null
      const num = Number(str)
      return isNaN(num) ? null : num
    }

    return (
      <div style={cellStyle} onKeyDown={handleKeyDown}>
        <Input
          size="small"
          value={editValue != null ? String(editValue) : ''}
          style={inputStyle}
          autoFocus
          onPressEnter={() => handleSave(parseNumber(editValue))}
          onBlur={() => handleSave(parseNumber(editValue))}
          onChange={(e) => setEditValue(e.target.value)}
        />
      </div>
    )
  }

  // text
  return (
    <div style={cellStyle} onKeyDown={handleKeyDown}>
      <Input
        size="small"
        value={editValue as string}
        style={inputStyle}
        autoFocus
        onPressEnter={() => handleSave(editValue)}
        onBlur={() => handleSave(editValue)}
        onChange={(e) => setEditValue(e.target.value)}
      />
    </div>
  )
}
