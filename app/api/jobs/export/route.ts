import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateJobsExcel, type ExportBanner } from "@/lib/utils/jobsExcelGenerator";
import { LEAVE_TYPE_LABELS } from "@/types/leave";
import dayjs from "dayjs";

// ประกอบ banner rows สำหรับ export — กติกาเดียวกับตาราง:
// งานชนะ (วันมีงานไม่ขึ้น banner), วันลาขึ้นเสมอ, banner วันว่างซ่อนถ้าเป็นอนาคต
async function buildExportBanners(
  driverId: string,
  month: string,
  jobs: { jobDate: Date | string }[],
): Promise<ExportBanner[]> {
  const [year, mon] = month.split("-").map(Number);

  const [leaves, holidays] = await Promise.all([
    prisma.driverLeave.findMany({
      where: {
        driverId,
        leaveDate: { gte: new Date(Date.UTC(year, mon - 1, 1)), lt: new Date(Date.UTC(year, mon, 1)) },
      },
    }),
    prisma.companyHoliday.findMany({
      where: {
        holidayDate: { gte: new Date(Date.UTC(year, mon - 1, 1)), lt: new Date(Date.UTC(year, mon, 1)) },
      },
    }),
  ]);

  const jobDateSet = new Set(jobs.map((j) => dayjs(j.jobDate).format("YYYY-MM-DD")));
  const leaveMap = new Map(leaves.map((l) => [dayjs(l.leaveDate).format("YYYY-MM-DD"), l]));
  const holidayMap = new Map(holidays.map((h) => [dayjs(h.holidayDate).format("YYYY-MM-DD"), h]));

  const daysInMonth = dayjs(`${month}-01`).daysInMonth();
  const todayKey = dayjs().format("YYYY-MM-DD");

  const banners: ExportBanner[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (jobDateSet.has(key)) continue; // งานชนะ

    const leave = leaveMap.get(key);
    if (leave) {
      const noteSuffix = leave.note ? ` — ${leave.note}` : "";
      banners.push({ day: d, label: `${LEAVE_TYPE_LABELS[leave.leaveType as keyof typeof LEAVE_TYPE_LABELS]}${noteSuffix}` });
      continue;
    }

    if (key > todayKey) continue; // banner วันว่างในอนาคต → ซ่อน

    const holiday = holidayMap.get(key);
    if (holiday) {
      banners.push({ day: d, label: holiday.name });
    } else if (new Date(Date.UTC(year, mon - 1, d)).getUTCDay() === 0) {
      banners.push({ day: d, label: "วันอาทิตย์" });
    } else {
      banners.push({ day: d, label: "ไม่มีงาน" });
    }
  }
  return banners;
}

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
      where.jobDate = { gte: new Date(Date.UTC(year, mon - 1, 1)), lt: new Date(Date.UTC(year, mon, 1)) };
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        customer: true,
        driver: true,
        pickupLocation: true,
        factoryLocation: true,
        returnLocation: true,
        transfers: { orderBy: { createdAt: "asc" } },
        carryOverToJob: { select: { jobNumber: true } },
      },
      orderBy: [{ jobDate: "asc" }, { createdAt: "asc" }],
    });

    const isAdmin = session.user.role === "ADMIN";
    const monthStr = month ?? dayjs().format("YYYY-MM");

    // Banner rows: วันลา / วันหยุด / วันอาทิตย์ / ไม่มีงาน (กติกาเดียวกับตาราง)
    const banners = await buildExportBanners(driverId, monthStr, jobs);

    const buffer = await generateJobsExcel(jobs as unknown as Parameters<typeof generateJobsExcel>[0], driverName, monthStr, vehicleNumber, isAdmin, banners);

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
