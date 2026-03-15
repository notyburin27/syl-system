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
    const accounts = await prisma.driverBankAccount.findMany({
      where: { driverId: id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีธนาคาร" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { bankName, accountNo, accountName } = body;

    if (!bankName?.trim() || !accountNo?.trim() || !accountName?.trim()) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูลบัญชีธนาคารให้ครบ" },
        { status: 400 }
      );
    }

    const account = await prisma.driverBankAccount.create({
      data: {
        driverId: id,
        bankName: bankName.trim(),
        accountNo: accountNo.trim(),
        accountName: accountName.trim(),
      },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("Error creating bank account:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการเพิ่มบัญชีธนาคาร" },
      { status: 500 }
    );
  }
}
