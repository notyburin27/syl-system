import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ATTACHMENT_BYTES, buildAttachmentKey, inlineContentDisposition, validateAttachment } from '../attachmentRules'

test('validateAttachment: รับ PDF/JPG/PNG (นามสกุลตัวใหญ่ได้, jpeg → jpg)', () => {
  assert.deepEqual(validateAttachment('policy.pdf', 'application/pdf', 1000), { ext: 'pdf' })
  assert.deepEqual(validateAttachment('ป้ายภาษี.JPEG', 'image/jpeg', 1000), { ext: 'jpg' })
  assert.deepEqual(validateAttachment('scan.png', 'image/png', MAX_ATTACHMENT_BYTES), { ext: 'png' })
})

test('validateAttachment: ปฏิเสธนามสกุลอื่น / MIME ไม่ตรง / ไฟล์ว่าง / เกิน 10 MB', () => {
  assert.deepEqual(validateAttachment('virus.exe', 'application/octet-stream', 10), {
    error: 'virus.exe: รองรับเฉพาะไฟล์ PDF, JPG, PNG',
  })
  assert.deepEqual(validateAttachment('fake.png', 'image/jpeg', 10), { error: 'fake.png: ชนิดไฟล์ไม่ตรงกับนามสกุล' })
  assert.deepEqual(validateAttachment('empty.pdf', 'application/pdf', 0), { error: 'empty.pdf: ไฟล์ว่าง' })
  assert.deepEqual(validateAttachment('big.pdf', 'application/pdf', MAX_ATTACHMENT_BYTES + 1), {
    error: 'big.pdf: ไฟล์ต้องไม่เกิน 10 MB',
  })
})

test('buildAttachmentKey ใช้เดือนตามเวลาไทย', () => {
  // 31 ต.ค. 18:00 UTC = 1 พ.ย. 01:00 เวลาไทย
  assert.equal(
    buildAttachmentKey(new Date('2026-10-31T18:00:00Z'), 'abc', 'pdf'),
    'vehicle-coverages/2026-11/abc.pdf',
  )
  assert.equal(
    buildAttachmentKey(new Date('2026-10-31T18:00:00Z'), 'abc', 'png', 'vehicle-documents'),
    'vehicle-documents/2026-11/abc.png',
  )
})

test('inlineContentDisposition: ชื่อไทยไม่ทำ header พัง (ASCII ล้วน + filename*)', () => {
  const header = inlineContentDisposition("กรมธรรม์ (2569)'s.pdf")
  assert.match(header, /^[\x20-\x7e]+$/)
  assert.ok(header.startsWith('inline; filename="'))
  assert.ok(header.includes("filename*=UTF-8''%E0%B8%81"))
  assert.ok(header.includes('%28') && header.includes('%27'))
})
