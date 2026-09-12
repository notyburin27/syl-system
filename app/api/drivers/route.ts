import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const drivers = await prisma.driver.findMany({
      where: { isActive: true },
      include: { bankAccounts: true },
      orderBy: { name: "asc" },
    });

    // ฐานเงินเดือนเป็นข้อมูลลับ — ตัดออกก่อนส่งให้ role ที่ไม่ใช่ ADMIN
    // ต้องกรองที่นี่ ไม่ใช่แค่ซ่อนใน UI เพราะ MANAGER ยิง API ตรงๆ ได้
    if (session.user.role !== "ADMIN") {
      const safe = drivers.map(({ baseSalary: _baseSalary, ...rest }) => rest);
      return NextResponse.json(safe);
    }

    return NextResponse.json(drivers);
  } catch (error) {
    console.error("Error fetching drivers:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลคนขับ" },
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
    const { name, vehicleNumber, vehicleRegistration, groupName, baseSalary, startDate } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อคนขับ" },
        { status: 400 }
      );
    }

    const isAdmin = session.user.role === "ADMIN";

    const driver = await prisma.driver.create({
      data: {
        name: name.trim(),
        vehicleNumber: vehicleNumber?.trim() || null,
        vehicleRegistration: vehicleRegistration?.trim() || null,
        groupName: groupName?.trim() || null,
        startDate: startDate ? new Date(startDate) : null,
        // non-admin ส่ง baseSalary มาก็เพิกเฉย
        ...(isAdmin && { baseSalary: baseSalary != null ? baseSalary : null }),
      },
      include: { bankAccounts: true },
    });
    return NextResponse.json(driver, { status: 201 });
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
    console.error("Error creating driver:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างคนขับ" },
      { status: 500 }
    );
  }
}
