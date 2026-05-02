import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Check if job is cleared/locked
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    }
    if (existing.clearStatus) {
      return NextResponse.json(
        { error: "งานนี้ถูกล็อคแล้ว ไม่สามารถแก้ไขได้" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Build update data from provided fields only
    const allowedFields = [
      "jobDate",
      "jobType",
      "customerId",
      "jobNumber",
      "driverId",
      "size",
      "pickupLocationId",
      "factoryLocationId",
      "returnLocationId",
      "income",
      "driverWage",
      "estimatedPickupFee",
      "estimatedReturnFee",
      "actualTransfer",
      "advance",
      "toll",
      "pickupFee",
      "returnFee",
      "liftFee",
      "storageFee",
      "tire",
      "other",
      "mileage",
      "fuelOfficeLiters",
      "fuelCashLiters",
      "fuelCashAmount",
      "fuelCreditLiters",
      "fuelCreditAmount",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === "jobDate") {
          data[field] = new Date(body[field]);
        } else {
          data[field] = body[field];
        }
      }
    }

    const job = await prisma.job.update({
      where: { id },
      data,
      include: {
        customer: true,
        driver: true,
        pickupLocation: true,
        factoryLocation: true,
        returnLocation: true,
      },
    });

    return NextResponse.json(job);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "เลขที่งานนี้มีอยู่แล้ว" },
        { status: 400 }
      );
    }
    console.error("Error updating job:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการแก้ไขงาน" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    }
    if (existing.clearStatus) {
      return NextResponse.json(
        { error: "งานนี้ถูกล็อคแล้ว ไม่สามารถลบได้" },
        { status: 403 }
      );
    }

    await prisma.job.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting job:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลบงาน" },
      { status: 500 }
    );
  }
}
