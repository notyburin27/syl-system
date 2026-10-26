import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/utils/fuelStandardApi";
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
    // โหลดของเดิมครั้งเดียวนอก transaction — ไม่ query ทีละแถวใน transaction (timeout 5 วินาทีเริ่มต้นไม่พอกับไฟล์ใหญ่)
    const keyOf = (r: { kind: string; size: string; locationId: string; isLaemChabang: boolean }) =>
      [r.kind, r.size, r.locationId, r.isLaemChabang ? "1" : "0"].join("|");
    const existingIds = new Map((await prisma.fuelStandard.findMany()).map((e) => [keyOf(e), e.id]));

    await prisma.$transaction(
      async (tx) => {
        for (const r of resolved) {
          const id = existingIds.get(keyOf(r));
          if (id) await tx.fuelStandard.update({ where: { id }, data: { liters: r.liters } });
          else await tx.fuelStandard.create({ data: r });
        }
      },
      { timeout: 30000 }
    );

    return NextResponse.json({ success: true, created: resolved.length }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ import" }, { status: 500 });
  }
}
