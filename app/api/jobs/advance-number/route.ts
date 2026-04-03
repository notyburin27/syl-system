import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import dayjs from "dayjs";

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobNumber = `ADV-${dayjs().format("YYMMDD-HHmmss")}`;
  return NextResponse.json({ jobNumber });
}
