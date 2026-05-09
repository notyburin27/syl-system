import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/jobs/[id]/towing-links/[sequence] — ยกเลิก link
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; sequence: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, sequence } = await params;
  const seq = Number(sequence);

  try {
    await prisma.jobTowingLink.delete({
      where: { mainJobId_sequence: { mainJobId: id, sequence: seq } },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ไม่พบ link ที่จะลบ" }, { status: 404 });
  }
}
