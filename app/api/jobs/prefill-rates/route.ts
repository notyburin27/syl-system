import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPairedSize, isTowingJobType } from "@/types/job";
import { isAbsorbPickupName, isAbsorbedBy, type AbsorbJob } from "@/lib/utils/towingAbsorb";

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
        // ใบที่ถูกจับคู่แล้วยอดต้องเป็น null เสมอ — ห้ามเติมกลับ
        pairLinkAsSecondary: null,
        // ทอยตู้ที่ถูกดูดซับแล้ว ค่าเที่ยวต้องเป็น null เสมอ — ห้ามเติมกลับ
        isTowingAbsorbed: false,
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
        pairLinkAsPrimary: { select: { id: true } },
      },
    });

    let incomeFilled = 0;
    let driverWageFilled = 0;
    const updates: { id: string; data: { income?: number; driverWage?: number } }[] = [];

    // เติมอัตราเฉพาะตอนมีงานที่ต้องเติมจริง — แต่ขั้นตอนดูดซับทอยตู้ด้านล่างต้องรันเสมอ
    // แม้เดือนนี้ทุกใบจะมีอัตราครบแล้ว (กรณีปกติของเดือนที่ทำงานไปแล้ว) ก็ยังต้องดูดซับได้
    if (jobs.length > 0) {
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

      for (const job of jobs) {
        // ใบที่ถือยอดของคู่ ใช้อัตราคู่ (2x20DC) แม้ size ใน DB ยังเป็น 20DC
        const rateSize = job.pairLinkAsPrimary
          ? getPairedSize(job.size) ?? job.size
          : job.size;

        const data: { income?: number; driverWage?: number } = {};

        if (job.income === null && job.jobType && rateSize && job.factoryLocationId && job.customerId) {
          const rate = incomeByKey.get(
            `${job.jobType}|${rateSize}|${job.factoryLocationId}|${job.customerId}`
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

        // ทอยตู้/ทอยตู้หนักไม่ผูกกับโรงงาน — ประเภทอื่นต้องมี factoryLocationId ถึงจะหาอัตราได้
        if (job.driverWage === null && job.jobType && rateSize) {
          const needsFactory = !isTowingJobType(job.jobType);
          if (!needsFactory || job.factoryLocationId) {
            const rate = wageByKey.get(`${job.jobType}|${rateSize}|${job.factoryLocationId ?? ""}`);
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
    }

    // ── ดูดซับทอยตู้ ──
    // งานหลักที่รับตู้จากคาหาง/รับเช้าเดินทาง ดูดซับทอยตู้ที่เป็นขาเตรียมของมัน
    const monthJobs = await prisma.job.findMany({
      where: {
        jobDate: { gte: start, lt: end },
        isCancelled: false,
        clearStatus: false,
        jobType: { in: ["inbound", "outbound", "towing", "towingHeavy"] },
      },
      select: {
        id: true,
        jobDate: true,
        jobType: true,
        size: true,
        driverId: true,
        customerId: true,
        createdAt: true,
        isCancelled: true,
        clearStatus: true,
        isTowingAbsorbed: true,
        pickupLocation: { select: { name: true } },
        // ต้องรู้ว่างานถูกจับคู่งานหรือไม่ (ฝั่งใดฝั่งหนึ่ง) — ทอยตู้ที่ถูกจับคู่ห้ามถูกดูดซับ
        pairLinkAsPrimary: { select: { id: true } },
        pairLinkAsSecondary: { select: { id: true } },
      },
    });

    /** งานถูกจับคู่งานอยู่ไหม (ฝั่งใดฝั่งหนึ่งก็นับ) */
    const hasPairLink = (j: { pairLinkAsPrimary: { id: string } | null; pairLinkAsSecondary: { id: string } | null }): boolean =>
      !!j.pairLinkAsPrimary || !!j.pairLinkAsSecondary;

    const toAbsorbJob = (j: (typeof monthJobs)[number]): AbsorbJob => ({
      id: j.id,
      jobDate: j.jobDate,
      jobType: j.jobType,
      size: j.size,
      driverId: j.driverId,
      customerId: j.customerId,
      createdAt: j.createdAt,
      isCancelled: j.isCancelled,
      clearStatus: j.clearStatus,
      hasPairLink: hasPairLink(j),
    });

    const absorbers = monthJobs
      .filter(
        (j) =>
          (j.jobType === "inbound" || j.jobType === "outbound") &&
          isAbsorbPickupName(j.pickupLocation?.name)
      )
      .map(toAbsorbJob);

    const absorbIds: string[] = [];
    for (const j of monthJobs) {
      if (j.jobType !== "towing" && j.jobType !== "towingHeavy") continue;
      if (j.isTowingAbsorbed) continue;
      // ทอยตู้ที่ถูกจับคู่งานแล้วห้ามถูกดูดซับ — เงินเป็นเรื่องของระบบจับคู่งานอยู่แล้ว
      if (hasPairLink(j)) continue;
      const tj = toAbsorbJob(j);
      if (absorbers.some((m) => isAbsorbedBy(tj, m))) absorbIds.push(j.id);
    }

    if (absorbIds.length > 0) {
      await prisma.job.updateMany({
        where: { id: { in: absorbIds } },
        data: { driverWage: null, isTowingAbsorbed: true },
      });
    }

    return NextResponse.json({
      scanned: jobs.length,
      updated: updates.length,
      incomeFilled,
      driverWageFilled,
      absorbed: absorbIds.length,
    });
  } catch (error) {
    console.error("Error prefilling job rates:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" }, { status: 500 });
  }
}
