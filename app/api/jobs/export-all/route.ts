import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamAllDriversJobsExcel, type DriverSheetData } from "@/lib/utils/jobsExcelGenerator";
import { buildBannersFor, fetchBannerSources } from "@/lib/utils/jobsExportBanners";
import dayjs from "dayjs";

// ดึงงานทีละกี่คนขับต่อ query — ไม่โหลดงานของทุกคนมาไว้ใน memory พร้อมกัน
const DRIVER_BATCH_SIZE = 10;

const JOB_INCLUDE = {
  customer: true,
  driver: { select: { id: true, name: true, vehicleNumber: true, groupName: true, startDate: true } },
  pickupLocation: true,
  factoryLocation: true,
  returnLocation: true,
  transfers: { orderBy: { createdAt: "asc" as const } },
  carryOverToJob: { select: { jobNumber: true } },
};

type DriverRow = { id: string; name: string; vehicleNumber: string | null };
type LeavesByDriver = Awaited<ReturnType<typeof fetchBannerSources>>["leavesByDriver"];
type Holidays = Awaited<ReturnType<typeof fetchBannerSources>>["holidays"];

// ทยอย yield sheet ทีละคน โดยดึงงานจาก DB ทีละ batch ตามที่ streaming writer ขอ
async function* driverSheets(
  drivers: DriverRow[],
  dateFilter: { gte: Date; lt: Date },
  monthStr: string,
  leavesByDriver: LeavesByDriver,
  holidays: Holidays,
): AsyncGenerator<DriverSheetData> {
  for (let i = 0; i < drivers.length; i += DRIVER_BATCH_SIZE) {
    const batch = drivers.slice(i, i + DRIVER_BATCH_SIZE);

    const jobs = await prisma.job.findMany({
      where: { driverId: { in: batch.map((d) => d.id) }, jobDate: dateFilter },
      include: JOB_INCLUDE,
      orderBy: [{ jobDate: "asc" }, { createdAt: "asc" }],
    });

    // จัดงานเข้าคนขับ (คงลำดับ jobDate/createdAt จาก query ไว้)
    const jobsByDriver = new Map<string, typeof jobs>();
    for (const job of jobs) {
      if (!job.driverId) continue; // งานไม่มีคนขับไม่เข้า sheet ไหน
      const list = jobsByDriver.get(job.driverId);
      if (list) list.push(job);
      else jobsByDriver.set(job.driverId, [job]);
    }

    for (const driver of batch) {
      const driverJobs = jobsByDriver.get(driver.id) ?? [];
      yield {
        driverName: driver.name,
        vehicleNumber: driver.vehicleNumber ?? undefined,
        jobs: driverJobs as unknown as DriverSheetData["jobs"],
        banners: buildBannersFor(monthStr, driverJobs, leavesByDriver.get(driver.id) ?? [], holidays),
      };
    }
  }
}

// ค่า group ที่หมายถึง tab "กลุ่มอื่นๆ" — คนขับที่ไม่ได้ระบุกลุ่ม (ตรงกับ OTHER_GROUP_KEY ฝั่ง UI)
const OTHER_GROUP_KEY = "__other__";

// Export คนขับในกลุ่มที่เลือก เดือนเดียว → ไฟล์เดียว หนึ่ง sheet ต่อคน (stream ออกทีละ sheet)
// (คนที่ไม่มีงานในเดือนนั้นก็ได้ sheet ของตัวเอง มีแต่แถว banner)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const monthStr = searchParams.get("month") ?? dayjs().format("YYYY-MM");
    const [year, mon] = monthStr.split("-").map(Number);
    if (!year || !mon) {
      return NextResponse.json({ error: "รูปแบบเดือนไม่ถูกต้อง" }, { status: 400 });
    }
    const dateFilter = { gte: new Date(Date.UTC(year, mon - 1, 1)), lt: new Date(Date.UTC(year, mon, 1)) };

    const isAdmin = session.user.role === "ADMIN";

    // กลุ่มที่เปิดอยู่ใน tab — ไม่ระบุ = กลุ่มอื่นๆ (คนขับที่ไม่ได้ตั้งกลุ่ม) เหมือน default ฝั่ง UI
    const group = searchParams.get("group") ?? OTHER_GROUP_KEY;

    // กลุ่ม POP เข้าถึงได้เฉพาะ ADMIN — กันเรียก API ตรงด้วย group=POP
    if (group === "POP" && !isAdmin) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงกลุ่มนี้" }, { status: 403 });
    }

    // กติกาเดียวกับหน้ารายการ: คนลาออกยังเห็นในเดือนที่ลาออก แต่ไม่เห็นเดือนถัดไป
    // และ tab "กลุ่มอื่นๆ" = คนที่ groupName เป็น null
    const drivers = await prisma.driver.findMany({
      where: {
        isActive: true,
        OR: [{ resignedAt: null }, { resignedAt: { gte: dateFilter.gte } }],
        groupName: group === OTHER_GROUP_KEY ? null : group,
      },
      select: { id: true, name: true, vehicleNumber: true },
      orderBy: { name: "asc" },
    });

    if (drivers.length === 0) {
      return NextResponse.json({ error: "ไม่มีคนขับในกลุ่มนี้" }, { status: 404 });
    }

    // วันลา/วันหยุดของทั้งเดือนดึงครั้งเดียว — ข้อมูลเล็ก ไม่ต้องแบ่ง batch
    const { leavesByDriver, holidays } = await fetchBannerSources(monthStr, drivers.map((d) => d.id));

    const groupLabel = group === OTHER_GROUP_KEY ? "กลุ่มอื่นๆ" : group;

    const stream = streamAllDriversJobsExcel(
      driverSheets(drivers, dateFilter, monthStr, leavesByDriver, holidays),
      monthStr,
      isAdmin,
    );

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`รายการงานวิ่ง ${groupLabel} ${monthStr}.xlsx`)}`,
        // กัน proxy/browser buffer ทั้งไฟล์ก่อนส่งต่อ
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting all jobs:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ export", detail: String(error) }, { status: 500 });
  }
}
