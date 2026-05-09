import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/jobs/[id]/towing-links — ลิ้ง towing job
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { sequence, towingJobId } = body as { sequence: number; towingJobId: string };

  if (!sequence || !towingJobId) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }
  if (sequence !== 1 && sequence !== 2) {
    return NextResponse.json({ error: "sequence ต้องเป็น 1 หรือ 2" }, { status: 400 });
  }

  try {
    const link = await prisma.jobTowingLink.create({
      data: { mainJobId: id, towingJobId, sequence },
      include: {
        towingJob: {
          include: { pickupLocation: true, returnLocation: true },
        },
      },
    });
    return NextResponse.json(link);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "slot นี้มี Job ผูกอยู่แล้ว หรือ Job ทอยตู้นี้ถูกผูกกับงานอื่นแล้ว" }, { status: 409 });
    }
    console.error("towing-links POST error:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
