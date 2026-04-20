"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DatePicker,
  Select,
  Row,
  Col,
  Image,
  Card,
  Typography,
  Space,
  Spin,
  Empty,
  App,
} from "antd"
import dayjs, { Dayjs } from "dayjs"
import type { LineImage, LineSender, LineGroup } from "@/types/line"

const { Text } = Typography

export default function LineImagesPage() {
  const { message } = App.useApp()
  const [images, setImages] = useState<LineImage[]>([])
  const [senders, setSenders] = useState<LineSender[]>([])
  const [groups, setGroups] = useState<LineGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState<Dayjs | null>(null)
  const [sender, setSender] = useState<string | undefined>(undefined)
  const [group, setGroup] = useState<string | undefined>(undefined)

  useEffect(() => {
    fetch("/api/line/groups")
      .then((r) => r.json())
      .then(setGroups)
      .catch(() => message.error("ไม่สามารถโหลดข้อมูลกลุ่มได้"))
  }, [message])

  useEffect(() => {
    const params = group ? `?group=${group}` : ""
    fetch(`/api/line/senders${params}`)
      .then((r) => r.json())
      .then(setSenders)
      .catch(() => message.error("ไม่สามารถโหลดข้อมูลผู้ส่งได้"))
  }, [group, message])

  const fetchImages = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (date) params.set("date", date.format("YYYY-MM-DD"))
    if (sender) params.set("sender", sender)
    if (group) params.set("group", group)

    try {
      const res = await fetch(`/api/line/images?${params.toString()}`)
      const data = await res.json()
      setImages(data)
    } catch {
      message.error("ไม่สามารถโหลดรูปภาพได้")
    } finally {
      setLoading(false)
    }
  }, [date, sender, group, message])

  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  return (
    <div style={{ padding: 24 }}>
      <Text strong style={{ fontSize: 20, display: "block", marginBottom: 16 }}>
        รูปภาพจาก LINE
      </Text>

      <Space style={{ marginBottom: 24 }} wrap>
        <DatePicker
          value={date}
          onChange={setDate}
          format="DD/MM/YYYY"
          placeholder="เลือกวันที่"
          allowClear
        />
        <Select
          value={group}
          onChange={(val) => { setGroup(val); setSender(undefined) }}
          allowClear
          placeholder="เลือกกลุ่ม"
          style={{ minWidth: 200 }}
          options={groups.map((g) => ({
            value: g.groupId,
            label: g.groupName,
          }))}
        />
        <Select
          value={sender}
          onChange={setSender}
          allowClear
          placeholder="เลือกผู้ส่ง"
          style={{ minWidth: 200 }}
          options={senders.map((s) => ({
            value: s.senderId,
            label: s.senderDisplayName,
          }))}
        />
      </Space>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : images.length === 0 ? (
        <Empty description="ไม่มีรูปภาพ" />
      ) : (
        <>
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            ทั้งหมด {images.length} รูป
          </Text>
          <Image.PreviewGroup>
            <Row gutter={[16, 16]}>
              {images.map((img) => (
                <Col key={img.id} xs={12} sm={8} md={6} lg={4}>
                  <Card
                    cover={
                      <Image
                        src={img.imageUrl}
                        alt={img.senderDisplayName}
                        style={{ objectFit: "cover", height: 150, width: "100%" }}
                      />
                    }
                    size="small"
                    styles={{ body: { padding: "8px 12px" } }}
                  >
                    <Text strong style={{ fontSize: 12, display: "block" }}>
                      {img.senderDisplayName}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                      {img.groupName}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {dayjs(img.sentAt).format("DD/MM/YY HH:mm")}
                    </Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </Image.PreviewGroup>
        </>
      )}
    </div>
  )
}
