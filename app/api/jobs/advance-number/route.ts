import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import dayjs from "dayjs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // งานประเภทพิเศษที่ระบบออกเลขให้เอง: เบิกล่วงหน้า (ADV) และ ไม่มีงาน (NJB)
  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("jobType") === "noJob" ? "NJB" : "ADV";

  const jobNumber = `${prefix}-${dayjs().format("YYMMDD-HHmmss")}`;
  return NextResponse.json({ jobNumber });
}
