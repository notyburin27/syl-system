import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SIZE_OPTIONS } from "@/types/job";

export const DUPLICATE_FUEL_STANDARD_ERROR = "มีข้อมูลนี้อยู่แล้ว";

export const FUEL_STANDARD_INCLUDE = {
  pickupLocation: { select: { id: true, name: true } },
  factoryLocation: { select: { id: true, name: true } },
  returnLocation: { select: { id: true, name: true } },
} as const;

/** route น้ำมันมาตรฐานทุกตัวใช้ได้เฉพาะ ADMIN — คืน response ถ้าไม่ผ่าน, null ถ้าผ่าน */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }
  return null;
}

export interface FuelStandardInput {
  size: string;
  pickupLocationId: string;
  factoryLocationId: string | null;
  returnLocationId: string;
  liters: number;
}

export function parseFuelStandardInput(body: unknown): { data: FuelStandardInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const size = str(b.size);
  const pickupLocationId = str(b.pickupLocationId);
  const returnLocationId = str(b.returnLocationId);
  const factoryLocationId = str(b.factoryLocationId);
  const liters = typeof b.liters === "number" ? b.liters : Number(b.liters);

  if (!size || !pickupLocationId || !returnLocationId || b.liters == null || b.liters === "") {
    return { error: "กรุณากรอกข้อมูลให้ครบ" };
  }
  if (!(SIZE_OPTIONS as readonly string[]).includes(size)) return { error: `SIZE "${size}" ไม่ถูกต้อง` };
  if (Number.isNaN(liters) || liters < 0) return { error: "ลิตรต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" };

  return { data: { size, pickupLocationId, factoryLocationId, returnLocationId, liters } };
}

/** where ของ key 4 ตัว — โรงงานว่างต้องใช้ equals null เพราะ unique constraint กัน NULL ซ้ำไม่ได้ */
export function fuelStandardKeyWhere(input: Omit<FuelStandardInput, "liters">) {
  return {
    size: input.size,
    pickupLocationId: input.pickupLocationId,
    factoryLocationId: input.factoryLocationId === null ? { equals: null } : input.factoryLocationId,
    returnLocationId: input.returnLocationId,
  };
}

export async function findDuplicateFuelStandard(input: FuelStandardInput, excludeId?: string) {
  return prisma.fuelStandard.findFirst({
    where: { ...fuelStandardKeyWhere(input), ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
}

export const isPrismaNotFound = (error: unknown) =>
  (error as { code?: string } | null)?.code === "P2025";
