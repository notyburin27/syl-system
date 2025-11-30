'use client'

import { useState } from 'react'
import {
  Modal,
  Progress,
  Typography,
  List,
  Button,
  App,
  Radio,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import {
  generateMultiplePDFs,
  generateCombinedPDF,
  validateFormForPDF,
} from '@/lib/utils/pdfUtils'
import type { FormState } from '@/types/document'

const { Title, Text } = Typography

interface PDFGeneratorProps {
  visible: boolean
  onClose: () => void
  forms: FormState[]
}

interface PDFResult {
  formId: string | number
  formTitle: string
  success: boolean
  filename?: string
  error?: string
}

export default function PDFGenerator({
  visible,
  onClose,
  forms,
}: PDFGeneratorProps) {
  const { message } = App.useApp()
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentForm, setCurrentForm] = useState('')
  const [results, setResults] = useState<PDFResult[]>([])
  const [completed, setCompleted] = useState(false)
  const [pdfMode, setPdfMode] = useState<'separate' | 'combined'>('combined')

  const handleGeneratePDFs = async () => {
    // Validate all forms first
    const validationResults = forms.map((form) => ({
      form,
      validation: validateFormForPDF(form.data),
    }))

    const invalidForms = validationResults.filter(
      (result) => !result.validation.isValid
    )

    if (invalidForms.length > 0) {
      message.error(
        `${invalidForms.length} ฟอร์มมีข้อมูลไม่ครบ กรุณากรอกข้อมูลให้ครบก่อนสร้าง PDF`
      )
      return
    }

    setGenerating(true)
    setProgress(0)
    setResults([])
    setCompleted(false)

    try {
      if (pdfMode === 'combined') {
        // Generate single combined PDF
        const result = await generateCombinedPDF(forms, (progressInfo) => {
          const percentage = Math.round(
            (progressInfo.current / progressInfo.total) * 100
          )
          setProgress(percentage)
          setCurrentForm(progressInfo.formTitle || '')

          if (progressInfo.status === 'completed') {
            setCompleted(true)
            setCurrentForm('')
          }
        })

        setResults([
          {
            formId: 'combined',
            formTitle: `PDF รวม (${forms.length} ฟอร์ม)`,
            ...result,
          },
        ])

        if (result.success) {
          message.success(
            `สร้าง PDF รวม ${forms.length} ฟอร์มสำเร็จ!`
          )
        } else {
          message.error('สร้าง PDF รวมล้มเหลว')
        }
      } else {
        // Generate separate PDFs
        const pdfResults = await generateMultiplePDFs(forms, (progressInfo) => {
          const percentage = Math.round(
            (progressInfo.current / progressInfo.total) * 100
          )
          setProgress(percentage)
          setCurrentForm(progressInfo.formTitle || '')

          if (progressInfo.status === 'completed') {
            setCompleted(true)
            setCurrentForm('')
          }
        })

        setResults(pdfResults)

        const successCount = pdfResults.filter(
          (result) => result.success
        ).length
        const failCount = pdfResults.filter((result) => !result.success).length

        if (failCount === 0) {
          message.success(`สร้าง PDF สำเร็จทั้งหมด ${successCount} ไฟล์!`)
        } else {
          message.warning(
            `สร้าง PDF สำเร็จ ${successCount} ไฟล์, ล้มเหลว ${failCount} ไฟล์`
          )
        }
      }
    } catch (error) {
      message.error('เกิดข้อผิดพลาดในการสร้าง PDF')
      console.error('PDF generation error:', error)
    } finally {
      setGenerating(false)
    }
  }

  const handleClose = () => {
    if (!generating) {
      setProgress(0)
      setCurrentForm('')
      setResults([])
      setCompleted(false)
      setPdfMode('combined')
      onClose()
    }
  }

  const getStatusIcon = (success: boolean) => {
    if (success) {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />
    } else {
      return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    }
  }

  return (
    <Modal
      title="สร้าง PDF เอกสารขนส่ง"
      open={visible}
      onCancel={handleClose}
      footer={[
        <Button key="close" onClick={handleClose} disabled={generating}>
          {completed ? 'ปิด' : 'ยกเลิก'}
        </Button>,
        !completed && !generating && (
          <Button key="generate" type="primary" onClick={handleGeneratePDFs}>
            สร้าง PDF
            {pdfMode === 'combined' ? ' (รวม)' : ' (แยก)'}
          </Button>
        ),
      ]}
      width={600}
      maskClosable={!generating}
      closable={!generating}
    >
      <div style={{ minHeight: 200 }}>
        {!generating && !completed && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text style={{ display: 'block', marginBottom: 8 }}>
                เลือกรูปแบบการสร้าง PDF:
              </Text>
              <Radio.Group
                value={pdfMode}
                onChange={(e) => setPdfMode(e.target.value)}
                style={{ width: '100%' }}
              >
                <Radio.Button value="combined" style={{ marginRight: 8 }}>
                  PDF รวม (ไฟล์เดียว หลายหน้า)
                </Radio.Button>
                <Radio.Button value="separate">
                  PDF แยก (หลายไฟล์)
                </Radio.Button>
              </Radio.Group>
            </div>

            <Text type="secondary">
              {pdfMode === 'combined'
                ? `สร้าง PDF 1 ไฟล์ ${forms.length} หน้า (1 ฟอร์ม = 1 หน้า)`
                : `สร้าง PDF แยก ${forms.length} ไฟล์`}
            </Text>

            <List
              size="small"
              style={{ marginTop: 16 }}
              dataSource={forms}
              renderItem={(form, index) => (
                <List.Item>
                  <Text>
                    {pdfMode === 'combined'
                      ? `หน้า ${index + 1}`
                      : `ไฟล์ ${index + 1}`}
                    : {form.title}
                  </Text>
                </List.Item>
              )}
            />
          </div>
        )}

        {generating && (
          <div style={{ textAlign: 'center' }}>
            <LoadingOutlined style={{ fontSize: 24, marginBottom: 16 }} />
            <Title level={4}>กำลังสร้าง PDF...</Title>
            <Progress percent={progress} status="active" />
            {currentForm && (
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                กำลังประมวลผล: {currentForm}
              </Text>
            )}
          </div>
        )}

        {completed && results.length > 0 && (
          <div>
            <Title level={4}>ผลการสร้าง</Title>
            <List
              dataSource={results}
              renderItem={(result) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={getStatusIcon(result.success)}
                    title={result.formTitle}
                    description={
                      result.success
                        ? `สร้างสำเร็จ: ${result.filename}`
                        : `ล้มเหลว: ${result.error}`
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
