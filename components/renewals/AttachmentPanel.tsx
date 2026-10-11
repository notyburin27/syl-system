'use client'

import { useCallback, useEffect, useState } from 'react'
import { App, Button, Image, Space, Table, Upload, type TableColumnsType } from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { validateAttachment } from '@/lib/renewals/attachmentRules'
import { todayInBangkok } from '@/lib/renewals/dateOnly'
import { toThaiShortDate } from '@/lib/utils/thaiDate'
import type { AttachmentDto } from '@/types/renewals'
import { getJson, sendJson } from './api'
import { uploadAttachments } from './uploadAttachments'

interface Props {
  /** GET รายการ / POST อัปโหลด */
  listUrl: string
  /** URL เปิด/ลบไฟล์ทีละไฟล์ */
  fileUrl: (a: AttachmentDto) => string
  /** จำนวนไฟล์เปลี่ยน — ให้หน้าแม่โหลดตัวเลขใหม่ */
  onChanged?: () => void
  /** โหลดใหม่เมื่อค่านี้เปลี่ยน (เช่น หลังอัปโหลดจากฟอร์มรถ) */
  reloadKey?: unknown
}

/** ปุ่มอัปโหลด + ตารางไฟล์แนบ — ใช้กับไฟล์แนบของงวดและเอกสารสำเนารถ */
export default function AttachmentPanel({ listUrl, fileUrl, onChanged, reloadKey }: Props) {
  const { message, modal } = App.useApp()
  const [rows, setRows] = useState<AttachmentDto[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await getJson<AttachmentDto[]>(listUrl)
    if (res.ok) setRows(res.data)
    else message.error(res.error)
    setLoading(false)
  }, [listUrl, message])

  useEffect(() => {
    setRows([])
    fetchRows()
  }, [fetchRows, reloadKey])

  const handleUpload = async (file: File) => {
    setUploading(true)
    const res = await uploadAttachments(listUrl, [file])
    setUploading(false)
    if (!res.ok) {
      message.error(res.error)
      return
    }
    message.success(`แนบ ${file.name} สำเร็จ`)
    fetchRows()
    onChanged?.()
  }

  const handleDelete = (a: AttachmentDto) => {
    modal.confirm({
      title: 'ลบไฟล์แนบ',
      content: a.fileName,
      okText: 'ยืนยัน',
      okButtonProps: { danger: true },
      cancelText: 'ยกเลิก',
      onOk: async () => {
        const res = await sendJson(fileUrl(a), undefined, 'DELETE')
        if (!res.ok) {
          message.error(res.error)
          return
        }
        message.success('ลบสำเร็จ')
        fetchRows()
        onChanged?.()
      },
    })
  }

  const columns: TableColumnsType<AttachmentDto> = [
    {
      title: 'ไฟล์',
      key: 'file',
      render: (_, a) => (
        <Space>
          {a.contentType.startsWith('image/') && (
            <Image src={fileUrl(a)} width={40} height={40} style={{ objectFit: 'cover' }} alt={a.fileName} />
          )}
          <a href={fileUrl(a)} target="_blank" rel="noreferrer">
            {a.fileName}
          </a>
        </Space>
      ),
    },
    {
      title: 'ขนาด',
      key: 'size',
      width: 90,
      align: 'right',
      render: (_, a) => `${Math.max(1, Math.round(a.sizeBytes / 1024)).toLocaleString('th-TH')} KB`,
    },
    {
      title: 'วันที่แนบ',
      key: 'createdAt',
      width: 90,
      render: (_, a) => toThaiShortDate(todayInBangkok(new Date(a.createdAt))),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, a) => (
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(a)} data-testid={`attachment-delete-btn-${a.id}`} />
      ),
    },
  ]

  return (
    <>
      <Upload
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        showUploadList={false}
        beforeUpload={(file) => {
          const checked = validateAttachment(file.name, file.type, file.size)
          if ('error' in checked) message.error(checked.error)
          else handleUpload(file)
          return Upload.LIST_IGNORE
        }}
      >
        <Button icon={<UploadOutlined />} loading={uploading} data-testid="attachment-upload-btn">
          เลือกไฟล์ (PDF/JPG/PNG ไม่เกิน 10 MB)
        </Button>
      </Upload>
      <Table size="small" rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={false} style={{ marginTop: 12 }} />
    </>
  )
}
