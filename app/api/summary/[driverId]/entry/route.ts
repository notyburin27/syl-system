import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * field ที่อนุญาตให้แก้ได้เท่านั้น — whitelist ไม่ใช่ blacklist
 * กันไม่ให้ยิงชื่อ field อื่น (เช่น updatedById) เข้ามาเขียนทับผ่าน API
 */
const EDITABLE_FIELDS = [
  "carryTrips",
  "fuelDeduction",
  "otherExpenses",
  "driverPayout",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

/** carryTrips เป็นจำนวนเที่ยว — ต้องเป็นจำนวนเต็มไม่ติดลบ */
const INTEGER_FIELDS: EditableField[] = ["carryTrips"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขข้อมูลนี้" }, { status: 403 });
  }

  try {
    const { driverId } = await params;
    const body = await req.json();
    const { month, field, value, values } = body as {
      month?: string;
      field?: string;
      value?: number | null;
      /** แก้หลายช่องพร้อมกัน — ใช้แทน field/value เดี่ยว */
      values?: Record<string, number | null>;
    };

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json(
        { error: "กรุณาระบุเดือนให้ถูกต้อง (YYYY-MM)" },
        { status: 400 }
      );
    }

    // รวมสองรูปแบบ: {field,value} ช่องเดียว หรือ {values:{...}} หลายช่อง
    const patch: Record<string, number | null> =
      values && typeof values === "object" && !Array.isArray(values)
        ? values
        : field
          ? { [field]: value ?? null }
          : {};

    const keys = Object.keys(patch);
    if (keys.length === 0) {
      return NextResponse.json({ error: "ไม่มีข้อมูลให้บันทึก" }, { status: 400 });
    }

    for (const k of keys) {
      if (!EDITABLE_FIELDS.includes(k as EditableField)) {
        return NextResponse.json(
          { error: "ไม่สามารถแก้ไขช่องนี้ได้" },
          { status: 400 }
        );
      }
      const v = patch[k];
      // null = ล้างค่า (กลับไปเป็นช่องว่าง) ถือว่าถูกต้อง
      if (v !== null && typeof v !== "number") {
        return NextResponse.json({ error: "ค่าที่กรอกต้องเป็นตัวเลข" }, { status: 400 });
      }
      if (v !== null && !Number.isFinite(v)) {
        return NextResponse.json({ error: "ค่าที่กรอกไม่ถูกต้อง" }, { status: 400 });
      }
      if (
        v !== null &&
        INTEGER_FIELDS.includes(k as EditableField) &&
        (!Number.isInteger(v) || v < 0)
      ) {
        return NextResponse.json(
          { error: "จำนวนเที่ยวต้องเป็นจำนวนเต็มไม่ติดลบ" },
          { status: 400 }
        );
      }
    }

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      return NextResponse.json({ error: "ไม่พบคนขับ" }, { status: 404 });
    }

    const entry = await prisma.driverMonthlyEntry.upsert({
      where: { driverId_month: { driverId, month } },
      create: {
        driverId,
        month,
        ...patch,
        updatedById: session.user.id,
      },
      update: {
        ...patch,
        updatedById: session.user.id,
      },
      select: {
        month: true,
        carryTrips: true,
        fuelDeduction: true,
        otherExpenses: true,
        driverPayout: true,
      },
    });

    // แปลง Decimal เป็น number ให้ client ใช้ได้ทันที และคง null ไว้ถ้ายังไม่กรอก
    return NextResponse.json({
      month: entry.month,
      carryTrips: entry.carryTrips,
      fuelDeduction: entry.fuelDeduction != null ? Number(entry.fuelDeduction) : null,
      otherExpenses: entry.otherExpenses != null ? Number(entry.otherExpenses) : null,
      driverPayout: entry.driverPayout != null ? Number(entry.driverPayout) : null,
    });
  } catch (error) {
    console.error("Error saving monthly entry:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการบันทึก" },
      { status: 500 }
    );
  }
}
