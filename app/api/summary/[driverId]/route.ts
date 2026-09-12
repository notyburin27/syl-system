import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildMonthSummaries } from "@/lib/utils/summaryQuery";
import { monthsInRange, monthSpan } from "@/lib/utils/monthRange";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  try {
    const { driverId } = await params;
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to") ?? from;

    if (!from || !/^\d{4}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "กรุณาระบุช่วงเดือนให้ถูกต้อง (YYYY-MM)" }, { status: 400 });
    }

    if (monthSpan(from, to) > 24) {
      return NextResponse.json({ error: "เลือกช่วงเดือนได้ไม่เกิน 24 เดือน" }, { status: 400 });
    }

    const months = monthsInRange(from, to);
    if (months.length === 0) {
      return NextResponse.json({ error: "ช่วงเดือนไม่ถูกต้อง" }, { status: 400 });
    }

    // เดือนล่าสุดก่อน — ตรงกับลำดับบล็อกใน Excel (ซ้ายสุด = ล่าสุด)
    const results = await Promise.all(
      months.map((m) => buildMonthSummaries(m, [driverId]))
    );
    return NextResponse.json(results.flat());
  } catch (error) {
    console.error("Error fetching driver summary:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป" }, { status: 500 });
  }
}
