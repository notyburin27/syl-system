import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_RESULTS = 30;
const MIN_QUERY_LENGTH = 2;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  if (role === "STAFF") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    if (q.length < MIN_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `กรุณาพิมพ์อย่างน้อย ${MIN_QUERY_LENGTH} ตัวอักษร` },
        { status: 400 }
      );
    }

    const where = {
      jobNumber: { contains: q, mode: "insensitive" as const },
      // กลุ่ม POP เห็นได้เฉพาะ ADMIN (สอดคล้องกับ tab ในหน้า /jobs)
      ...(role === "ADMIN"
        ? {}
        : { driver: { is: { groupName: { not: "POP" } } } }),
    };

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        select: {
          id: true,
          jobNumber: true,
          jobDate: true,
          jobType: true,
          size: true,
          clearStatus: true,
          isCancelled: true,
          driverId: true,
          driver: { select: { name: true, vehicleNumber: true, groupName: true } },
          customer: { select: { name: true } },
        },
        orderBy: [{ jobDate: "desc" }, { jobNumber: "asc" }],
        take: MAX_RESULTS,
      }),
    ]);

    return NextResponse.json({ total, limit: MAX_RESULTS, jobs });
  } catch (error) {
    console.error("Error searching jobs:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการค้นหา" },
      { status: 500 }
    );
  }
}
