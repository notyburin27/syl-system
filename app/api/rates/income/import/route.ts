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
  fuelPriceMin?: string;
  fuelPriceMax?: string;
  surcharge?: string;
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

      // ถ้ามี surcharge fields ใด field หนึ่ง ต้องมีครบทั้ง 3
      const hasSurchargeFields =
        (row.fuelPriceMin != null && row.fuelPriceMin !== "") ||
        (row.fuelPriceMax != null && row.fuelPriceMax !== "") ||
        (row.surcharge != null && row.surcharge !== "");

      if (hasSurchargeFields) {
        if (row.fuelPriceMin == null || row.fuelPriceMin === "")
          errors.push({ row: rowNum, field: "fuelPriceMin", message: "กรุณาระบุราคาน้ำมันต่ำสุด" });
        else if (isNaN(Number(row.fuelPriceMin)))
          errors.push({ row: rowNum, field: "fuelPriceMin", message: "ราคาน้ำมันต่ำสุดต้องเป็นตัวเลข" });

        if (row.fuelPriceMax == null || row.fuelPriceMax === "")
          errors.push({ row: rowNum, field: "fuelPriceMax", message: "กรุณาระบุราคาน้ำมันสูงสุด" });
        else if (isNaN(Number(row.fuelPriceMax)))
          errors.push({ row: rowNum, field: "fuelPriceMax", message: "ราคาน้ำมันสูงสุดต้องเป็นตัวเลข" });

        if (row.surcharge == null || row.surcharge === "")
          errors.push({ row: rowNum, field: "surcharge", message: "กรุณาระบุค่าปรับ" });
        else if (isNaN(Number(row.surcharge)))
          errors.push({ row: rowNum, field: "surcharge", message: "ค่าปรับต้องเป็นตัวเลข" });

        if (
          row.fuelPriceMin && row.fuelPriceMax &&
          !isNaN(Number(row.fuelPriceMin)) && !isNaN(Number(row.fuelPriceMax)) &&
          Number(row.fuelPriceMin) >= Number(row.fuelPriceMax)
        ) {
          errors.push({ row: rowNum, field: "fuelPriceMin", message: "ราคาน้ำมันต่ำสุดต้องน้อยกว่าราคาสูงสุด" });
        }
      }
    });

    if (validate) {
      return NextResponse.json({ valid: errors.length === 0, errors, totalRows: rows.length });
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors, totalRows: rows.length }, { status: 400 });
    }

    let created = 0;
    // Group rows by RateIncome key เพื่อ upsert ครั้งเดียวต่อ record
    const rateIncomeMap = new Map<string, { row: ImportRow; surcharges: ImportRow[] }>();

    for (const row of rows) {
      const key = `${row.jobType}|${row.size}|${row.factoryLocationName}|${row.customerName}`;
      if (!rateIncomeMap.has(key)) {
        rateIncomeMap.set(key, { row, surcharges: [] });
      }
      const hasSurcharge =
        row.fuelPriceMin != null && row.fuelPriceMin !== "" &&
        row.fuelPriceMax != null && row.fuelPriceMax !== "" &&
        row.surcharge != null && row.surcharge !== "";
      if (hasSurcharge) {
        rateIncomeMap.get(key)!.surcharges.push(row);
      }
    }

    for (const { row, surcharges } of rateIncomeMap.values()) {
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

      const rateIncome = await prisma.rateIncome.upsert({
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

      // ถ้ามี surcharge rows → ลบของเดิมทั้งหมดแล้วสร้างใหม่
      if (surcharges.length > 0) {
        await prisma.rateIncomeFuelSurcharge.deleteMany({
          where: { rateIncomeId: rateIncome.id },
        });
        await prisma.rateIncomeFuelSurcharge.createMany({
          data: surcharges.map((s) => ({
            rateIncomeId: rateIncome.id,
            fuelPriceMin: Number(s.fuelPriceMin),
            fuelPriceMax: Number(s.fuelPriceMax),
            surcharge: Number(s.surcharge),
          })),
        });
      }

      created++;
    }

    return NextResponse.json({ success: true, created }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ import" }, { status: 500 });
  }
}
