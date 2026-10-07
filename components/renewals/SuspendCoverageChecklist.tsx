'use client'

import { useState } from 'react'
import { Alert, Checkbox, Space } from 'antd'
import { COVERAGE_TYPE_LABELS } from '@/lib/renewals/constants'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { CoverageDto } from '@/types/renewals'

interface Props {
  coverages: CoverageDto[]
  defaultIds: string[]
  hasNoticeDate: boolean
  onChange: (ids: string[]) => void
}

/** เนื้อหา confirm ตอนเปลี่ยนรถเป็นงดใช้ — เลือกงวดเปิดที่จะปิดเป็น ไม่ต่อ (งดใช้) */
export default function SuspendCoverageChecklist({ coverages, defaultIds, hasNoticeDate, onChange }: Props) {
  const [ids, setIds] = useState(defaultIds)
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <span>เลือกงวดที่จะปิดเป็น &quot;ไม่ต่อ (งดใช้)&quot; — งวดที่ไม่เลือกยังต้องต่อตามปกติ</span>
      {!hasNoticeDate && (
        <Alert type="info" showIcon message="ยังไม่ได้กรอกวันที่แจ้ง ม.89 — ถ้าแจ้งก่อนวันครบกำหนดภาษี ไม่ต้องต่อภาษีงวดนั้น" />
      )}
      <Checkbox.Group
        value={ids}
        onChange={(value) => {
          setIds(value)
          onChange(value)
        }}
      >
        <Space direction="vertical">
          {coverages.map((c) => (
            <Checkbox key={c.id} value={c.id}>
              {COVERAGE_TYPE_LABELS[c.type]} — หมด {toThaiShortDate(c.endDate)}
            </Checkbox>
          ))}
        </Space>
      </Checkbox.Group>
    </Space>
  )
}
