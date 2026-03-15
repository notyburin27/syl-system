import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface ImportRow {
  name: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { rows, validate } = body as {
      rows: ImportRow[];
      validate?: boolean;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลสำหรับ import" },
        { status: 400 }
      );
    }

    const errors: ValidationError[] = [];
    const names = rows.map((r) => r.name).filter(Boolean);

    // Check duplicates in DB
    const existing = await prisma.driver.findMany({
      where: { name: { in: names } },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((d) => d.name));

    // Check duplicates within import
    const nameCount = new Map<string, number[]>();
    rows.forEach((r, i) => {
      if (r.name) {
        const arr = nameCount.get(r.name) || [];
        arr.push(i + 1);
        nameCount.set(r.name, arr);
      }
    });

    rows.forEach((row, index) => {
      const rowNum = index + 1;

      if (!row.name || !row.name.trim()) {
        errors.push({ row: rowNum, field: "name", message: "กรุณาระบุชื่อคนขับ" });
        return;
      }

      if (existingNames.has(row.name)) {
        errors.push({ row: rowNum, field: "name", message: `ชื่อคนขับซ้ำในระบบ: ${row.name}` });
      }

      const dups = nameCount.get(row.name);
      if (dups && dups.length > 1) {
        errors.push({ row: rowNum, field: "name", message: `ชื่อคนขับซ้ำในไฟล์ (แถว ${dups.join(", ")})` });
      }
    });

    if (validate) {
      return NextResponse.json({ valid: errors.length === 0, errors, totalRows: rows.length });
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors, totalRows: rows.length }, { status: 400 });
    }

    const created = await prisma.$transaction(
      rows.map((row) =>
        prisma.driver.create({ data: { name: row.name.trim() } })
      )
    );

    return NextResponse.json({ success: true, created: created.length }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "ชื่อคนขับซ้ำในระบบ" }, { status: 400 });
    }
    console.error("Error importing drivers:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ import ข้อมูล" }, { status: 500 });
  }
}
