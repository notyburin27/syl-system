import { SIZE_OPTIONS } from "@/types/job";

export interface FuelStandardImportRow {
  size?: string;
  pickupLocationName?: string;
  factoryLocationName?: string;
  returnLocationName?: string;
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
  size: string;
  pickupLocationId: string;
  factoryLocationId: string | null;
  returnLocationId: string;
  liters: number;
}

/** Decimal(10,2) */
export const MAX_FUEL_LITERS = 99999999.99;

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

  const keyOf = (r: FuelStandardImportRow) =>
    [r.size ?? "", r.pickupLocationName ?? "", r.factoryLocationName ?? "", r.returnLocationName ?? ""].join("|");
  const rowsByKey = new Map<string, number[]>();
  rows.forEach((r, i) => rowsByKey.set(keyOf(r), [...(rowsByKey.get(keyOf(r)) ?? []), i + 1]));

  rows.forEach((r, index) => {
    const rowNum = index + 1;
    const rowErrors: ImportValidationError[] = [];
    const err = (field: string, message: string) => rowErrors.push({ row: rowNum, field, message });

    if (!r.size) err("size", "กรุณาระบุ SIZE");
    else if (!(SIZE_OPTIONS as readonly string[]).includes(r.size)) err("size", `SIZE "${r.size}" ไม่ถูกต้อง`);

    const findLocation = (field: string, name: string | undefined, label: string) => {
      if (!name) {
        err(field, `กรุณาระบุ${label}`);
        return null;
      }
      const loc = byName.get(name);
      if (!loc) err(field, `ไม่พบสถานที่ "${name}"`);
      return loc ?? null;
    };
    const pickup = findLocation("pickupLocationName", r.pickupLocationName, "สถานที่รับตู้");
    const ret = findLocation("returnLocationName", r.returnLocationName, "สถานที่คืนตู้");

    let factory: ImportLocation | null = null;
    if (r.factoryLocationName) {
      factory = byName.get(r.factoryLocationName) ?? null;
      if (!factory) err("factoryLocationName", `ไม่พบสถานที่ "${r.factoryLocationName}"`);
      else if (factory.type !== "factory")
        err("factoryLocationName", `"${r.factoryLocationName}" ไม่ใช่สถานที่ประเภทโรงงาน`);
    }

    const parsedLiters = parseFuelLiters(r.liters);
    if ("error" in parsedLiters) err("liters", parsedLiters.error);
    const liters = "liters" in parsedLiters ? parsedLiters.liters : 0;

    const dups = rowsByKey.get(keyOf(r)) ?? [];
    if (dups.length > 1 && dups[0] !== rowNum) err("size", `ข้อมูลซ้ำในไฟล์ (แถว ${dups.join(", ")})`);

    // ตำแหน่ง error ให้เรียง field ตามคอลัมน์ในไฟล์ (size, รับตู้, โรงงาน, คืนตู้, ลิตร)
    const order = ["size", "pickupLocationName", "factoryLocationName", "returnLocationName", "liters"];
    rowErrors.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
    errors.push(...rowErrors);

    if (rowErrors.length === 0 && pickup && ret) {
      resolved.push({
        size: r.size!,
        pickupLocationId: pickup.id,
        factoryLocationId: factory?.id ?? null,
        returnLocationId: ret.id,
        liters,
      });
    }
  });

  return { errors, resolved };
}
