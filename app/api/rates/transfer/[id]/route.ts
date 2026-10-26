import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { MASTER_DATA_ROLES } from "@/lib/settingsNav";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiRoles(MASTER_DATA_ROLES);
  if (denied) return denied;

  try {
    const { id } = await params;
    const { pickupFee, returnFee } = await req.json();

    if (pickupFee == null || returnFee == null) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }

    const rate = await prisma.rateTransfer.update({
      where: { id },
      data: { pickupFee, returnFee },
      include: {
        location: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(rate);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiRoles(MASTER_DATA_ROLES);
  if (denied) return denied;

  try {
    const { id } = await params;
    await prisma.rateTransfer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
