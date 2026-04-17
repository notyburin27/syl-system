import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { prisma } from "@/lib/prisma"
import { spacesClient, SPACES_BUCKET, SPACES_CDN_BASE } from "@/lib/spaces"

interface LineMessageEvent {
  type: string
  message?: { id: string; type: string }
  source: { type: string; groupId?: string; userId?: string }
  timestamp: number
}

function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false
  const channelSecret = process.env.LINE_CHANNEL_SECRET!
  const hmac = crypto.createHmac("sha256", channelSecret).update(body).digest("base64")
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature))
  } catch {
    return false
  }
}

async function downloadLineImage(messageId: string): Promise<Buffer> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN!}` },
    }
  )
  if (!res.ok) throw new Error(`LINE Content API error: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function getSenderDisplayName(userId: string, groupId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`,
      {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN!}` },
      }
    )
    if (!res.ok) return userId
    const data = await res.json()
    return (data.displayName as string) ?? userId
  } catch {
    return userId
  }
}

async function getGroupName(groupId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.line.me/v2/bot/group/${groupId}/summary`,
      {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN!}` },
      }
    )
    if (!res.ok) return groupId
    const data = await res.json()
    return (data.groupName as string) ?? groupId
  } catch {
    return groupId
  }
}

async function uploadToSpaces(imageBuffer: Buffer, messageId: string): Promise<string> {
  const month = new Date().toISOString().slice(0, 7) // YYYY-MM
  const key = `line-images/${month}/${messageId}.jpg`

  await spacesClient.send(
    new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: key,
      Body: imageBuffer,
      ContentType: "image/jpeg",
      ACL: "public-read",
    })
  )

  const base =
    SPACES_CDN_BASE ??
    `https://${SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com`
  return `${base}/${key}`
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-line-signature")

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as { events: LineMessageEvent[] }

  // กรองเฉพาะ image events จาก group
  const imageEvents = payload.events.filter(
    (event) =>
      event.type === "message" &&
      event.message?.type === "image" &&
      event.source.type === "group" &&
      event.source.groupId &&
      event.source.userId
  )

  // process ทุกรูปพร้อมกัน (parallel)
  await Promise.allSettled(
    imageEvents.map(async (event) => {
      const groupId = event.source.groupId!
      const userId = event.source.userId!
      const messageId = event.message!.id

      // Idempotency check
      const existing = await prisma.lineImage.findUnique({ where: { messageId } })
      if (existing) return

      const [imageBuffer, senderDisplayName, groupName] = await Promise.all([
        downloadLineImage(messageId),
        getSenderDisplayName(userId, groupId),
        getGroupName(groupId),
      ])

      const imageUrl = await uploadToSpaces(imageBuffer, messageId)

      await prisma.lineImage.create({
        data: {
          messageId,
          imageUrl,
          senderId: userId,
          senderDisplayName,
          groupId,
          groupName,
          sentAt: new Date(event.timestamp),
        },
      })
    })
  )

  return NextResponse.json({ status: "ok" })
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
