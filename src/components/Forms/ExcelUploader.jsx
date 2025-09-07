/* eslint-disable react/prop-types */
import React, { useState } from "react";
import {
  Upload,
  Button,
  Modal,
  message,
  Alert,
  Table,
  Typography,
  Space,
  Divider,
} from "antd";
import {
  UploadOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import {
  readExcelFile,
  convertExcelToFormData,
  validateExcelFile,
  getExpectedExcelColumns,
  validateExcelColumns,
} from "../../utils/excelUtils";

const { Title, Text } = Typography;
const { Dragger } = Upload;

const ExcelUploader = ({ onDataImported, visible, onClose }) => {
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [step, setStep] = useState("upload"); // 'upload', 'preview', 'confirm'

  // Handle file upload
  const handleFileUpload = async (file) => {
    // Validate file type
    if (!validateExcelFile(file)) {
      message.error("กรุณาเลือกไฟล์ Excel (.xls หรือ .xlsx) เท่านั้น");
      return false;
    }

    setUploading(true);

    try {
      // Read Excel file
      const excelData = await readExcelFile(file);

      if (excelData.length === 0) {
        message.error("ไม่พบข้อมูลที่มีค่า 'วันที่' ในไฟล์ Excel");
        return false;
      }

      // Get headers from first row for validation
      const headers = Object.keys(excelData[0].data);
      const columnValidation = validateExcelColumns(headers);

      // Convert to form data
      const formDataArray = convertExcelToFormData(excelData);

      setPreviewData(formDataArray);
      setValidationResult(columnValidation);
      setStep("preview");

      message.success(
        `อ่านไฟล์สำเร็จ! พบข้อมูลที่มีวันที่ ${formDataArray.length} แถว`
      );
    } catch (error) {
      console.error("Error reading Excel file:", error);
      message.error(`เกิดข้อผิดพลาดในการอ่านไฟล์: ${error.message}`);
    } finally {
      setUploading(false);
    }

    return false; // Prevent default upload behavior
  };

  // Handle import confirmation
  const handleImportConfirm = () => {
    if (previewData && previewData.length > 0) {
      onDataImported(previewData);
      message.success(
        `นำเข้าข้อมูลสำเร็จ! สร้างฟอร์มใหม่ ${previewData.length} ฟอร์ม`
      );
      handleClose();
    }
  };

  // Handle modal close
  const handleClose = () => {
    setPreviewData(null);
    setValidationResult(null);
    setStep("upload");
    onClose();
  };

  // Generate preview table columns
  const getPreviewColumns = () => {
    const sampleData = previewData?.[0];
    if (!sampleData) return [];

    const columns = [
      {
        title: "แถวที่",
        dataIndex: "_excelRowIndex",
        key: "_excelRowIndex",
        width: 80,
        fixed: "left",
      },
      {
        title: "ชื่อฟอร์มที่จะสร้าง",
        dataIndex: "_generatedTitle",
        key: "_generatedTitle",
        width: 200,
        fixed: "left",
        render: (title) => title || "-",
      },
    ];

    // Add columns for form fields
    const formFields = [
      { key: "date", title: "วันที่" },
      { key: "customerName", title: "ชื่อลูกค้า" },
      { key: "booking", title: "บุ๊คกิ้ง" },
      { key: "agent", title: "เอเย่นต์" },
      { key: "shipName", title: "ชื่อเรือ" },
      { key: "invoice", title: "อินวอยซ์" },
      { key: "containerSize", title: "ขนาดตู้" },
      { key: "containerNumber", title: "เบอร์ตู้" },
      { key: "sealNumber", title: "เบอร์ซีล" },
      { key: "driverName", title: "ชื่อ พขร." },
      { key: "vehicleRegistration", title: "ทะเบียนรถ" },
      { key: "phoneNumber", title: "เบอร์โทร" },
    ];

    formFields.forEach((field) => {
      if (sampleData[field.key] !== undefined) {
        columns.push({
          title: field.title,
          dataIndex: field.key,
          key: field.key,
          width: 120,
          ellipsis: true,
          render: (text) => {
            if (!text) return "-";
            // Special rendering for date field
            if (field.key === "date" && text instanceof Date) {
              return text.toLocaleDateString("th-TH");
            }
            return text;
          },
        });
      }
    });

    return columns;
  };

  // Expected columns list
  const expectedColumns = getExpectedExcelColumns();

  return (
    <Modal
      title={
        <Space>
          <FileExcelOutlined />
          <span>นำเข้าข้อมูลจากไฟล์ Excel</span>
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      width={step === "preview" ? 1200 : 600}
      footer={
        step === "upload" ? null : (
          <Space>
            <Button onClick={() => setStep("upload")}>กลับ</Button>
            <Button
              type="primary"
              onClick={handleImportConfirm}
              disabled={!previewData || previewData.length === 0}
            >
              ยืนยันการนำเข้า ({previewData?.length || 0} ฟอร์ม)
            </Button>
          </Space>
        )
      }
    >
      {step === "upload" && (
        <div>
          <Alert
            message="คำแนะนำการใช้งาน"
            description={
              <div>
                <p>1. ไฟล์ Excel ต้องมีหัวตาราง (header) ในแถวแรก</p>
                <p>2. แต่ละแถวข้อมูล = 1 ฟอร์ม</p>
                <p>
                  3.{" "}
                  <strong>
                    ระบบจะนำเข้าเฉพาะแถวที่มีค่า &ldquo;วันที่&rdquo; เท่านั้น
                  </strong>
                </p>
                <p>4. ระบบจะสร้างฟอร์มใหม่ตามจำนวนแถวข้อมูลที่มีวันที่</p>
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Divider>รูปแบบคอลัมน์ที่รองรับ</Divider>

          <div style={{ marginBottom: 16 }}>
            <Text strong>คอลัมน์ที่คาดหวัง:</Text>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                backgroundColor: "#f5f5f5",
                borderRadius: 4,
              }}
            >
              {expectedColumns.map((col, index) => (
                <span key={col} style={{ marginRight: 12, fontSize: "12px" }}>
                  {index + 1}. {col}
                </span>
              ))}
            </div>
          </div>

          <Dragger
            name="file"
            accept=".xlsx,.xls"
            beforeUpload={handleFileUpload}
            disabled={uploading}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">คลิกหรือลากไฟล์ Excel มาวางที่นี่</p>
            <p className="ant-upload-hint">
              รองรับไฟล์ .xlsx และ .xls เท่านั้น
            </p>
          </Dragger>
        </div>
      )}

      {step === "preview" && previewData && (
        <div>
          <Title level={4}>ตัวอย่างข้อมูลที่จะนำเข้า</Title>

          {/* Validation Results */}
          {validationResult && (
            <div style={{ marginBottom: 16 }}>
              {validationResult.isValid ? (
                <Alert
                  message="ตรวจสอบคอลัมน์สำเร็จ"
                  description={`พบคอลัมน์ที่ตรงกัน ${validationResult.foundColumns.length} จาก ${expectedColumns.length} คอลัมน์`}
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                />
              ) : (
                <Alert
                  message="คำเตือน: คอลัมน์ไม่ครบถ้วน"
                  description={
                    <div>
                      {validationResult.missingColumns.length > 0 && (
                        <p>
                          คอลัมน์ที่ขาดหายไป:{" "}
                          {validationResult.missingColumns.join(", ")}
                        </p>
                      )}
                      {validationResult.extraColumns.length > 0 && (
                        <p>
                          คอลัมน์เพิ่มเติม:{" "}
                          {validationResult.extraColumns.join(", ")}
                        </p>
                      )}
                    </div>
                  }
                  type="warning"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                />
              )}
            </div>
          )}

          {/* Preview Table */}
          <Table
            dataSource={previewData}
            columns={getPreviewColumns()}
            rowKey="_excelRowIndex"
            scroll={{ x: 1000, y: 400 }}
            pagination={{ pageSize: 10 }}
            size="small"
          />
        </div>
      )}
    </Modal>
  );
};

export default ExcelUploader;
