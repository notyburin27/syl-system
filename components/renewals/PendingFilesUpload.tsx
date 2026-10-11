'use client'

import type { Dispatch, SetStateAction } from 'react'
import { App, Button, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { validateAttachment } from '@/lib/renewals/attachmentRules'

interface Props {
  files: File[]
  /** setState ตรงๆ — เลือกหลายไฟล์พร้อมกัน beforeUpload ถูกเรียกต่อเนื่อง ต้องใช้ functional update */
  onChange: Dispatch<SetStateAction<File[]>>
  buttonTestId: string
}

/** เลือกไฟล์ไว้ก่อน (ตรวจชนิด/ขนาดทันที) — ผู้ใช้ฟอร์มอัปโหลดเองหลังบันทึกสำเร็จ */
export default function PendingFilesUpload({ files, onChange, buttonTestId }: Props) {
  const { message } = App.useApp()
  return (
    <Upload
      accept=".pdf,.jpg,.jpeg,.png"
      multiple
      fileList={files.map((f, i) => ({ uid: String(i), name: f.name, status: 'done' as const }))}
      beforeUpload={(file) => {
        const checked = validateAttachment(file.name, file.type, file.size)
        if ('error' in checked) {
          message.error(checked.error)
          return Upload.LIST_IGNORE
        }
        onChange((prev) => [...prev, file])
        return false
      }}
      onRemove={(removed) => onChange((prev) => prev.filter((_, i) => String(i) !== removed.uid))}
    >
      <Button icon={<UploadOutlined />} data-testid={buttonTestId}>
        เลือกไฟล์
      </Button>
    </Upload>
  )
}
