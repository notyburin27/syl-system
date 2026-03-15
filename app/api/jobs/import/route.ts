import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface ImportRow {
  jobDate: string;
  jobType: string;
  customerName: string;
  jobNumber: string;
  size?: string;
  pickupLocationName?: string;
  factoryLocationName?: string;
  returnLocationName?: string;
  estimatedTransfer?: number;
  income?: number;
  driverWage?: number;
  actualTransfer?: number;
  advance?: number;
  toll?: number;
  pickupFee?: number;
  returnFee?: number;
  liftFee?: number;
  storageFee?: number;
  tire?: number;
  other?: number;
  mileage?: number;
  fuelOfficeLiters?: number;
  fuelCashLiters?: number;
  fuelCashAmount?: number;
  fuelCreditLiters?: number;
  fuelCreditAmount?: number;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

const JOB_TYPES = [
  "ขาเข้า",
  "ขาออก",
  "ทอยตู้",
  "พื้นเรียบ",
  "โรงสี",
  "เบิกล่วงหน้า",
];

const SIZE_OPTIONS = ["20DC", "40DC", "20RF", "40RF", "2x20DC", "truck"];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { rows, driverId, validate } = body as {
      rows: ImportRow[];
      driverId: string;
      validate?: boolean; // true = validate only, false/undefined = validate + create
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลสำหรับ import" },
        { status: 400 }
      );
    }

    if (!driverId) {
      return NextResponse.json(
        { error: "กรุณาระบุคนขับ" },
        { status: 400 }
      );
    }

    const errors: ValidationError[] = [];

    // Collect unique names for lookup
    const customerNames = [
      ...new Set(rows.map((r) => r.customerName).filter(Boolean)),
    ];
    const locationNames = [
      ...new Set(
        rows.flatMap((r) =>
          [
            r.pickupLocationName,
            r.factoryLocationName,
            r.returnLocationName,
          ].filter(Boolean)
        )
      ),
    ] as string[];
    const jobNumbers = rows.map((r) => r.jobNumber).filter(Boolean);

    // Lookup customers
    const customers = await prisma.customer.findMany({
      where: { name: { in: customerNames }, isActive: true },
    });
    const customerMap = new Map(customers.map((c) => [c.name, c.id]));

    // Lookup locations
    const allLocations = await prisma.location.findMany({
      where: { name: { in: locationNames }, isActive: true },
    });
    const locationMap = new Map(
      allLocations.map((l) => [l.name, { id: l.id, type: l.type }])
    );

    // Check duplicate job numbers in DB
    const existingJobs = await prisma.job.findMany({
      where: { jobNumber: { in: jobNumbers } },
      select: { jobNumber: true },
    });
    const existingJobNumbers = new Set(existingJobs.map((j) => j.jobNumber));

    // Check duplicate job numbers within the import
    const importJobNumberCount = new Map<string, number[]>();
    rows.forEach((r, i) => {
      if (r.jobNumber) {
        const existing = importJobNumberCount.get(r.jobNumber) || [];
        existing.push(i + 1);
        importJobNumberCount.set(r.jobNumber, existing);
      }
    });

    // Validate each row
    rows.forEach((row, index) => {
      const rowNum = index + 1;

      // Required: jobDate
      if (!row.jobDate) {
        errors.push({
          row: rowNum,
          field: "jobDate",
          message: "กรุณาระบุวันที่",
        });
      } else {
        const d = new Date(row.jobDate);
        if (isNaN(d.getTime())) {
          errors.push({
            row: rowNum,
            field: "jobDate",
            message: "รูปแบบวันที่ไม่ถูกต้อง (ใช้ YYYY-MM-DD)",
          });
        }
      }

      // Required: jobType
      if (!row.jobType) {
        errors.push({
          row: rowNum,
          field: "jobType",
          message: "กรุณาระบุลักษณะงาน",
        });
      } else if (!JOB_TYPES.includes(row.jobType)) {
        errors.push({
          row: rowNum,
          field: "jobType",
          message: `ลักษณะงานไม่ถูกต้อง: ${row.jobType}`,
        });
      }

      // Required: customerName
      if (!row.customerName) {
        errors.push({
          row: rowNum,
          field: "customerName",
          message: "กรุณาระบุชื่อลูกค้า",
        });
      } else if (!customerMap.has(row.customerName)) {
        errors.push({
          row: rowNum,
          field: "customerName",
          message: `ไม่พบลูกค้า: ${row.customerName}`,
        });
      }

      // Required: jobNumber (except เบิกล่วงหน้า)
      if (row.jobType !== "เบิกล่วงหน้า") {
        if (!row.jobNumber) {
          errors.push({
            row: rowNum,
            field: "jobNumber",
            message: "กรุณาระบุเลขที่งาน",
          });
        } else {
          if (existingJobNumbers.has(row.jobNumber)) {
            errors.push({
              row: rowNum,
              field: "jobNumber",
              message: `เลขที่งานซ้ำในระบบ: ${row.jobNumber}`,
            });
          }
          const duplicateRows = importJobNumberCount.get(row.jobNumber);
          if (duplicateRows && duplicateRows.length > 1) {
            errors.push({
              row: rowNum,
              field: "jobNumber",
              message: `เลขที่งานซ้ำในไฟล์ (แถว ${duplicateRows.join(", ")})`,
            });
          }
        }
      }

      // Optional: size validation
      if (row.size && !SIZE_OPTIONS.includes(row.size)) {
        errors.push({
          row: rowNum,
          field: "size",
          message: `ขนาดตู้ไม่ถูกต้อง: ${row.size}`,
        });
      }

      // Optional: location validation
      if (row.pickupLocationName) {
        const loc = locationMap.get(row.pickupLocationName);
        if (!loc) {
          errors.push({
            row: rowNum,
            field: "pickupLocationName",
            message: `ไม่พบสถานที่รับตู้: ${row.pickupLocationName}`,
          });
        } else if (loc.type !== "general") {
          errors.push({
            row: rowNum,
            field: "pickupLocationName",
            message: `สถานที่รับตู้ต้องเป็นประเภท "ทั่วไป": ${row.pickupLocationName}`,
          });
        }
      }

      if (row.factoryLocationName) {
        const loc = locationMap.get(row.factoryLocationName);
        if (!loc) {
          errors.push({
            row: rowNum,
            field: "factoryLocationName",
            message: `ไม่พบโรงงาน: ${row.factoryLocationName}`,
          });
        } else if (loc.type !== "factory") {
          errors.push({
            row: rowNum,
            field: "factoryLocationName",
            message: `โรงงานต้องเป็นประเภท "โรงงาน": ${row.factoryLocationName}`,
          });
        }
      }

      if (row.returnLocationName) {
        const loc = locationMap.get(row.returnLocationName);
        if (!loc) {
          errors.push({
            row: rowNum,
            field: "returnLocationName",
            message: `ไม่พบสถานที่คืนตู้: ${row.returnLocationName}`,
          });
        } else if (loc.type !== "general") {
          errors.push({
            row: rowNum,
            field: "returnLocationName",
            message: `สถานที่คืนตู้ต้องเป็นประเภท "ทั่วไป": ${row.returnLocationName}`,
          });
        }
      }
    });

    // If validate only, return errors
    if (validate) {
      return NextResponse.json({
        valid: errors.length === 0,
        errors,
        totalRows: rows.length,
      });
    }

    // If there are errors, don't create
    if (errors.length > 0) {
      return NextResponse.json(
        { valid: false, errors, totalRows: rows.length },
        { status: 400 }
      );
    }

    // Generate job numbers for เบิกล่วงหน้า
    let advanceCounter = await prisma.job.count({
      where: { jobType: "เบิกล่วงหน้า" },
    });

    // Create all jobs in a transaction
    const createdJobs = await prisma.$transaction(
      rows.map((row) => {
        let jobNumber = row.jobNumber;
        if (row.jobType === "เบิกล่วงหน้า" && !jobNumber) {
          advanceCounter++;
          jobNumber = `ADV-${String(advanceCounter).padStart(5, "0")}`;
        }

        return prisma.job.create({
          data: {
            jobDate: new Date(row.jobDate),
            jobType: row.jobType,
            customerId: customerMap.get(row.customerName)!,
            jobNumber,
            driverId,
            size: row.size || null,
            pickupLocationId: row.pickupLocationName
              ? locationMap.get(row.pickupLocationName)?.id || null
              : null,
            factoryLocationId: row.factoryLocationName
              ? locationMap.get(row.factoryLocationName)?.id || null
              : null,
            returnLocationId: row.returnLocationName
              ? locationMap.get(row.returnLocationName)?.id || null
              : null,
            estimatedTransfer: row.estimatedTransfer ?? 0,
            income: row.income ?? 0,
            driverWage: row.driverWage ?? 0,
            actualTransfer:
              row.jobType === "เบิกล่วงหน้า"
                ? row.advance ?? 0
                : row.actualTransfer ?? 0,
            advance: row.advance ?? 0,
            toll: row.toll ?? 0,
            pickupFee: row.pickupFee ?? 0,
            returnFee: row.returnFee ?? 0,
            liftFee: row.liftFee ?? 0,
            storageFee: row.storageFee ?? 0,
            tire: row.tire ?? 0,
            other: row.other ?? 0,
            mileage: row.mileage ?? null,
            fuelOfficeLiters: row.fuelOfficeLiters ?? null,
            fuelCashLiters: row.fuelCashLiters ?? null,
            fuelCashAmount: row.fuelCashAmount ?? null,
            fuelCreditLiters: row.fuelCreditLiters ?? null,
            fuelCreditAmount: row.fuelCreditAmount ?? null,
            createdById: session.user.id as string,
          },
        });
      })
    );

    return NextResponse.json(
      {
        success: true,
        created: createdJobs.length,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "เลขที่งานซ้ำในระบบ" },
        { status: 400 }
      );
    }
    console.error("Error importing jobs:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการ import ข้อมูล" },
      { status: 500 }
    );
  }
}
