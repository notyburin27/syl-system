import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    }
    if (job.clearStatus) {
      return NextResponse.json(
        { error: "งานนี้ถูกล็อคแล้ว ไม่สามารถแก้ไขได้" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const amountRaw = body?.amount;
    const amount =
      amountRaw === undefined || amountRaw === null || amountRaw === ""
        ? 0
        : Number(amountRaw);

    if (isNaN(amount)) {
      return NextResponse.json(
        { error: "จำนวนเงินไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const transfer = await prisma.jobTransfer.create({
      data: {
        jobId: id,
        amount,
        isCompleted: !!body?.isCompleted,
      },
    });

    return NextResponse.json(transfer, { status: 201 });
  } catch (error) {
    console.error("Error creating job transfer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการเพิ่มการโอน" },
      { status: 500 }
    );
  }
}
