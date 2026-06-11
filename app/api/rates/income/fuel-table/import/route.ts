import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { parseFuelRateRows, toStoredMax } from "@/lib/utils/fuelRateExcel";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const customerId = formData.get("customerId");
    const factoryLocationId = formData.get("factoryLocationId");

    if (!(file instanceof File) || typeof customerId !== "string" || typeof factoryLocationId !== "string" || !customerId || !factoryLocationId) {
      return NextResponse.json({ error: "กรุณาเลือกลูกค้า โรงงาน และแนบไฟล์" }, { status: 400 });
    }

    const [customer, factory] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.location.findUnique({ where: { id: factoryLocationId } }),
    ]);
    if (!customer || !factory) {
      return NextResponse.json({ error: "ไม่พบลูกค้าหรือโรงงานที่เลือก" }, { status: 400 });
    }

    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: "ไฟล์ไม่มีข้อมูล" }, { status: 400 });

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    const parsed = parseFuelRateRows(rows);
    if (!parsed.ok) {
      return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let rangeCount = 0;

    await prisma.$transaction(async (tx) => {
      // ไฟล์ = ความจริงทั้งชุดของช่วงราคาน้ำมันของลูกค้า+โรงงานนี้ → ล้างของเดิมทั้งหมดก่อน
      await tx.rateIncomeFuelSurcharge.deleteMany({
        where: { rateIncome: { customerId, factoryLocationId } },
      });

      for (const rate of parsed.rates) {
        const where = {
          jobType_size_factoryLocationId_customerId: {
            jobType: rate.jobType,
            size: rate.size,
            factoryLocationId,
            customerId,
          },
        };
        const existing = await tx.rateIncome.findUnique({ where });
        const rateIncome = existing
          ? await tx.rateIncome.update({ where: { id: existing.id }, data: { income: rate.baseIncome } })
          : await tx.rateIncome.create({
              data: { jobType: rate.jobType, size: rate.size, factoryLocationId, customerId, income: rate.baseIncome },
            });
        if (existing) updated++;
        else created++;

        await tx.rateIncomeFuelSurcharge.createMany({
          data: rate.ranges.map((r) => ({
            rateIncomeId: rateIncome.id,
            fuelPriceMin: r.fuelPriceMin,
            fuelPriceMax: toStoredMax(r.fuelPriceMax),
            surcharge: r.surcharge,
          })),
        });
        rangeCount += rate.ranges.length;
      }
    });

    return NextResponse.json({ created, updated, rangeCount });
  } catch (error) {
    console.error("Error importing fuel rate table:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการนำเข้าข้อมูล" }, { status: 500 });
  }
}
