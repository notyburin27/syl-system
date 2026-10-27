import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { settingsPageRoles } from "@/lib/settingsNav";

/** API: คืน response 401/403 ถ้าไม่ผ่าน, null ถ้าผ่าน */
export async function requireApiRoles(roles: readonly string[]): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roles.includes(session.user.role)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }
  return null;
}

/** หน้า: role ไม่อยู่ในรายการ → กลับหน้ารายการงาน */
export async function requirePageRoles(roles: readonly string[]): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!roles.includes(session.user.role)) redirect("/jobs");
}

/** หน้าตั้งค่า: ใช้ role ตาม SETTINGS_GROUPS ของหน้านั้น */
export async function requireSettingsPage(href: string): Promise<void> {
  await requirePageRoles(settingsPageRoles(href));
}
