import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { RATE_ROLES } from "@/lib/settingsNav";
import { prisma } from "@/lib/prisma";
import { writeRowsToBuffer } from "@/lib/utils/excel";
import { getJobTypeLabel } from "@/types/job";
import { displayRangeLabel } from "@/lib/utils/fuelRateExcel";

export async function GET(req: Request) {
  const denied = await requireApiRoles(RATE_ROLES);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const factoryLocationId = searchParams.get("factoryLocationId");
  const jobType = searchParams.get("jobType");
  const size = searchParams.get("size");

  const rates = await prisma.rateIncome.findMany({
    where: {
      ...(customerId ? { customerId } : {}),
      ...(factoryLocationId ? { factoryLocationId } : {}),
      ...(jobType ? { jobType } : {}),
      ...(size ? { size } : {}),
    },
    include: { customer: true, factoryLocation: true, fuelSurcharges: true },
    orderBy: [{ customer: { name: "asc" } }, { factoryLocation: { name: "asc" } }, { size: "asc" }],
  });

  // long format แถวละ 1 ช่วงราคาน้ำมัน — rate ที่ไม่มีช่วงออกแถวเดียวช่องช่วงว่าง
  const rows: (string | number)[][] = [
    ["ลูกค้า", "โรงงาน", "ลักษณะงาน", "SIZE", "ช่วงราคาน้ำมัน", "ค่าขนส่ง"],
    ...rates.flatMap((r) => {
      const base = [r.customer.name, r.factoryLocation.name, getJobTypeLabel(r.jobType), r.size];
      if (r.fuelSurcharges.length === 0) return [[...base, "", Number(r.income)]];
      return [...r.fuelSurcharges]
        .sort((a, b) => Number(a.fuelPriceMin) - Number(b.fuelPriceMin))
        .map((s) => [
          ...base,
          displayRangeLabel(Number(s.fuelPriceMin), Number(s.fuelPriceMax)),
          Number(r.income) + Number(s.surcharge),
        ]);
    }),
  ];

  const buf = await writeRowsToBuffer(rows, "rate-income");

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="rate_income.xlsx"',
    },
  });
}
