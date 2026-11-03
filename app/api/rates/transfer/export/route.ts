import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/utils/roleGuard";
import { MASTER_DATA_ROLES } from "@/lib/settingsNav";
import { prisma } from "@/lib/prisma";
import { writeRowsToBuffer } from "@/lib/utils/excel";
import { getJobTypeLabel } from "@/types/job";

export async function GET(req: Request) {
  const denied = await requireApiRoles(MASTER_DATA_ROLES);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const jobType = searchParams.get("jobType");
  const size = searchParams.get("size");
  const locationId = searchParams.get("locationId");

  const rates = await prisma.rateTransfer.findMany({
    where: {
      ...(jobType ? { jobType } : {}),
      ...(size ? { size } : {}),
      ...(locationId ? { locationId } : {}),
    },
    include: { location: true },
    orderBy: [{ location: { name: "asc" } }, { size: "asc" }],
  });

  const rows: (string | number)[][] = [
    ["ลักษณะงาน", "SIZE", "สถานที่", "ค่ารับตู้", "ค่าคืนตู้"],
    ...rates.map((r) => [
      getJobTypeLabel(r.jobType),
      r.size,
      r.location.name,
      Number(r.pickupFee),
      Number(r.returnFee),
    ]),
  ];

  const buf = await writeRowsToBuffer(rows, "rate-transfer");

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="rate_transfer.xlsx"',
    },
  });
}
