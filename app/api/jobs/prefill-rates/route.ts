import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * ดึงค่าขนส่ง (income) + ค่าเที่ยวคนขับ (driverWage) ให้ทุกงานในเดือนที่เลือก
 * เติมเฉพาะช่องที่ยัง null — ค่าที่กรอกไว้แล้วไม่ถูกทับ
 *
 * ใช้ logic เดียวกับ /api/jobs/calculate/income และ /api/jobs/calculate/driver-wage
 * แต่ทำเป็น batch เพื่อลดจำนวน round-trip
 */
export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "ADMIN") return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });

  try {
    const { month } = (await req.json()) as { month?: string };
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "กรุณาระบุเดือนในรูปแบบ YYYY-MM" }, { status: 400 });
    }

    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    // งานที่ต้องเติม: ยังไม่ยกเลิก และมีอย่างน้อยหนึ่งช่องที่ null
    // ข้าม advance/noJob เพราะไม่มีอัตราค่าขนส่ง (ตรงกับเงื่อนไขปุ่มใน modal)
    //
    // งานที่เคลียร์แล้ว (clearStatus) ก็ดึงข้อมูลได้ — เพราะเติมเฉพาะช่องที่ยัง null
    // จึงไม่ทับยอดที่ปิดไปแล้ว (ตรงกับเจตนาของ lock ใน PATCH /api/jobs/[id])
    const jobs = await prisma.job.findMany({
      where: {
        jobDate: { gte: start, lt: end },
        isCancelled: false,
        jobType: { notIn: ["advance", "noJob"] },
        OR: [{ income: null }, { driverWage: null }],
      },
      select: {
        id: true,
        jobDate: true,
        jobType: true,
        size: true,
        factoryLocationId: true,
        customerId: true,
        income: true,
        driverWage: true,
      },
    });

    if (jobs.length === 0) {
      return NextResponse.json({ scanned: 0, updated: 0, incomeFilled: 0, driverWageFilled: 0 });
    }

    const [incomeRates, driverWageRates, fuelLogs] = await Promise.all([
      prisma.rateIncome.findMany({ include: { fuelSurcharges: true } }),
      prisma.rateDriverWage.findMany(),
      prisma.fuelPriceLog.findMany({ orderBy: { effectiveDate: "desc" } }),
    ]);

    const incomeByKey = new Map(
      incomeRates.map((r) => [`${r.jobType}|${r.size}|${r.factoryLocationId}|${r.customerId}`, r])
    );
    const wageByKey = new Map(
      driverWageRates.map((r) => [`${r.jobType}|${r.size}|${r.factoryLocationId ?? ""}`, r])
    );

    /** ราคาน้ำมันที่มีผล ณ วันที่งาน = log ล่าสุดที่ effectiveDate <= jobDate */
    const fuelPriceAt = (date: Date): number | null => {
      const log = fuelLogs.find((l) => l.effectiveDate <= date);
      return log ? Number(log.pricePerLiter) : null;
    };

    let incomeFilled = 0;
    let driverWageFilled = 0;
    const updates: { id: string; data: { income?: number; driverWage?: number } }[] = [];

    for (const job of jobs) {
      const data: { income?: number; driverWage?: number } = {};

      if (job.income === null && job.jobType && job.size && job.factoryLocationId && job.customerId) {
        const rate = incomeByKey.get(
          `${job.jobType}|${job.size}|${job.factoryLocationId}|${job.customerId}`
        );
        if (rate) {
          let surcharge = 0;
          if (rate.fuelSurcharges.length > 0) {
            const price = fuelPriceAt(job.jobDate);
            if (price !== null) {
              const matched = rate.fuelSurcharges.find(
                (s) => price >= Number(s.fuelPriceMin) && price < Number(s.fuelPriceMax)
              );
              if (matched) surcharge = Number(matched.surcharge);
            }
          }
          data.income = Number(rate.income) + surcharge;
          incomeFilled++;
        }
      }

      // ทอยตู้ไม่ผูกกับโรงงาน — ประเภทอื่นต้องมี factoryLocationId ถึงจะหาอัตราได้
      if (job.driverWage === null && job.jobType && job.size) {
        const needsFactory = job.jobType !== "towing";
        if (!needsFactory || job.factoryLocationId) {
          const rate = wageByKey.get(`${job.jobType}|${job.size}|${job.factoryLocationId ?? ""}`);
          if (rate) {
            data.driverWage = Number(rate.driverWage);
            driverWageFilled++;
          }
        }
      }

      if (Object.keys(data).length > 0) updates.push({ id: job.id, data });
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) => prisma.job.update({ where: { id: u.id }, data: u.data }))
      );
    }

    return NextResponse.json({
      scanned: jobs.length,
      updated: updates.length,
      incomeFilled,
      driverWageFilled,
    });
  } catch (error) {
    console.error("Error prefilling job rates:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" }, { status: 500 });
  }
}
