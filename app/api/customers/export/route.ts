import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeRowsToBuffer } from "@/lib/utils/excel";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });

  const rows: (string | number)[][] = [["ชื่อลูกค้า"], ...customers.map((c) => [c.name])];

  const buf = await writeRowsToBuffer(rows, "customers");

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="customers.xlsx"',
    },
  });
}
