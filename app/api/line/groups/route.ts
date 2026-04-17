import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const rows = await prisma.lineImage.findMany({
      distinct: ["groupId"],
      select: { groupId: true, groupName: true },
      orderBy: { groupName: "asc" },
    })
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching LINE groups:", error)
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลกลุ่ม" },
      { status: 500 }
    )
  }
}
