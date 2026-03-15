import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const customers = await prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า" },
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
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อลูกค้า" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.create({
      data: { name: name.trim() },
    });
    return NextResponse.json(customer, { status: 201 });
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
    console.error("Error creating customer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างลูกค้า" },
      { status: 500 }
    );
  }
}
