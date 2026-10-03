import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DUPLICATE_FUEL_STANDARD_ERROR,
  FUEL_STANDARD_INCLUDE,
  findDuplicateFuelStandard,
  parseFuelStandardInput,
  requireAdmin,
} from "@/lib/utils/fuelStandardApi";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const rows = await prisma.fuelStandard.findMany({
    include: FUEL_STANDARD_INCLUDE,
    orderBy: [{ size: "asc" }, { pickupLocation: { name: "asc" } }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const parsed = parseFuelStandardInput(await req.json());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (await findDuplicateFuelStandard(parsed.data)) {
      return NextResponse.json({ error: DUPLICATE_FUEL_STANDARD_ERROR }, { status: 409 });
    }

    const row = await prisma.fuelStandard.create({ data: parsed.data, include: FUEL_STANDARD_INCLUDE });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
