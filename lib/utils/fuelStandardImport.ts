import { SIZE_OPTIONS } from "@/types/job";
import type { FuelStandardKind } from "@/lib/utils/fuelSegments";

export interface FuelStandardImportRow {
  kind?: string;
  size?: string;
  locationName?: string;
  pickupLaemChabang?: string;
  returnLaemChabang?: string;
  liters?: string;
}

export interface ImportLocation {
  id: string;
  name: string;
  type: string;
}

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ResolvedFuelStandardRow {
  kind: FuelStandardKind;
  size: string;
  locationId: string;
  pickupLaemChabang: boolean;
  returnLaemChabang: boolean;
  liters: number;
}

/** Decimal(10,2) */
export const MAX_FUEL_LITERS = 99999999.99;

/** ชื่อประเภทในไฟล์ CSV — export ใช้ภาษาไทย, import รับทั้งไทยและอังกฤษ */
export const FUEL_KIND_LABELS: Record<FuelStandardKind, string> = { run: "วิ่ง", towing: "ทอย" };

const KIND_BY_TEXT: Record<string, FuelStandardKind> = {
  วิ่ง: "run",
  ทอย: "towing",
  run: "run",
  towing: "towing",
};

const LAEM_TRUE = ["y", "ใช่", "1", "true"];
const LAEM_FALSE = ["", "n", "ไม่", "0", "false"];

/** แปลงลิตรจาก input (string/number) — คืน error เป็นข้อความไทยถ้าไม่ผ่าน */
export function parseFuelLiters(value: unknown): { liters: number } | { error: string } {
  const invalid = { error: "ลิตรต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" };
  const text = typeof value === "string" ? value.trim() : value;
  if (text == null || text === "" || (typeof text !== "string" && typeof text !== "number")) return invalid;
  const liters = Number(text);
  if (Number.isNaN(liters) || liters < 0) return invalid;
  if (!Number.isFinite(liters) || liters > MAX_FUEL_LITERS) return { error: "ลิตรต้องไม่เกิน 99,999,999.99" };
  return { liters };
}

/**
 * ตรวจแถว CSV และแปลงชื่อสถานที่เป็น id
 * ไม่สร้างสถานที่ใหม่ให้ (ต่างจาก import อัตราอื่น) — ชื่อพิมพ์ผิดจะได้สถานที่ซ้ำที่ไม่ match กับ job เงียบๆ
 */
export function validateFuelStandardRows(
  rows: FuelStandardImportRow[],
  locations: ImportLocation[]
): { errors: ImportValidationError[]; resolved: ResolvedFuelStandardRow[] } {
  const byName = new Map(locations.map((l) => [l.name, l]));
  const errors: ImportValidationError[] = [];
  const resolved: ResolvedFuelStandardRow[] = [];

  const kindOf = (r: FuelStandardImportRow) => KIND_BY_TEXT[(r.kind ?? "").trim().toLowerCase()];
  const laemText = (v: string | undefined) => (v ?? "").trim().toLowerCase();

  // ซ้ำในไฟล์เทียบด้วยค่าที่แปลงแล้ว — "วิ่ง" กับ "run", "Y" กับ "ใช่" คือ key เดียวกัน
  const laemKey = (v: string | undefined) => {
    const t = laemText(v);
    return LAEM_TRUE.includes(t) ? "1" : LAEM_FALSE.includes(t) ? "0" : t;
  };
  const keyOf = (r: FuelStandardImportRow) =>
    [kindOf(r) ?? r.kind ?? "", r.size ?? "", r.locationName ?? "", laemKey(r.pickupLaemChabang), laemKey(r.returnLaemChabang)].join("|");
  const rowsByKey = new Map<string, number[]>();
  rows.forEach((r, i) => rowsByKey.set(keyOf(r), [...(rowsByKey.get(keyOf(r)) ?? []), i + 1]));

  rows.forEach((r, index) => {
    const rowNum = index + 1;
    const rowErrors: ImportValidationError[] = [];
    const err = (field: string, message: string) => rowErrors.push({ row: rowNum, field, message });

    const kind = kindOf(r);
    if (!r.kind) err("kind", "กรุณาระบุประเภท (วิ่ง/ทอย)");
    else if (!kind) err("kind", `ประเภท "${r.kind}" ไม่ถูกต้อง (ใช้ วิ่ง หรือ ทอย)`);

    if (!r.size) err("size", "กรุณาระบุ SIZE");
    else if (!(SIZE_OPTIONS as readonly string[]).includes(r.size)) err("size", `SIZE "${r.size}" ไม่ถูกต้อง`);

    let location: ImportLocation | null = null;
    if (!r.locationName) err("locationName", "กรุณาระบุสถานที่");
    else {
      location = byName.get(r.locationName) ?? null;
      if (!location) err("locationName", `ไม่พบสถานที่ "${r.locationName}"`);
      // งานวิ่งดูโรงงาน — ให้ตรงกับ modal ที่เลือกได้เฉพาะโรงงาน
      else if (kind === "run" && location.type !== "factory")
        err("locationName", `"${r.locationName}" ไม่ใช่สถานที่ประเภทโรงงาน (งานวิ่งต้องเป็นโรงงาน)`);
    }

    const parseLaem = (field: "pickupLaemChabang" | "returnLaemChabang", label: string) => {
      const value = laemText(r[field]);
      const checked = LAEM_TRUE.includes(value);
      if (!checked && !LAEM_FALSE.includes(value))
        err(field, `${label} "${r[field]}" ไม่ถูกต้อง (ใช้ Y หรือเว้นว่าง)`);
      else if (checked && kind === "towing") err(field, `งานทอยไม่ต้องระบุ${label}`);
      return checked;
    };
    const pickupLaemChabang = parseLaem("pickupLaemChabang", "รับแหลมฉบัง");
    const returnLaemChabang = parseLaem("returnLaemChabang", "คืนแหลมฉบัง");

    const parsedLiters = parseFuelLiters(r.liters);
    if ("error" in parsedLiters) err("liters", parsedLiters.error);
    const liters = "liters" in parsedLiters ? parsedLiters.liters : 0;

    const dups = rowsByKey.get(keyOf(r)) ?? [];
    if (dups.length > 1 && dups[0] !== rowNum) err("kind", `ข้อมูลซ้ำในไฟล์ (แถว ${dups.join(", ")})`);

    // ตำแหน่ง error ให้เรียง field ตามคอลัมน์ในไฟล์
    const order = ["kind", "size", "locationName", "pickupLaemChabang", "returnLaemChabang", "liters"];
    rowErrors.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
    errors.push(...rowErrors);

    if (rowErrors.length === 0 && kind && location) {
      resolved.push({ kind, size: r.size!, locationId: location.id, pickupLaemChabang, returnLaemChabang, liters });
    }
  });

  return { errors, resolved };
}
