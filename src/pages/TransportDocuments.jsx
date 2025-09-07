import React, { useState } from "react";
import { Button, Card, Space, Typography, message } from "antd";
import {
  PlusOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import { useFormManager } from "../hooks/useFormManager";
import FormTabs from "../components/Forms/FormTabs";
import PDFGenerator from "../components/Forms/PDFGenerator";
import ExcelUploader from "../components/Forms/ExcelUploader";

const { Title, Text } = Typography;

const TransportDocuments = () => {
  const {
    forms,
    activeFormId,
    setActiveFormId,
    addForm,
    addFormWithData,
    deleteForm,
    duplicateForm,
    updateFormData,
    clearForm,
    setFormError,
    formsCount,
    validateAllForms,
  } = useFormManager();

  const [pdfGeneratorVisible, setPdfGeneratorVisible] = useState(false);
  const [pdfMode, setPdfMode] = useState("multiple");
  const [excelUploaderVisible, setExcelUploaderVisible] = useState(false);

  // Handle adding new form
  const handleAddForm = () => {
    addForm();
    message.success("New form added successfully");
  };

  // Handle form deletion
  const handleDeleteForm = (formId) => {
    if (forms.length === 1) {
      message.warning("At least one form is required");
      return;
    }

    const formToDelete = forms.find((f) => f.id === formId);
    deleteForm(formId);
    message.success(`${formToDelete?.title} deleted successfully`);
  };

  // Handle tab change
  const handleTabChange = (formId) => {
    setActiveFormId(formId);
  };

  // Handle form validation
  const handleFormValidation = (formId, hasErrors) => {
    setFormError(formId, hasErrors);
  };

  // Handle generate all PDFs
  const handleGenerateAllPDFs = () => {
    const validationResults = validateAllForms();
    const invalidForms = validationResults.filter(
      (result) => !result.validation.isValid
    );

    if (invalidForms.length > 0) {
      message.error(
        `${invalidForms.length} form(s) have missing required fields. Please complete all forms before generating PDFs.`
      );
      return;
    }

    setPdfMode("combined");
    setPdfGeneratorVisible(true);
  };

  // Handle clear all forms (reserved for future use)
  // const handleClearAllForms = () => {
  //   forms.forEach((form) => clearForm(form.id));
  //   message.success("All forms cleared successfully");
  // };

  // Handle Excel data import
  const handleExcelDataImport = (excelDataArray) => {
    try {
      // Store original forms to delete later
      const originalForms = [...forms];

      // Create new forms from Excel data first
      excelDataArray.forEach((rowData) => {
        // Remove Excel-specific fields from rowData
        const formData = { ...rowData };
        const generatedTitle = formData._generatedTitle;
        delete formData._excelRowIndex;
        delete formData._originalData;
        delete formData._generatedTitle;

        // Create form with data in one go
        addFormWithData(formData, generatedTitle);
      });

      // Now delete the original forms (including the empty default form)
      originalForms.forEach((form) => deleteForm(form.id));

      setExcelUploaderVisible(false);
      message.success(
        `นำเข้าข้อมูลสำเร็จ! สร้าง ${excelDataArray.length} ฟอร์มแล้ว`
      );
    } catch (error) {
      console.error("Error importing Excel data:", error);
      message.error("เกิดข้อผิดพลาดในการนำเข้าข้อมูล");
    }
  };

  // Handle show Excel uploader
  const handleShowExcelUploader = () => {
    setExcelUploaderVisible(true);
  };

  return (
    <div>
      {/* Header with controls */}
      <Card style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <Title
              level={3}
              style={{
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <FileTextOutlined />
              Transport Documents
            </Title>
            <Text type="secondary" className="form-counter">
              {formsCount} form{formsCount > 1 ? "s" : ""} active
            </Text>
          </div>

          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddForm}
            >
              Add New Form
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              onClick={handleShowExcelUploader}
            >
              Import from Excel
            </Button>
            <Button
              type="default"
              icon={<FilePdfOutlined />}
              onClick={handleGenerateAllPDFs}
              disabled={formsCount === 0}
            >
              Generate All PDFs
            </Button>
          </Space>
        </div>
      </Card>

      {/* Form Tabs */}
      <FormTabs
        forms={forms}
        activeFormId={activeFormId}
        onTabChange={handleTabChange}
        onDeleteForm={handleDeleteForm}
        onFieldChange={updateFormData}
        onClearForm={clearForm}
        onFormValidation={handleFormValidation}
        onDuplicateForm={duplicateForm}
      />

      {/* PDF Generator Modal */}
      <PDFGenerator
        visible={pdfGeneratorVisible}
        onClose={() => setPdfGeneratorVisible(false)}
        forms={forms}
        mode={pdfMode}
      />

      {/* Excel Uploader Modal */}
      <ExcelUploader
        visible={excelUploaderVisible}
        onClose={() => setExcelUploaderVisible(false)}
        onDataImported={handleExcelDataImport}
      />
    </div>
  );
};

export default TransportDocuments;
