import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// วันหยุดบริษัทเป็นข้อมูลส่วนกลาง: ADMIN / MANAGER เท่านั้น
const CAN_MANAGE = ["ADMIN", "MANAGER"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // format: 2026-06

    const where: { holidayDate?: { gte: Date; lt: Date } } = {};
    if (month) {
      const [year, mon] = month.split("-").map(Number);
      where.holidayDate = {
        gte: new Date(Date.UTC(year, mon - 1, 1)),
        lt: new Date(Date.UTC(year, mon, 1)),
      };
    }

    const holidays = await prisma.companyHoliday.findMany({
      where,
      orderBy: { holidayDate: "asc" },
    });
    return NextResponse.json(holidays);
  } catch (error) {
    console.error("Error fetching holidays:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลวันหยุด" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!CAN_MANAGE.includes((session.user as { role?: string }).role ?? "")) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เพิ่มวันหยุด" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { holidayDate, name } = body;

    if (!holidayDate || !name?.trim()) {
      return NextResponse.json(
        { error: "กรุณากรอกวันที่และชื่อวันหยุด" },
        { status: 400 }
      );
    }

    const [y, m, d] = (holidayDate as string).split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));

    const holiday = await prisma.companyHoliday.create({
      data: { holidayDate: date, name: name.trim(), createdById: (session.user as { id: string }).id },
    });
    return NextResponse.json(holiday, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "วันที่นี้ถูกตั้งเป็นวันหยุดไว้แล้ว" },
        { status: 400 }
      );
    }
    console.error("Error creating holiday:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการเพิ่มวันหยุด" },
      { status: 500 }
    );
  }
}
