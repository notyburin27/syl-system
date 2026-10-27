import { prisma } from "@/lib/prisma";
import { SIZE_OPTIONS } from "@/types/job";
import { parseFuelLiters } from "@/lib/utils/fuelStandardImport";
import { FUEL_STANDARD_KINDS, type FuelStandardKind } from "@/lib/utils/fuelSegments";

export const DUPLICATE_FUEL_STANDARD_ERROR = "มีข้อมูลนี้อยู่แล้ว";

export const FUEL_STANDARD_INCLUDE = {
  location: { select: { id: true, name: true } },
} as const;

export interface FuelStandardInput {
  kind: FuelStandardKind;
  size: string;
  locationId: string;
  pickupLaemChabang: boolean;
  returnLaemChabang: boolean;
  liters: number;
}

export function parseFuelStandardInput(body: unknown): { data: FuelStandardInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const kind = str(b.kind);
  const size = str(b.size);
  const locationId = str(b.locationId);

  if (!kind || !size || !locationId || b.liters == null || b.liters === "") {
    return { error: "กรุณากรอกข้อมูลให้ครบ" };
  }
  if (!(FUEL_STANDARD_KINDS as readonly string[]).includes(kind)) return { error: `ประเภท "${kind}" ไม่ถูกต้อง` };
  if (!(SIZE_OPTIONS as readonly string[]).includes(size)) return { error: `SIZE "${size}" ไม่ถูกต้อง` };
  for (const field of ["pickupLaemChabang", "returnLaemChabang"]) {
    if (b[field] != null && typeof b[field] !== "boolean") return { error: "ค่าแหลมฉบังไม่ถูกต้อง" };
  }
  const pickupLaemChabang = b.pickupLaemChabang === true;
  const returnLaemChabang = b.returnLaemChabang === true;
  if ((pickupLaemChabang || returnLaemChabang) && kind === "towing") return { error: "งานทอยไม่ต้องระบุแหลมฉบัง" };
  const parsed = parseFuelLiters(b.liters);
  if ("error" in parsed) return parsed;

  return {
    data: { kind: kind as FuelStandardKind, size, locationId, pickupLaemChabang, returnLaemChabang, liters: parsed.liters },
  };
}

export async function findDuplicateFuelStandard(input: FuelStandardInput, excludeId?: string) {
  const { kind, size, locationId, pickupLaemChabang, returnLaemChabang } = input;
  return prisma.fuelStandard.findFirst({
    where: { kind, size, locationId, pickupLaemChabang, returnLaemChabang, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
}

export const isPrismaNotFound = (error: unknown) =>
  (error as { code?: string } | null)?.code === "P2025";
