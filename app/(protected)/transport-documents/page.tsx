'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button, Card, Space, Typography, App, Table, Modal } from 'antd'
import {
  PlusOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileExcelOutlined,
  SaveOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useFormManager } from '@/hooks/useFormManager'
import FormTabs from '@/components/FormTabs'
import PDFGenerator from '@/components/PDFGenerator'
import ExcelUploader from '@/components/ExcelUploader'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface TransportDocument {
  id: string
  title: string
  date: string | null
  customerName: string | null
  booking: string | null
  containerNumber: string | null
  createdAt: string
  createdBy: {
    id: string
    name: string | null
    username: string
  }
}

export default function TransportDocumentsPage() {
  const { message } = App.useApp()
  const {
    forms,
    activeFormId,
    setActiveFormId,
    addForm,
    addFormWithData,
    addMultipleFormsWithData,
    deleteForm,
    duplicateForm,
    updateFormData,
    clearForm,
    setFormError,
    formsCount,
    validateAllForms,
    markFormAsSaved,
    hasAnyUnsavedChanges,
  } = useFormManager()

  const [documents, setDocuments] = useState<TransportDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [pdfGeneratorVisible, setPdfGeneratorVisible] = useState(false)
  const [excelUploaderVisible, setExcelUploaderVisible] = useState(false)
  const [showFormEditor, setShowFormEditor] = useState(false)

  // Fetch all documents
  const fetchDocuments = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/documents')
      if (res.ok) {
        const data = await res.json()
        // Ensure unique keys by checking for duplicates
        const uniqueData = data.filter((doc: TransportDocument, index: number, self: TransportDocument[]) =>
          index === self.findIndex((d) => d.id === doc.id)
        )
        setDocuments(uniqueData)
      }
    } catch (error) {
      message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  // Warn before leaving if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasAnyUnsavedChanges()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasAnyUnsavedChanges])

  // Handle adding new form
  const handleAddForm = () => {
    addForm()
    setShowFormEditor(true)
    message.success('เพิ่มฟอร์มใหม่สำเร็จ')
  }

  // Handle form deletion
  const handleDeleteForm = (formId: number) => {
    if (forms.length === 1) {
      message.warning('ต้องมีอย่างน้อย 1 ฟอร์ม')
      return
    }

    const formToDelete = forms.find((f) => f.id === formId)
    deleteForm(formId)
    message.success(`ลบ ${formToDelete?.title} สำเร็จ`)
  }

  // Handle tab change
  const handleTabChange = (formId: number) => {
    setActiveFormId(formId)
  }

  // Handle form validation
  const handleFormValidation = (formId: number, hasErrors: boolean) => {
    setFormError(formId, hasErrors)
  }

  // Handle save single form
  const handleSaveForm = async (formId: number) => {
    const form = forms.find((f) => f.id === formId)
    if (!form) return

    try {
      message.loading('กำลังบันทึก...', 0)

      // Check if this is an update (has documentId) or create
      if (form.documentId) {
        // Update existing document
        const res = await fetch(`/api/documents/${form.documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            ...form.data,
          }),
        })

        if (res.ok) {
          message.destroy()
          message.success('บันทึกสำเร็จ')
          markFormAsSaved(formId, form.documentId)
          fetchDocuments()
        } else {
          message.destroy()
          message.error('บันทึกล้มเหลว')
        }
      } else {
        // Create new document
        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            ...form.data,
          }),
        })

        if (res.ok) {
          const newDoc = await res.json()
          message.destroy()
          message.success('บันทึกสำเร็จ')
          markFormAsSaved(formId, newDoc.id)
          fetchDocuments()
        } else {
          message.destroy()
          message.error('บันทึกล้มเหลว')
        }
      }
    } catch (error) {
      message.destroy()
      message.error('เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  // Handle save all forms
  const handleSaveAllForms = async () => {
    const unsavedForms = forms.filter((f) => f.hasUnsavedChanges)
    if (unsavedForms.length === 0) {
      message.info('ไม่มีฟอร์มที่ต้องบันทึก')
      return
    }

    try {
      message.loading(`กำลังบันทึก ${unsavedForms.length} ฟอร์ม...`, 0)

      for (const form of unsavedForms) {
        await handleSaveForm(form.id)
      }

      message.destroy()
      message.success(`บันทึกสำเร็จ ${unsavedForms.length} ฟอร์ม`)
    } catch (error) {
      message.destroy()
      message.error('เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  // Handle generate all PDFs
  const handleGenerateAllPDFs = () => {
    const validationResults = validateAllForms()
    const invalidForms = validationResults.filter(
      (result) => !result.validation.isValid
    )

    if (invalidForms.length > 0) {
      message.error(
        `${invalidForms.length} ฟอร์มมีข้อมูลไม่ครบ กรุณากรอกข้อมูลให้ครบก่อนสร้าง PDF`
      )
      return
    }

    setPdfGeneratorVisible(true)
  }

  // Handle Excel data import
  const handleExcelDataImport = (excelDataArray: any[]) => {
    try {
      if (excelDataArray.length === 0) {
        message.warning('ไม่มีข้อมูลในไฟล์ Excel')
        return
      }

      // Prepare forms data
      const formsData = excelDataArray.map((rowData) => {
        // Remove Excel-specific fields from rowData
        const formData = { ...rowData }
        const generatedTitle = formData._generatedTitle
        delete formData._excelRowIndex
        delete formData._originalData
        delete formData._generatedTitle

        return {
          data: formData,
          title: generatedTitle,
        }
      })

      // Create all forms at once with unique IDs
      addMultipleFormsWithData(formsData)

      setExcelUploaderVisible(false)
      setShowFormEditor(true)
      message.success(
        `นำเข้าข้อมูลสำเร็จ! สร้าง ${excelDataArray.length} ฟอร์มแล้ว`
      )
    } catch (error) {
      console.error('Error importing Excel data:', error)
      message.error('เกิดข้อผิดพลาดในการนำเข้าข้อมูล')
    }
  }

  // Handle show Excel uploader
  const handleShowExcelUploader = () => {
    setExcelUploaderVisible(true)
  }

  // Handle load document into form
  const handleLoadDocument = async (documentId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}`)
      if (res.ok) {
        const doc = await res.json()

        // Add form with loaded data
        const formId = addFormWithData(
          {
            date: doc.date ? new Date(doc.date) : null,
            customerName: doc.customerName,
            booking: doc.booking,
            agent: doc.agent,
            shipName: doc.shipName,
            invoice: doc.invoice,
            containerSize: doc.containerSize,
            containerNumber: doc.containerNumber,
            sealNumber: doc.sealNumber,
            shipping: doc.shipping,
            pickupLocation: doc.pickupLocation,
            returnLocation: doc.returnLocation,
            closingTime: doc.closingTime ? new Date(doc.closingTime) : null,
            factoryTime: doc.factoryTime,
            loadingSlot: doc.loadingSlot,
            driverName: doc.driverName,
            vehicleRegistration: doc.vehicleRegistration,
            phoneNumber: doc.phoneNumber,
            remarks: doc.remarks,
          },
          doc.title
        )

        // Mark as saved with documentId
        markFormAsSaved(formId, documentId)

        setShowFormEditor(true)
        message.success('โหลดเอกสารสำเร็จ')
      }
    } catch (error) {
      message.error('เกิดข้อผิดพลาดในการโหลดเอกสาร')
    }
  }

  // Handle delete document
  const handleDeleteDocument = async (documentId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        message.success('ลบเอกสารสำเร็จ')
        fetchDocuments()
      } else {
        message.error('ลบเอกสารล้มเหลว')
      }
    } catch (error) {
      message.error('เกิดข้อผิดพลาดในการลบเอกสาร')
    }
  }

  const columns: ColumnsType<TransportDocument> = [
    {
      title: 'ชื่อเอกสาร',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'วันที่',
      dataIndex: 'date',
      key: 'date',
      render: (date) => (date ? dayjs(date).format('DD/MM/YYYY') : '-'),
    },
    {
      title: 'ชื่อลูกค้า',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (name) => name || '-',
    },
    {
      title: 'บุ๊คกิ้ง',
      dataIndex: 'booking',
      key: 'booking',
      render: (booking) => booking || '-',
    },
    {
      title: 'เบอร์ตู้',
      dataIndex: 'containerNumber',
      key: 'containerNumber',
      render: (num) => num || '-',
    },
    {
      title: 'สร้างโดย',
      dataIndex: ['createdBy', 'name'],
      key: 'createdBy',
      render: (name, record) => name || record.createdBy.username,
    },
    {
      title: 'วันที่สร้าง',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => dayjs(date).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'การดำเนินการ',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleLoadDocument(record.id)}
          >
            แก้ไข
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            size="small"
            onClick={() => {
              Modal.confirm({
                title: 'ยืนยันการลบ',
                content: 'คุณแน่ใจหรือไม่ที่จะลบเอกสารนี้?',
                okText: 'ยืนยัน',
                cancelText: 'ยกเลิก',
                onOk: () => handleDeleteDocument(record.id),
              })
            }}
          >
            ลบ
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Documents List */}
      <Card style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            เอกสารขนส่งทั้งหมด
          </Title>
        </div>

        <Table
          columns={columns}
          dataSource={documents}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Form Editor Section */}
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <Title
              level={4}
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <FileTextOutlined />
              แก้ไขฟอร์ม
            </Title>
            <Text type="secondary">
              {formsCount} ฟอร์ม
              {hasAnyUnsavedChanges() && (
                <span style={{ color: '#ff4d4f', marginLeft: 8 }}>
                  (มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก)
                </span>
              )}
            </Text>
          </div>

          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddForm}
            >
              เพิ่มฟอร์มใหม่
            </Button>
            <Button
              icon={<SaveOutlined />}
              onClick={handleSaveAllForms}
              disabled={!hasAnyUnsavedChanges()}
            >
              บันทึกทั้งหมด
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              onClick={handleShowExcelUploader}
            >
              นำเข้าจาก Excel
            </Button>
            <Button
              icon={<FilePdfOutlined />}
              onClick={handleGenerateAllPDFs}
              disabled={formsCount === 0}
            >
              สร้าง PDF ทั้งหมด
            </Button>
          </Space>
        </div>

        {showFormEditor && (
          <FormTabs
            forms={forms}
            activeFormId={activeFormId}
            onTabChange={handleTabChange}
            onDeleteForm={handleDeleteForm}
            onFieldChange={updateFormData}
            onClearForm={clearForm}
            onFormValidation={handleFormValidation}
            onDuplicateForm={duplicateForm}
            onSaveForm={handleSaveForm}
          />
        )}

        {!showFormEditor && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">
              คลิก &ldquo;เพิ่มฟอร์มใหม่&rdquo; หรือ &ldquo;แก้ไข&rdquo; จากตารางด้านบนเพื่อเริ่มแก้ไขฟอร์ม
            </Text>
          </div>
        )}
      </Card>

      {/* PDF Generator Modal */}
      <PDFGenerator
        visible={pdfGeneratorVisible}
        onClose={() => setPdfGeneratorVisible(false)}
        forms={forms}
      />

      {/* Excel Uploader Modal */}
      <ExcelUploader
        visible={excelUploaderVisible}
        onClose={() => setExcelUploaderVisible(false)}
        onDataImported={handleExcelDataImport}
      />
    </div>
  )
}
