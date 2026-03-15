import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
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

    const data: { name: string; type?: string } = { name: name.trim() };
    if (type) data.type = type;

    const location = await prisma.location.update({
      where: { id },
      data,
    });
    return NextResponse.json(location);
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
    console.error("Error updating location:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการแก้ไขสถานที่" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.location.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting location:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลบสถานที่" },
      { status: 500 }
    );
  }
}
