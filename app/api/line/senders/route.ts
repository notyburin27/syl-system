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
    const group = searchParams.get("group")

    const rows = await prisma.lineImage.findMany({
      where: group ? { groupId: group } : undefined,
      distinct: ["senderId"],
      select: { senderId: true, senderDisplayName: true },
      orderBy: { senderDisplayName: "asc" },
    })
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching LINE senders:", error)
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ส่ง" },
      { status: 500 }
    )
  }
}
