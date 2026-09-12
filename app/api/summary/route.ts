import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildMonthSummaries } from "@/lib/utils/summaryQuery";

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
    const month = searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "กรุณาระบุเดือนให้ถูกต้อง (YYYY-MM)" }, { status: 400 });
    }

    return NextResponse.json(await buildMonthSummaries(month));
  } catch (error) {
    console.error("Error fetching summary:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป" }, { status: 500 });
  }
}
