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
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อคนขับ" },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.update({
      where: { id },
      data: { name: name.trim() },
      include: { bankAccounts: true },
    });
    return NextResponse.json(driver);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "ชื่อคนขับนี้มีอยู่แล้ว" },
        { status: 400 }
      );
    }
    console.error("Error updating driver:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการแก้ไขคนขับ" },
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
    await prisma.driver.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting driver:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลบคนขับ" },
      { status: 500 }
    );
  }
}
