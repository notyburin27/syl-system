"use client";

import { useState } from "react";
import {
  Card,
  Upload,
  Button,
  Typography,
  App,
  Table,
  Alert,
  Space,
  Tag,
} from "antd";
import {
  UploadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  readWorkOrderExcel,
  validateWorkOrderExcelFile,
  generateWorkOrderPdf,
  WorkOrderRow,
} from "@/lib/utils/workOrderUtils";

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

const EXPECTED_COLUMNS = [
  "วันที่",
  "ชื่อผู้ว่าจ้าง",
  "Booking No.",
  "เอเย่น",
  "ขนาดตู้",
  "วันที่รับตู้",
  "สถานที่รับตู้",
  "วันที่เข้าโรงงาน",
  "สถานที่โรงงาน",
  "วันที่คืนตู้",
  "สถานที่คืนตู้",
  "CLOSING TIME",
  "ชื่อเรือ",
  "เบอร์ตู้1",
  "เบอร์ซีล1",
  "เบอร์ตู้2",
  "เบอร์ซีล2",
  "ชื่อ พขร.",
  "ทะเบียนรถ",
  "โทร",
  "หมายเหตุ",
  "ชื่อที่อยู่ออกใบเสร็จ",
];

export default function WorkOrdersPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleUpload = async (file: File) => {
    if (!validateWorkOrderExcelFile(file)) {
      message.error("กรุณาเลือกไฟล์ Excel (.xls หรือ .xlsx) เท่านั้น");
      return false;
    }

    setParsing(true);
    try {
      const parsed = await readWorkOrderExcel(file);
      if (parsed.length === 0) {
        message.warning("ไม่พบข้อมูลในไฟล์ Excel");
        setRows([]);
      } else {
        setRows(parsed);
        setFileName(file.name);
        message.success(`อ่านไฟล์สำเร็จ พบข้อมูล ${parsed.length} แถว`);
      }
    } catch (err: any) {
      console.error(err);
      message.error(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setParsing(false);
    }
    return false;
  };

  const handleGeneratePdf = async () => {
    if (rows.length === 0) {
      message.warning("กรุณาอัปโหลดไฟล์ Excel ก่อน");
      return;
    }
    setGenerating(true);
    message.loading({ content: `กำลังสร้าง PDF... (0/${rows.length})`, key: "wo-pdf", duration: 0 });
    try {
      const result = await generateWorkOrderPdf(rows, (current, total) => {
        message.loading({ content: `กำลังสร้าง PDF... (${current}/${total})`, key: "wo-pdf", duration: 0 });
      });
      if (result.success) {
        message.success({
          content: `สร้าง PDF สำเร็จ: ${result.filename}`,
          key: "wo-pdf",
        });
      } else {
        message.error({
          content: `สร้าง PDF ล้มเหลว: ${result.error}`,
          key: "wo-pdf",
        });
      }
    } catch (err: any) {
      message.error({
        content: `เกิดข้อผิดพลาด: ${err.message}`,
        key: "wo-pdf",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setRows([]);
    setFileName("");
  };

  const columns: ColumnsType<WorkOrderRow> = [
    {
      title: "#",
      key: "index",
      width: 50,
      render: (_, __, index) => index + 1,
    },
    {
      title: "วันที่",
      dataIndex: "date",
      key: "date",
      width: 90,
      render: (v) => v || "-",
    },
    {
      title: "ชื่อลูกค้า",
      dataIndex: "customerName",
      key: "customerName",
      ellipsis: true,
      render: (v) => v || "-",
    },
    {
      title: "Booking",
      dataIndex: "booking",
      key: "booking",
      width: 140,
      render: (v) => v || "-",
    },
    {
      title: "เอเย่นต์",
      dataIndex: "agent",
      key: "agent",
      width: 100,
      render: (v) => v || "-",
    },
    {
      title: "ขนาดตู้",
      dataIndex: "containerSize",
      key: "containerSize",
      width: 90,
      render: (v) => v || "-",
    },
    {
      title: "รับตู้",
      dataIndex: "pickupCombined",
      key: "pickupCombined",
      ellipsis: true,
      render: (v) => v || "-",
    },
    {
      title: "บรรจุ",
      dataIndex: "factoryCombined",
      key: "factoryCombined",
      ellipsis: true,
      render: (v) => v || "-",
    },
    {
      title: "เบอร์ตู้1",
      dataIndex: "containerNumber1",
      key: "containerNumber1",
      width: 110,
      render: (v) => v || "-",
    },
    {
      title: "เบอร์ตู้2",
      dataIndex: "containerNumber2",
      key: "containerNumber2",
      width: 110,
      render: (v) => v || "-",
    },
    {
      title: "พขร.",
      dataIndex: "driverName",
      key: "driverName",
      width: 110,
      render: (v) => v || "-",
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginTop: 0 }}>
          ใบงานขนส่ง
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          อัปโหลดไฟล์ Excel เพื่อสร้าง PDF ใบงานขนส่ง 1 แถว = 1 หน้า
        </Paragraph>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Alert
          message="คอลัมน์ที่รองรับใน Excel"
          description={
            <div style={{ fontSize: 12 }}>
              {EXPECTED_COLUMNS.map((c) => (
                <Tag key={c} style={{ marginBottom: 4 }}>
                  {c}
                </Tag>
              ))}
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Dragger
          name="file"
          accept=".xlsx,.xls"
          beforeUpload={handleUpload}
          disabled={parsing}
          showUploadList={false}
          multiple={false}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">คลิกหรือลากไฟล์ Excel มาวางที่นี่</p>
          <p className="ant-upload-hint">รองรับ .xlsx และ .xls</p>
        </Dragger>

        {fileName && (
          <div style={{ marginTop: 12 }}>
            <Space>
              <FileExcelOutlined style={{ color: "#52c41a" }} />
              <Text>{fileName}</Text>
              <Text type="secondary">({rows.length} แถว)</Text>
            </Space>
          </div>
        )}
      </Card>

      {rows.length > 0 && (
        <Card
          title={`ตัวอย่างข้อมูล (${rows.length} แถว)`}
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                ล้างข้อมูล
              </Button>
              <Button
                type="primary"
                icon={<FilePdfOutlined />}
                onClick={handleGeneratePdf}
                loading={generating}
              >
                สร้าง PDF
              </Button>
            </Space>
          }
        >
          <Table
            dataSource={rows}
            columns={columns}
            rowKey={(_, idx) => String(idx)}
            scroll={{ x: 1400 }}
            size="small"
            pagination={{ pageSize: 20 }}
          />
        </Card>
      )}
    </div>
  );
}
