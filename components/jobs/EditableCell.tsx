'use client'

import { useState, useRef, useEffect } from 'react'
import { InputNumber, Select, DatePicker, Input, Checkbox, Tooltip } from 'antd'
import { LoadingOutlined, CheckOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

export type CellType = 'text' | 'number' | 'select' | 'date' | 'checkbox' | 'computed'

interface EditableCellProps {
  value: unknown
  cellType: CellType
  editable: boolean
  locked: boolean
  options?: { value: string; label: string }[]
  onSave: (value: unknown) => Promise<boolean>
  format?: (val: unknown) => string
  precision?: number
  dropdownRenderExtra?: React.ReactNode
}

export default function EditableCell({
  value,
  cellType,
  editable,
  locked,
  options,
  onSave,
  format,
  precision = 2,
  dropdownRenderExtra,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditValue(value)
  }, [value])

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [saved])

  const handleSave = async (newValue: unknown) => {
    if (newValue === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const success = await onSave(newValue)
      if (success) {
        setSaved(true)
        setEditing(false)
      } else {
        setEditValue(value)
        setEditing(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกล้มเหลว')
      setEditValue(value)
      setEditing(false)
    } finally {
      setSaving(false)
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
    cursor: editable && !locked ? 'pointer' : locked ? 'not-allowed' : 'default',
    opacity: locked ? 0.5 : 1,
    position: 'relative',
    width: '100%',
  }

  // Status icons
  const statusIcon = saving ? (
    <LoadingOutlined style={{ fontSize: 12, color: '#1890ff', marginLeft: 4 }} />
  ) : saved ? (
    <CheckOutlined style={{ fontSize: 12, color: '#52c41a', marginLeft: 4 }} />
  ) : null

  // Checkbox type
  if (cellType === 'checkbox') {
    return (
      <div style={cellStyle}>
        <Checkbox
          checked={!!value}
          disabled={!editable || locked}
          onChange={async (e) => {
            await handleSave(e.target.checked)
          }}
        />
        {statusIcon}
      </div>
    )
  }

  // Computed/disabled type
  if (cellType === 'computed') {
    const displayVal = format ? format(value) : (typeof value === 'number' ? value.toFixed(precision) : (value ?? '-'))
    return (
      <div style={{ ...cellStyle, cursor: 'default', color: '#666' }}>
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
      displayVal = dayjs(value as string).format('DD/MM/YYYY')
    } else if (cellType === 'select' && options) {
      const opt = options.find((o) => o.value === value)
      displayVal = opt?.label || String(value ?? '')
    } else if (cellType === 'number' && value != null) {
      displayVal = typeof value === 'number' ? value.toFixed(precision) : String(value)
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
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {displayVal || <span style={{ color: '#ccc' }}>-</span>}
          </span>
          {statusIcon}
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
          onChange={(val) => {
            const dateStr = val?.format('YYYY-MM-DD') || null
            setEditValue(dateStr)
            handleSave(dateStr)
          }}
          onBlur={() => {
            if (editing) setEditing(false)
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
          value={editValue as string}
          options={options}
          style={inputStyle}
          autoFocus
          defaultOpen
          filterOption={(input, option) =>
            (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
          }
          onChange={(val) => {
            setEditValue(val)
            handleSave(val)
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
    return (
      <div style={cellStyle} onKeyDown={handleKeyDown}>
        <InputNumber
          size="small"
          value={editValue as number}
          style={inputStyle}
          autoFocus
          ref={inputRef as unknown as React.Ref<HTMLInputElement>}
          precision={precision}
          onPressEnter={() => handleSave(editValue)}
          onBlur={() => handleSave(editValue)}
          onChange={(val) => setEditValue(val)}
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
