import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildMonthSummaries } from "@/lib/utils/summaryQuery";
import { monthsInRange } from "@/lib/utils/monthRange";
import { generateSummaryExcel, type DriverSheetData } from "@/lib/utils/summaryExcelGenerator";
import { toThaiMonthYear } from "@/lib/utils/thaiDate";
import { UNGROUPED } from "@/types/job";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to") ?? from;
    const driverId = searchParams.get("driverId");
    const groupsParam = searchParams.get("groups");

    if (!from || !/^\d{4}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "กรุณาระบุช่วงเดือนให้ถูกต้อง (YYYY-MM)" }, { status: 400 });
    }

    const months = monthsInRange(from, to);
    if (months.length === 0) {
      return NextResponse.json({ error: "ช่วงเดือนไม่ถูกต้อง" }, { status: 400 });
    }

    // ดึงสรุปทุกเดือนในช่วง แล้วจัดกลุ่มตามคนขับ
    const perMonth = await Promise.all(
      months.map((m) => buildMonthSummaries(m, driverId ? [driverId] : undefined))
    );

    // param ไม่มีเลย (null) = ไม่กรอง (ทุกกลุ่ม); param มีแต่ว่าง/ตัดด้วย comma ก็ยังนับว่า "ระบุแล้ว"
    // ต้องแยกสองเคสนี้ให้ชัด เพราะ "ระบุแต่ต้องการเฉพาะกลุ่มอื่นๆ (sentinel)" ก็ต้องกรอง
    const groups = groupsParam !== null ? groupsParam.split(",").filter(Boolean) : null;
    const byDriver = new Map<string, DriverSheetData>();

    for (const monthSummaries of perMonth) {
      for (const s of monthSummaries) {
        // กรองกลุ่ม: groups === null → ไม่กรอง (ทุกกลุ่ม)
        // groups !== null → match ถ้า groupName อยู่ใน list หรือ (ไม่มี groupName และ list มี sentinel)
        if (groups !== null) {
          const matches = s.groupName
            ? groups.includes(s.groupName)
            : groups.includes(UNGROUPED);
          if (!matches) continue;
        }

        const existing = byDriver.get(s.driverId);
        if (existing) {
          existing.months.push(s);
        } else {
          byDriver.set(s.driverId, {
            driverName: s.driverName,
            vehicleNumber: s.vehicleNumber,
            months: [s],
          });
        }
      }
    }

    // months ของแต่ละคนเรียงตาม perMonth อยู่แล้ว (ล่าสุดก่อน)
    const sheets = Array.from(byDriver.values());
    const buffer = await generateSummaryExcel(sheets);

    const groupLabel =
      driverId && sheets.length === 1
        ? sheets[0].driverName
        : groups && groups.length > 0
          ? groups.map((g) => (g === UNGROUPED ? "กลุ่มอื่นๆ" : g)).join(",")
          : "ทุกกลุ่ม";
    const filename = `สรุป${groupLabel} ${toThaiMonthYear(months[0])}.xlsx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("Error exporting summary:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ export" }, { status: 500 });
  }
}
