import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DUPLICATE_FUEL_STANDARD_ERROR,
  FUEL_STANDARD_INCLUDE,
  findDuplicateFuelStandard,
  isPrismaNotFound,
  parseFuelStandardInput,
  requireAdmin,
} from "@/lib/utils/fuelStandardApi";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const parsed = parseFuelStandardInput(await req.json());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (await findDuplicateFuelStandard(parsed.data, id)) {
      return NextResponse.json({ error: DUPLICATE_FUEL_STANDARD_ERROR }, { status: 409 });
    }

    const row = await prisma.fuelStandard.update({
      where: { id },
      data: parsed.data,
      include: FUEL_STANDARD_INCLUDE,
    });
    return NextResponse.json(row);
  } catch (error) {
    if (isPrismaNotFound(error)) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    await prisma.fuelStandard.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isPrismaNotFound(error)) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
