import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const where: { isActive: boolean; type?: string } = { isActive: true };
    if (type) {
      where.type = type;
    }

    const locations = await prisma.location.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลสถานที่" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, type } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อสถานที่" },
        { status: 400 }
      );
    }

    if (type && !["factory", "general"].includes(type)) {
      return NextResponse.json(
        { error: "ประเภทสถานที่ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const location = await prisma.location.create({
      data: {
        name: name.trim(),
        type: type || "general",
      },
    });
    return NextResponse.json(location, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "ชื่อสถานที่นี้มีอยู่แล้ว" },
        { status: 400 }
      );
    }
    console.error("Error creating location:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างสถานที่" },
      { status: 500 }
    );
  }
}
