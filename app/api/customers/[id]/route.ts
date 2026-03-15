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
        { error: "กรุณากรอกชื่อลูกค้า" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { name: name.trim() },
    });
    return NextResponse.json(customer);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "ชื่อลูกค้านี้มีอยู่แล้ว" },
        { status: 400 }
      );
    }
    console.error("Error updating customer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการแก้ไขลูกค้า" },
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
    await prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting customer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลบลูกค้า" },
      { status: 500 }
    );
  }
}
