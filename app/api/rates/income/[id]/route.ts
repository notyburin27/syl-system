import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { RATE_ROLES } from "@/lib/settingsNav";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  try {
    const { id } = await params;
    const { income } = await req.json();

    if (income == null) return NextResponse.json({ error: "กรุณากรอกค่าขนส่ง" }, { status: 400 });

    const rate = await prisma.rateIncome.update({
      where: { id },
      data: { income },
      include: {
        factoryLocation: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
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
    await prisma.rateIncome.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
