import React, { useState } from "react";
import { Button, Card, Space, Typography, message } from "antd";
import {
  PlusOutlined,
  FilePdfOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { useFormManager } from "../hooks/useFormManager";
import FormTabs from "../components/Forms/FormTabs";
import PDFGenerator from "../components/Forms/PDFGenerator";

const { Title, Text } = Typography;

const TransportDocuments = () => {
  const {
    forms,
    activeFormId,
    setActiveFormId,
    addForm,
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

  // Handle clear all forms
  const handleClearAllForms = () => {
    forms.forEach((form) => clearForm(form.id));
    message.success("All forms cleared successfully");
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
    </div>
  );
};

export default TransportDocuments;
