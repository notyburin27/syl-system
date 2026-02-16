"use client";

import { useState } from "react";
import {
  Upload,
  Button,
  Card,
  Row,
  Col,
  Statistic,
  message,
  Typography,
  Space,
  Alert,
  Spin,
  Radio,
} from "antd";
import {
  InboxOutlined,
  DownloadOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd";
import type { BankType } from "@/lib/utils/statementPdfParser";

const { Title } = Typography;
const { Dragger } = Upload;

interface ConvertResult {
  blob: Blob;
  filename: string;
  totalTransactions: number;
  totalCredit: number;
  totalDebit: number;
  finalBalance: number;
}

export default function StatementConverterPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bankType, setBankType] = useState<BankType>("SCB");

  const handleUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bankType", bankType);

      const response = await fetch("/api/convert-statement", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to convert file");
      }

      const blob = await response.blob();
      const filename =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] || "bank_statement.xlsx";

      const convertResult: ConvertResult = {
        blob,
        filename,
        totalTransactions: Number(
          response.headers.get("X-Total-Transactions") || 0
        ),
        totalCredit: Number(response.headers.get("X-Total-Credit") || 0),
        totalDebit: Number(response.headers.get("X-Total-Debit") || 0),
        finalBalance: Number(response.headers.get("X-Final-Balance") || 0),
      };

      setResult(convertResult);

      message.success(
        `แปลงสำเร็จ! พบ ${convertResult.totalTransactions} รายการ`
      );
    } catch (err: any) {
      setError(err.message);
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Title level={3}>แปลง Bank Statement (PDF → Excel)</Title>

      <Card style={{ marginBottom: 24 }}>
        <Radio.Group
          value={bankType}
          onChange={(e) => {
            setBankType(e.target.value);
            setFileList([]);
            setResult(null);
            setError(null);
          }}
          disabled={loading}
        >
          <Radio.Button value="SCB">SCB (ไทยพาณิชย์)</Radio.Button>
          <Radio.Button value="KBANK">KBANK (กสิกรไทย)</Radio.Button>
        </Radio.Group>
      </Card>

      {loading ? (
        <Card style={{ marginBottom: 24, textAlign: "center", padding: 40 }}>
          <Spin
            indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />}
          />
          <p style={{ marginTop: 16, fontSize: 16, color: "#666" }}>
            กำลังแปลงไฟล์...
          </p>
        </Card>
      ) : (
        <Card style={{ marginBottom: 24 }}>
          <Dragger
            accept=".pdf"
            maxCount={1}
            fileList={fileList}
            beforeUpload={(file) => {
              // Validate file type
              if (
                file.type !== "application/pdf" &&
                !file.name.endsWith(".pdf")
              ) {
                message.error("กรุณาเลือกไฟล์ PDF เท่านั้น");
                return Upload.LIST_IGNORE;
              }

              // Validate file size (10MB)
              if (file.size > 10 * 1024 * 1024) {
                message.error("ไฟล์ต้องมีขนาดไม่เกิน 10MB");
                return Upload.LIST_IGNORE;
              }

              setFileList([
                {
                  uid: file.uid,
                  name: file.name,
                  status: "done",
                  originFileObj: file,
                },
              ]);
              handleUpload(file);
              return false; // Prevent default upload behavior
            }}
            onRemove={() => {
              setFileList([]);
              setResult(null);
              setError(null);
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              คลิกหรือลากไฟล์ PDF Bank Statement มาที่นี่
            </p>
            <p className="ant-upload-hint">
              รองรับไฟล์ PDF จาก{bankType === "SCB" ? "ธนาคารไทยพาณิชย์ (SCB)" : "ธนาคารกสิกรไทย (KBANK)"} ขนาดไม่เกิน 10MB
            </p>
          </Dragger>
        </Card>
      )}

      {error && (
        <Alert
          message="เกิดข้อผิดพลาด"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 24 }}
        />
      )}

      {result && (
        <>
          <Card title="สรุปผลการแปลง" style={{ marginBottom: 24 }}>
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Statistic
                  title="จำนวนรายการ"
                  value={result.totalTransactions}
                  suffix="รายการ"
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="ยอดรับเงินรวม"
                  value={result.totalCredit}
                  precision={2}
                  valueStyle={{ color: "#3f8600" }}
                  prefix="+"
                  suffix="฿"
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="ยอดจ่ายเงินรวม"
                  value={Math.abs(result.totalDebit)}
                  precision={2}
                  valueStyle={{ color: "#cf1322" }}
                  prefix="-"
                  suffix="฿"
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="ยอดคงเหลือสุดท้าย"
                  value={result.finalBalance}
                  precision={2}
                  suffix="฿"
                />
              </Col>
            </Row>
          </Card>

          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => downloadFile(result.blob, result.filename)}
              size="large"
            >
              ดาวน์โหลด Excel
            </Button>
          </Space>
        </>
      )}
    </div>
  );
}
