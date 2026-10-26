import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { RATE_ROLES } from "@/lib/settingsNav";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  try {
    const { id } = await params;
    const { driverWage } = await req.json();

    if (driverWage == null) return NextResponse.json({ error: "กรุณากรอกค่าเที่ยว" }, { status: 400 });

    const rate = await prisma.rateDriverWage.update({
      where: { id },
      data: { driverWage },
      include: {
        factoryLocation: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(rate);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  try {
    const { id } = await params;
    await prisma.rateDriverWage.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
