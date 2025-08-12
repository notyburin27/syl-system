/* eslint-disable react/prop-types */
import React, { useState } from "react";
import {
  Modal,
  Progress,
  Typography,
  List,
  Button,
  message,
  Radio,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import {
  generateMultiplePDFs,
  generateCombinedPDF,
  validateFormForPDF,
} from "../../utils/pdfUtils";

const { Title, Text } = Typography;

const PDFGenerator = ({
  visible,
  onClose,
  forms,
  mode: _mode = "multiple", // 'single', 'multiple', or 'combined'
}) => {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentForm, setCurrentForm] = useState("");
  const [results, setResults] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [pdfMode, setPdfMode] = useState("combined"); // 'separate' or 'combined'

  const handleGeneratePDFs = async () => {
    // Validate all forms first
    const validationResults = forms.map((form) => ({
      form,
      validation: validateFormForPDF(form.data),
    }));

    const invalidForms = validationResults.filter(
      (result) => !result.validation.isValid
    );

    if (invalidForms.length > 0) {
      message.error(
        `${invalidForms.length} form(s) have missing required fields. Please complete all forms before generating PDFs.`
      );
      return;
    }

    setGenerating(true);
    setProgress(0);
    setResults([]);
    setCompleted(false);

    try {
      if (pdfMode === "combined") {
        // Generate single combined PDF
        const result = await generateCombinedPDF(forms, (progressInfo) => {
          const percentage = Math.round(
            (progressInfo.current / progressInfo.total) * 100
          );
          setProgress(percentage);
          setCurrentForm(progressInfo.formTitle || "");

          if (progressInfo.status === "completed") {
            setCompleted(true);
            setCurrentForm("");
          }
        });

        setResults([
          {
            formId: "combined",
            formTitle: `Combined PDF (${forms.length} forms)`,
            ...result,
          },
        ]);

        if (result.success) {
          message.success(
            `Combined PDF with ${forms.length} forms generated successfully!`
          );
        } else {
          message.error("Combined PDF generation failed");
        }
      } else {
        // Generate separate PDFs
        const pdfResults = await generateMultiplePDFs(forms, (progressInfo) => {
          const percentage = Math.round(
            (progressInfo.current / progressInfo.total) * 100
          );
          setProgress(percentage);
          setCurrentForm(progressInfo.formTitle || "");

          if (progressInfo.status === "completed") {
            setCompleted(true);
            setCurrentForm("");
          }
        });

        setResults(pdfResults);

        const successCount = pdfResults.filter(
          (result) => result.success
        ).length;
        const failCount = pdfResults.filter((result) => !result.success).length;

        if (failCount === 0) {
          message.success(`All ${successCount} PDFs generated successfully!`);
        } else {
          message.warning(
            `${successCount} PDFs generated successfully, ${failCount} failed.`
          );
        }
      }
    } catch (error) {
      message.error("PDF generation process failed");
      console.error("PDF generation error:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    if (!generating) {
      setProgress(0);
      setCurrentForm("");
      setResults([]);
      setCompleted(false);
      setPdfMode("combined"); // Reset to default
      onClose();
    }
  };

  const getStatusIcon = (success) => {
    if (success) {
      return <CheckCircleOutlined style={{ color: "#52c41a" }} />;
    } else {
      return <CloseCircleOutlined style={{ color: "#ff4d4f" }} />;
    }
  };

  return (
    <Modal
      title="Generate Transport Document PDFs"
      open={visible}
      onCancel={handleClose}
      footer={[
        <Button key="close" onClick={handleClose} disabled={generating}>
          {completed ? "Close" : "Cancel"}
        </Button>,
        !completed && !generating && (
          <Button key="generate" type="primary" onClick={handleGeneratePDFs}>
            Generate PDF
            {pdfMode === "combined" ? " (Combined)" : "s (Separate)"}
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
              <Text style={{ display: "block", marginBottom: 8 }}>
                Choose PDF generation mode:
              </Text>
              <Radio.Group
                value={pdfMode}
                onChange={(e) => setPdfMode(e.target.value)}
                style={{ width: "100%" }}
              >
                <Radio.Button value="combined" style={{ width: "50%" }}>
                  📄 Combined PDF (Single file, multiple pages)
                </Radio.Button>
                <Radio.Button value="separate" style={{ width: "50%" }}>
                  📄📄 Separate PDFs (Multiple files)
                </Radio.Button>
              </Radio.Group>
            </div>

            <Text type="secondary">
              {pdfMode === "combined"
                ? `Generate 1 PDF file with ${forms.length} pages (one page per form)`
                : `Generate ${forms.length} separate PDF files`}
            </Text>

            <List
              size="small"
              style={{ marginTop: 16 }}
              dataSource={forms}
              renderItem={(form, index) => (
                <List.Item>
                  <Text>
                    {pdfMode === "combined"
                      ? `Page ${index + 1}`
                      : `File ${index + 1}`}
                    : {form.title}
                  </Text>
                </List.Item>
              )}
            />
          </div>
        )}

        {generating && (
          <div style={{ textAlign: "center" }}>
            <LoadingOutlined style={{ fontSize: 24, marginBottom: 16 }} />
            <Title level={4}>Generating PDFs...</Title>
            <Progress percent={progress} status="active" />
            {currentForm && (
              <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                Processing: {currentForm}
              </Text>
            )}
          </div>
        )}

        {completed && results.length > 0 && (
          <div>
            <Title level={4}>Generation Results</Title>
            <List
              dataSource={results}
              renderItem={(result) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={getStatusIcon(result.success)}
                    title={result.formTitle}
                    description={
                      result.success
                        ? `Successfully generated: ${result.filename}`
                        : `Failed: ${result.error}`
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PDFGenerator;
