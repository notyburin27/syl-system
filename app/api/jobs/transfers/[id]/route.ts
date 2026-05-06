import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function ensureEditable(transferId: string) {
  const transfer = await prisma.jobTransfer.findUnique({
    where: { id: transferId },
    include: { job: { select: { clearStatus: true } } },
  });
  if (!transfer) return { error: "ไม่พบการโอน", status: 404 as const };
  if (transfer.job.clearStatus) {
    return { error: "งานนี้ถูกล็อคแล้ว ไม่สามารถแก้ไขได้", status: 403 as const };
  }
  return { transfer };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const guard = await ensureEditable(id);
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if ("amount" in body) {
      const raw = body.amount;
      const num =
        raw === undefined || raw === null || raw === "" ? 0 : Number(raw);
      if (isNaN(num)) {
        return NextResponse.json(
          { error: "จำนวนเงินไม่ถูกต้อง" },
          { status: 400 }
        );
      }
      data.amount = num;
    }
    if ("isCompleted" in body) {
      data.isCompleted = !!body.isCompleted;
    }

    const updated = await prisma.jobTransfer.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating job transfer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการแก้ไขการโอน" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const guard = await ensureEditable(id);
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    await prisma.jobTransfer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting job transfer:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลบการโอน" },
      { status: 500 }
    );
  }
}
