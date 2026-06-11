import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ใครจัดการวันลาได้: SENIOR_STAFF ขึ้นไป
const CAN_MANAGE = ["ADMIN", "MANAGER", "SENIOR_STAFF"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const driverId = searchParams.get("driverId");
    const month = searchParams.get("month"); // format: 2026-06

    if (!driverId) {
      return NextResponse.json({ error: "กรุณาระบุคนขับ" }, { status: 400 });
    }

    const where: {
      driverId: string;
      leaveDate?: { gte: Date; lt: Date };
    } = { driverId };

    if (month) {
      const [year, mon] = month.split("-").map(Number);
      where.leaveDate = {
        gte: new Date(Date.UTC(year, mon - 1, 1)),
        lt: new Date(Date.UTC(year, mon, 1)),
      };
    }

    const leaves = await prisma.driverLeave.findMany({
      where,
      orderBy: { leaveDate: "asc" },
    });
    return NextResponse.json(leaves);
  } catch (error) {
    console.error("Error fetching leaves:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลวันลา" },
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
    return NextResponse.json({ error: "ไม่มีสิทธิ์ลงวันลา" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { driverId, leaveDate, leaveType, note } = body;

    if (!driverId || !leaveDate || !leaveType) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูลให้ครบ" },
        { status: 400 }
      );
    }
    if (!["sick", "personal", "other"].includes(leaveType)) {
      return NextResponse.json(
        { error: "ประเภทการลาไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    // leaveDate มาเป็น "YYYY-MM-DD" — เก็บเป็น UTC เที่ยงคืน (@db.Date)
    const [y, m, d] = (leaveDate as string).split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));

    // Guard 1: วันอาทิตย์เป็นวันหยุดอยู่แล้ว
    if (date.getUTCDay() === 0) {
      return NextResponse.json(
        { error: "วันอาทิตย์เป็นวันหยุดอยู่แล้ว" },
        { status: 400 }
      );
    }

    // Guard 2: วันนั้นเป็นวันหยุดบริษัท
    const holiday = await prisma.companyHoliday.findUnique({
      where: { holidayDate: date },
    });
    if (holiday) {
      return NextResponse.json(
        { error: "วันนี้เป็นวันหยุดบริษัท" },
        { status: 400 }
      );
    }

    // Guard 3: วันนั้นมีงานอยู่แล้ว
    const job = await prisma.job.findFirst({
      where: { driverId, jobDate: date },
      select: { id: true },
    });
    if (job) {
      return NextResponse.json(
        { error: "วันนี้มีงานอยู่แล้ว ลงลาไม่ได้" },
        { status: 400 }
      );
    }

    const leave = await prisma.driverLeave.create({
      data: {
        driverId,
        leaveDate: date,
        leaveType,
        note: note?.trim() || null,
        createdById: (session.user as { id: string }).id,
      },
    });
    return NextResponse.json(leave, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "ลงลาวันนี้ไว้แล้ว" },
        { status: 400 }
      );
    }
    console.error("Error creating leave:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลงวันลา" },
      { status: 500 }
    );
  }
}
