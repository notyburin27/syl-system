import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface ImportRow {
  driverName: string;
  bankName: string;
  accountNo: string;
  accountName: string;
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

    // Lookup drivers by name
    const driverNames = [...new Set(rows.map((r) => r.driverName).filter(Boolean))];
    const drivers = await prisma.driver.findMany({
      where: { name: { in: driverNames }, isActive: true },
    });
    const driverMap = new Map(drivers.map((d) => [d.name, d.id]));

    rows.forEach((row, index) => {
      const rowNum = index + 1;

      if (!row.driverName || !row.driverName.trim()) {
        errors.push({ row: rowNum, field: "driverName", message: "กรุณาระบุชื่อคนขับ" });
      } else if (!driverMap.has(row.driverName)) {
        errors.push({ row: rowNum, field: "driverName", message: `ไม่พบคนขับ: ${row.driverName}` });
      }

      if (!row.bankName || !row.bankName.trim()) {
        errors.push({ row: rowNum, field: "bankName", message: "กรุณาระบุชื่อธนาคาร" });
      }

      if (!row.accountNo || !row.accountNo.trim()) {
        errors.push({ row: rowNum, field: "accountNo", message: "กรุณาระบุเลขบัญชี" });
      }

      if (!row.accountName || !row.accountName.trim()) {
        errors.push({ row: rowNum, field: "accountName", message: "กรุณาระบุชื่อบัญชี" });
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
        prisma.driverBankAccount.create({
          data: {
            driverId: driverMap.get(row.driverName)!,
            bankName: row.bankName.trim(),
            accountNo: row.accountNo.trim(),
            accountName: row.accountName.trim(),
          },
        })
      )
    );

    return NextResponse.json({ success: true, created: created.length }, { status: 201 });
  } catch (error) {
    console.error("Error importing bank accounts:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการ import ข้อมูล" },
      { status: 500 }
    );
  }
}
