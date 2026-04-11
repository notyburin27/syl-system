import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const { fuelPriceMin, fuelPriceMax, surcharge } = await req.json();

    if (fuelPriceMin != null && fuelPriceMax != null && Number(fuelPriceMin) >= Number(fuelPriceMax)) {
      return NextResponse.json({ error: "ราคาต่ำสุดต้องน้อยกว่าราคาสูงสุด" }, { status: 400 });
    }

    const record = await prisma.rateIncomeFuelSurcharge.update({
      where: { id },
      data: {
        ...(fuelPriceMin != null && { fuelPriceMin }),
        ...(fuelPriceMax != null && { fuelPriceMax }),
        ...(surcharge != null && { surcharge }),
      },
    });
    return NextResponse.json(record);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    await prisma.rateIncomeFuelSurcharge.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
