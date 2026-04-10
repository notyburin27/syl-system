import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JOB_TYPES, SIZE_OPTIONS } from "@/types/job";

interface ImportRow {
  jobType?: string;
  size?: string;
  factoryLocationName?: string;
  customerName?: string;
  income?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { rows: rawRows, validate } = (await req.json()) as { rows: ImportRow[]; validate?: boolean };
    const jobTypeLabelMap = new Map<string, string>(JOB_TYPES.map((t) => [t.label, t.value]));
    const rows: ImportRow[] = rawRows.map((row) => ({
      ...row,
      jobType: row.jobType ? (jobTypeLabelMap.get(row.jobType) ?? row.jobType) : row.jobType,
    }));

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "ไม่พบข้อมูลสำหรับ import" }, { status: 400 });
    }

    const errors: ValidationError[] = [];

    const keyCount = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const key = `${r.jobType}|${r.size}|${r.factoryLocationName}|${r.customerName}`;
      const arr = keyCount.get(key) || [];
      arr.push(i + 1);
      keyCount.set(key, arr);
    });

    rows.forEach((row, index) => {
      const rowNum = index + 1;
      if (!row.jobType) errors.push({ row: rowNum, field: "jobType", message: "กรุณาระบุลักษณะงาน" });
      else if (!JOB_TYPES.some((t) => t.value === row.jobType))
        errors.push({ row: rowNum, field: "jobType", message: `ลักษณะงาน "${row.jobType}" ไม่ถูกต้อง` });

      if (!row.size) errors.push({ row: rowNum, field: "size", message: "กรุณาระบุ SIZE" });
      else if (!(SIZE_OPTIONS as readonly string[]).includes(row.size))
        errors.push({ row: rowNum, field: "size", message: `SIZE "${row.size}" ไม่ถูกต้อง` });

      if (!row.factoryLocationName) errors.push({ row: rowNum, field: "factoryLocationName", message: "กรุณาระบุโรงงาน" });
      if (!row.customerName) errors.push({ row: rowNum, field: "customerName", message: "กรุณาระบุลูกค้า" });
      if (row.income == null || row.income === "") errors.push({ row: rowNum, field: "income", message: "กรุณาระบุรายได้" });
      else if (isNaN(Number(row.income))) errors.push({ row: rowNum, field: "income", message: "รายได้ต้องเป็นตัวเลข" });

      const key = `${row.jobType}|${row.size}|${row.factoryLocationName}|${row.customerName}`;
      const dups = keyCount.get(key);
      if (dups && dups.length > 1 && dups[0] !== rowNum)
        errors.push({ row: rowNum, field: "jobType", message: `ข้อมูลซ้ำในไฟล์ (แถว ${dups.join(", ")})` });
    });

    if (validate) {
      return NextResponse.json({ valid: errors.length === 0, errors, totalRows: rows.length });
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors, totalRows: rows.length }, { status: 400 });
    }

    let created = 0;
    for (const row of rows) {
      const factoryLocation = await prisma.location.upsert({
        where: { name: row.factoryLocationName! },
        update: {},
        create: { name: row.factoryLocationName!, type: "factory" },
      });
      const customer = await prisma.customer.upsert({
        where: { name: row.customerName! },
        update: {},
        create: { name: row.customerName! },
      });

      await prisma.rateIncome.upsert({
        where: {
          jobType_size_factoryLocationId_customerId: {
            jobType: row.jobType!,
            size: row.size!,
            factoryLocationId: factoryLocation.id,
            customerId: customer.id,
          },
        },
        update: { income: Number(row.income) },
        create: {
          jobType: row.jobType!,
          size: row.size!,
          factoryLocationId: factoryLocation.id,
          customerId: customer.id,
          income: Number(row.income),
        },
      });
      created++;
    }

    return NextResponse.json({ success: true, created }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ import" }, { status: 500 });
  }
}
