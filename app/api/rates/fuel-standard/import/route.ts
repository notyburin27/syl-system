import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fuelStandardKeyWhere, requireAdmin } from "@/lib/utils/fuelStandardApi";
import { validateFuelStandardRows, type FuelStandardImportRow } from "@/lib/utils/fuelStandardImport";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { rows, validate } = (await req.json()) as { rows?: FuelStandardImportRow[]; validate?: boolean };
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "ไม่พบข้อมูลสำหรับ import" }, { status: 400 });
    }

    const locations = await prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true },
    });
    const { errors, resolved } = validateFuelStandardRows(rows, locations);

    if (validate) {
      return NextResponse.json({ valid: errors.length === 0, errors, totalRows: rows.length });
    }
    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors, totalRows: rows.length }, { status: 400 });
    }

    // key ซ้ำของเดิม → อัปเดตลิตร; ทั้งไฟล์สำเร็จหรือไม่สำเร็จพร้อมกัน
    await prisma.$transaction(async (tx) => {
      for (const r of resolved) {
        const existing = await tx.fuelStandard.findFirst({ where: fuelStandardKeyWhere(r), select: { id: true } });
        if (existing) await tx.fuelStandard.update({ where: { id: existing.id }, data: { liters: r.liters } });
        else await tx.fuelStandard.create({ data: r });
      }
    });

    return NextResponse.json({ success: true, created: resolved.length }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ import" }, { status: 500 });
  }
}
