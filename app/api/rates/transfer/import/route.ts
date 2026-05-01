import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JOB_TYPES, SIZE_OPTIONS } from "@/types/job";

interface ImportRow {
  jobType?: string;
  size?: string;
  locationName?: string;
  pickupFee?: string;
  returnFee?: string;
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

    // Check duplicates within file
    const keyCount = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const key = `${r.jobType}|${r.size}|${r.locationName}`;
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

      if (!row.locationName) errors.push({ row: rowNum, field: "locationName", message: "กรุณาระบุสถานที่" });
      if (row.pickupFee == null || row.pickupFee === "") errors.push({ row: rowNum, field: "pickupFee", message: "กรุณาระบุค่ารับตู้" });
      else if (isNaN(Number(row.pickupFee))) errors.push({ row: rowNum, field: "pickupFee", message: "ค่ารับตู้ต้องเป็นตัวเลข" });
      if (row.returnFee == null || row.returnFee === "") errors.push({ row: rowNum, field: "returnFee", message: "กรุณาระบุค่าคืนตู้" });
      else if (isNaN(Number(row.returnFee))) errors.push({ row: rowNum, field: "returnFee", message: "ค่าคืนตู้ต้องเป็นตัวเลข" });

      const key = `${row.jobType}|${row.size}|${row.locationName}`;
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
      const location = await prisma.location.upsert({
        where: { name: row.locationName! },
        update: {},
        create: { name: row.locationName!, type: "general" },
      });

      await prisma.rateTransfer.upsert({
        where: {
          jobType_size_locationId: {
            jobType: row.jobType!,
            size: row.size!,
            locationId: location.id,
          },
        },
        update: { pickupFee: Number(row.pickupFee), returnFee: Number(row.returnFee) },
        create: {
          jobType: row.jobType!,
          size: row.size!,
          locationId: location.id,
          pickupFee: Number(row.pickupFee),
          returnFee: Number(row.returnFee),
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
