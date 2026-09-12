import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeRowsToBuffer } from "@/lib/utils/excel";
import { buildFuelRateSheetRows, buildFuelRateFilename, FUEL_RATE_TEMPLATE_ROWS } from "@/lib/utils/fuelRateExcel";

async function toXlsxResponse(rows: (string | number)[][], filename: string) {
  const buf = await writeRowsToBuffer(rows, "fuel-rates");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // ชื่อไฟล์มีภาษาไทย → ต้องใช้ filename* (RFC 5987) เพราะ header รับได้แค่ ASCII
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // ?template=1 → ไฟล์ตัวอย่างเปล่า ไม่ต้องแตะ DB
  if (searchParams.get("template")) {
    return await toXlsxResponse(FUEL_RATE_TEMPLATE_ROWS, "fuel_rates_template.xlsx");
  }

  const customerId = searchParams.get("customerId");
  const factoryLocationId = searchParams.get("factoryLocationId");
  if (!customerId || !factoryLocationId) {
    return NextResponse.json({ error: "กรุณาเลือกลูกค้าและโรงงาน" }, { status: 400 });
  }

  // เฉพาะ rate ที่มีช่วงราคาน้ำมัน — ตรงกับที่ modal เคยกรองฝั่ง client
  const [customer, factory, rates] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.location.findUnique({ where: { id: factoryLocationId } }),
    prisma.rateIncome.findMany({
      where: { customerId, factoryLocationId, fuelSurcharges: { some: {} } },
      include: { fuelSurcharges: true },
    }),
  ]);
  if (!customer || !factory) {
    return NextResponse.json({ error: "ไม่พบลูกค้าหรือโรงงานที่เลือก" }, { status: 400 });
  }

  // Prisma คืน Decimal — helper รับ number|string (รูปทรงหลัง serialize ผ่าน API)
  const plain = rates.map((r) => ({
    jobType: r.jobType,
    size: r.size,
    income: Number(r.income),
    fuelSurcharges: r.fuelSurcharges.map((s) => ({
      fuelPriceMin: Number(s.fuelPriceMin),
      fuelPriceMax: Number(s.fuelPriceMax),
      surcharge: Number(s.surcharge),
    })),
  }));

  // ชื่อไฟล์พาลูกค้า+โรงงานติดไปด้วย → อัปโหลดกลับได้โดยไม่ต้องเลือก dropdown ซ้ำ
  return await toXlsxResponse(buildFuelRateSheetRows(plain), buildFuelRateFilename(customer.name, factory.name));
}
