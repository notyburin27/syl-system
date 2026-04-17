import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get("date")     // YYYY-MM-DD
    const sender = searchParams.get("sender") // senderId
    const group = searchParams.get("group")   // groupId

    const where: Record<string, unknown> = {}

    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`)
      const end = new Date(`${date}T23:59:59.999Z`)
      where.sentAt = { gte: start, lte: end }
    }

    if (sender) {
      where.senderId = sender
    }

    if (group) {
      where.groupId = group
    }

    const images = await prisma.lineImage.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: 200,
    })

    return NextResponse.json(images)
  } catch (error) {
    console.error("Error fetching LINE images:", error)
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลรูปภาพ" },
      { status: 500 }
    )
  }
}
