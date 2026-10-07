'use client'

import { Button, Modal } from 'antd'
import type { CoverageDto } from '@/types/renewals'
import AttachmentPanel from './AttachmentPanel'

interface Props {
  coverage: CoverageDto | null
  onClose: () => void
  /** จำนวนไฟล์เปลี่ยน — ให้หน้าแม่โหลดตัวเลขใหม่ */
  onChanged: () => void
}

export default function AttachmentsModal({ coverage, onClose, onChanged }: Props) {
  return (
    <Modal
      open={coverage !== null}
      title="ไฟล์แนบ"
      footer={<Button onClick={onClose}>ปิด</Button>}
      onCancel={onClose}
      width={640}
      destroyOnHidden
    >
      {coverage && (
        <AttachmentPanel
          listUrl={`/api/renewals/coverages/${coverage.id}/attachments`}
          fileUrl={(a) => `/api/renewals/attachments/${a.id}`}
          onChanged={onChanged}
        />
      )}
    </Modal>
  )
}
