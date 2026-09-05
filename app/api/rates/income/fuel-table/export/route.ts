import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { buildFuelRateSheetRows, FUEL_RATE_TEMPLATE_ROWS } from "@/lib/utils/fuelRateExcel";

function toXlsxResponse(rows: (string | number)[][], filename: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "fuel-rates");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // ?template=1 → ไฟล์ตัวอย่างเปล่า ไม่ต้องแตะ DB
  if (searchParams.get("template")) {
    return toXlsxResponse(FUEL_RATE_TEMPLATE_ROWS, "fuel_rates_template.xlsx");
  }

  const customerId = searchParams.get("customerId");
  const factoryLocationId = searchParams.get("factoryLocationId");
  if (!customerId || !factoryLocationId) {
    return NextResponse.json({ error: "กรุณาเลือกลูกค้าและโรงงาน" }, { status: 400 });
  }

  // เฉพาะ rate ที่มีช่วงราคาน้ำมัน — ตรงกับที่ modal เคยกรองฝั่ง client
  const rates = await prisma.rateIncome.findMany({
    where: { customerId, factoryLocationId, fuelSurcharges: { some: {} } },
    include: { fuelSurcharges: true },
  });

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

  return toXlsxResponse(buildFuelRateSheetRows(plain), "fuel_rates_current.xlsx");
}
