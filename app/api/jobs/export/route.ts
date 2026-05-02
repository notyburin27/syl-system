import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateJobsExcel } from "@/lib/utils/jobsExcelGenerator";
import dayjs from "dayjs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const driverId = searchParams.get("driverId");
    const driverName = searchParams.get("driverName") ?? "คนขับ";
    const vehicleNumber = searchParams.get("vehicleNumber") ?? undefined;

    if (!driverId) {
      return NextResponse.json({ error: "กรุณาระบุคนขับ" }, { status: 400 });
    }

    const where: { driverId: string; jobDate?: { gte: Date; lt: Date } } = { driverId };

    if (month) {
      const [year, mon] = month.split("-").map(Number);
      where.jobDate = { gte: new Date(year, mon - 1, 1), lt: new Date(year, mon, 1) };
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        customer: true,
        driver: true,
        pickupLocation: true,
        factoryLocation: true,
        returnLocation: true,
      },
      orderBy: [{ jobDate: "asc" }, { createdAt: "asc" }],
    });

    const monthStr = month ?? dayjs().format("YYYY-MM");
    const buffer = generateJobsExcel(jobs as unknown as Parameters<typeof generateJobsExcel>[0], driverName, monthStr, vehicleNumber);

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`รายการงานวิ่ง ${driverName} ${monthStr}.xlsx`)}`,
      },
    });
  } catch (error) {
    console.error("Error exporting jobs:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ export", detail: String(error) }, { status: 500 });
  }
}
