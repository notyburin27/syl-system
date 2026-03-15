import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { accountId } = await params;
    const body = await req.json();
    const { bankName, accountNo, accountName } = body;

    if (!bankName?.trim() || !accountNo?.trim() || !accountName?.trim()) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูลบัญชีธนาคารให้ครบ" },
        { status: 400 }
      );
    }

    const account = await prisma.driverBankAccount.update({
      where: { id: accountId },
      data: {
        bankName: bankName.trim(),
        accountNo: accountNo.trim(),
        accountName: accountName.trim(),
      },
    });
    return NextResponse.json(account);
  } catch (error) {
    console.error("Error updating bank account:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการแก้ไขบัญชีธนาคาร" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { accountId } = await params;
    await prisma.driverBankAccount.delete({
      where: { id: accountId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bank account:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลบบัญชีธนาคาร" },
      { status: 500 }
    );
  }
}
