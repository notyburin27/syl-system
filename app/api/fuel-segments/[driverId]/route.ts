import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { RATE_ROLES } from "@/lib/settingsNav";
import { buildFuelStandardSummaries } from "@/lib/utils/fuelSegmentsQuery";

/** ช่วงน้ำมันของคนขับหนึ่งเดือน พร้อมรายการ job ในแต่ละช่วง — ADMIN/MANAGER (สิทธิ์เดียวกับน้ำมันมาตรฐาน) */
export async function GET(req: Request, { params }: { params: Promise<{ driverId: string }> }) {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  try {
    const { driverId } = await params;
    const month = new URL(req.url).searchParams.get("month");
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "กรุณาระบุเดือนให้ถูกต้อง (YYYY-MM)" }, { status: 400 });
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, name: true, vehicleNumber: true, isGasVehicle: true },
    });
    if (!driver) return NextResponse.json({ error: "ไม่พบคนขับ" }, { status: 404 });

    // รถก๊าซไม่คำนวณน้ำมันมาตรฐาน
    const fuel = driver.isGasVehicle
      ? null
      : (await buildFuelStandardSummaries(month, [driverId], { includeJobs: true })).get(driverId) ?? null;

    return NextResponse.json({ driver, month, fuel });
  } catch (error) {
    console.error("Error fetching fuel segments:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลช่วงน้ำมัน" }, { status: 500 });
  }
}
