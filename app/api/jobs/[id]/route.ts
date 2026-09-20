import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        customer: true,
        driver: { select: { id: true, name: true, vehicleNumber: true, groupName: true, startDate: true } },
        pickupLocation: true,
        factoryLocation: true,
        returnLocation: true,
        transfers: { orderBy: { createdAt: "asc" } },
        towingLinksAsMain: {
          orderBy: { sequence: "asc" },
          include: {
            towingJob: { include: { pickupLocation: true, returnLocation: true } },
          },
        },
        towingLinkAsTowing: {
          include: { mainJob: { select: { id: true, jobNumber: true, jobDate: true, jobType: true } } },
        },
        pairLinkAsPrimary: {
          include: { secondaryJob: { select: { id: true, jobNumber: true, jobDate: true, size: true } } },
        },
        pairLinkAsSecondary: {
          include: { primaryJob: { select: { id: true, jobNumber: true, jobDate: true, size: true } } },
        },
      },
    });
    if (!job) {
      return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (error) {
    console.error("Error fetching job:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลงาน" }, { status: 500 });
  }
}

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

    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    }
    const body = await req.json();

    // ฟิลด์น้ำมัน/ไมล์/หมายเหตุ ยังแก้ได้แม้งานถูกเคลียร์ (ข้อมูลมาทีหลังการปิดยอด)
    const clearedEditableFields = [
      "mileage",
      "fuelOfficeLiters",
      "fuelCashLiters",
      "fuelCashAmount",
      "fuelCreditLiters",
      "fuelCreditAmount",
      "remarks",
    ];

    if (
      existing.clearStatus &&
      !Object.keys(body).every((f) => clearedEditableFields.includes(f))
    ) {
      return NextResponse.json(
        { error: "งานนี้ถูกล็อคแล้ว ไม่สามารถแก้ไขได้" },
        { status: 403 }
      );
    }

    // เลขที่งานห้ามซ้ำกับงานอื่น (ยกเว้นตัวเอง)
    if ("jobNumber" in body) {
      const jobNumber = String(body.jobNumber ?? "").trim();
      if (!jobNumber) {
        return NextResponse.json(
          { error: "กรุณากรอก JOB/เลขที่" },
          { status: 400 }
        );
      }
      const duplicate = await prisma.job.findFirst({
        where: { jobNumber, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "เลขที่งานนี้มีอยู่แล้ว" },
          { status: 400 }
        );
      }
      body.jobNumber = jobNumber;
    }

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
      "actualTransferPrev",
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
      "remarks",
      "noJobReason",
      "carryOverToJobId",
      "isCancelled",
      "isCarry",
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

    // งานที่ถูกจับคู่แล้ว (ฝั่ง secondary) ยอดต้องเป็น null เสมอ — ยอดอยู่ที่ใบ primary
    if (data.income !== undefined || data.driverWage !== undefined) {
      const pairLink = await prisma.jobPairLink.findUnique({
        where: { secondaryJobId: id },
        select: { primaryJob: { select: { jobNumber: true } } },
      });
      if (pairLink) {
        return NextResponse.json(
          { error: `งานนี้ถูกจับคู่แล้ว ยอดอยู่ที่ ${pairLink.primaryJob.jobNumber}` },
          { status: 400 }
        );
      }
    }

    // ยกเลิกใบงาน → เคลียร์ค่าขนส่ง (รายได้) และค่าเที่ยวคนขับเป็น null
    // งานที่ยกเลิกไม่ควรมีตัวเลขค้างอยู่ในรายงาน/สรุป
    if (data.isCancelled === true) {
      data.income = null;
      data.driverWage = null;
    }

    const job = await prisma.job.update({
      where: { id },
      data,
      include: {
        customer: true,
        driver: { select: { id: true, name: true, vehicleNumber: true, groupName: true, startDate: true } },
        pickupLocation: true,
        factoryLocation: true,
        returnLocation: true,
        transfers: { orderBy: { createdAt: "asc" } },
        towingLinksAsMain: {
          orderBy: { sequence: "asc" },
          include: {
            towingJob: { include: { pickupLocation: true, returnLocation: true } },
          },
        },
        towingLinkAsTowing: {
          include: { mainJob: { select: { id: true, jobNumber: true, jobDate: true, jobType: true } } },
        },
        pairLinkAsPrimary: {
          include: { secondaryJob: { select: { id: true, jobNumber: true, jobDate: true, size: true } } },
        },
        pairLinkAsSecondary: {
          include: { primaryJob: { select: { id: true, jobNumber: true, jobDate: true, size: true } } },
        },
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

    const existing = await prisma.job.findUnique({
      where: { id },
      select: {
        clearStatus: true,
        pairLinkAsPrimary: {
          select: { secondaryJob: { select: { jobNumber: true } } },
        },
        pairLinkAsSecondary: {
          select: { primaryJob: { select: { jobNumber: true } } },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    }
    if (existing.clearStatus) {
      return NextResponse.json(
        { error: "งานนี้ถูกล็อคแล้ว ไม่สามารถลบได้" },
        { status: 403 }
      );
    }
    // ลบใบเดียวของคู่ไม่ได้ — JobPairLink เป็น onDelete: Cascade
    // อีกใบจะเหลือยอดอัตราคู่ (2x20DC) ทั้งที่ไม่มีคู่แล้ว โดยไม่มีอะไรเตือน
    const pairPartner =
      existing.pairLinkAsPrimary?.secondaryJob ??
      existing.pairLinkAsSecondary?.primaryJob ??
      null;
    if (pairPartner) {
      return NextResponse.json(
        { error: `งานนี้จับคู่อยู่กับ ${pairPartner.jobNumber} กรุณาปลดคู่ก่อนลบ` },
        { status: 400 }
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
