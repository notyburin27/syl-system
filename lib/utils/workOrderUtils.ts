import * as XLSX from "xlsx";
import dayjs from "dayjs";
import buddhistEra from "dayjs/plugin/buddhistEra";
import "dayjs/locale/th";

dayjs.extend(buddhistEra);
dayjs.locale("th");

const getHtml2Pdf = async () => {
  if (typeof window === "undefined") {
    throw new Error("html2pdf can only be used in browser environment");
  }
  const html2pdf = (await import("html2pdf.js")).default;
  return html2pdf;
};

export interface WorkOrderRow {
  date: string;
  customerName: string;
  booking: string;
  agent: string;
  containerSize: string;
  pickupDate: string;
  pickupLocation: string;
  pickupCombined: string;
  factoryDate: string;
  factoryLocation: string;
  factoryCombined: string;
  returnDate: string;
  returnLocation: string;
  closingTime: string;
  shipName: string;
  containerNumber1: string;
  sealNumber1: string;
  containerNumber2: string;
  sealNumber2: string;
  driverName: string;
  vehicleRegistration: string;
  phoneNumber: string;
  remarks: string;
  billingAddress: string;
}

const formatExcelDate = (value: any): string => {
  if (value === null || value === undefined || value === "") return "";
  try {
    if (typeof value === "number") {
      const excelEpoch = dayjs("1899-12-30");
      return excelEpoch.add(value, "day").format("DD/MM/BB");
    }
    if (value instanceof Date) {
      return dayjs(value).format("DD/MM/BB");
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "";
      const parsed = dayjs(trimmed);
      if (parsed.isValid()) return parsed.format("DD/MM/BB");
      return trimmed;
    }
    return String(value);
  } catch {
    return String(value);
  }
};

const toStr = (value: any): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const pickField = (row: Record<string, any>, candidates: string[]): any => {
  for (const name of candidates) {
    if (row[name] !== undefined && row[name] !== "") return row[name];
  }
  // try trimmed match
  const trimmedKeys = Object.keys(row);
  for (const name of candidates) {
    const found = trimmedKeys.find(
      (k) => k.trim() === name.trim()
    );
    if (found && row[found] !== undefined && row[found] !== "")
      return row[found];
  }
  return undefined;
};

const joinDateLocation = (datePart: string, locationPart: string): string => {
  const d = datePart.trim();
  const l = locationPart.trim();
  if (d && l) return `${d} - ${l}`;
  return d || l;
};

export const mapExcelRowToWorkOrder = (
  row: Record<string, any>
): WorkOrderRow => {
  const date = formatExcelDate(pickField(row, ["วันที่"]));
  const customerName = toStr(
    pickField(row, ["ชื่อผู้ว่าจ้าง", "ชื่อลูกค้า"])
  );
  const booking = toStr(pickField(row, ["Booking No.", "Booking", "บุ๊คกิ้ง"]));
  const agent = toStr(pickField(row, ["เอเย่น", "เอเย่นต์"]));
  const containerSize = toStr(pickField(row, ["ขนาดตู้"]));

  const pickupDate = formatExcelDate(pickField(row, ["วันที่รับตู้"]));
  const pickupLocation = toStr(pickField(row, ["สถานที่รับตู้"]));

  const factoryDate = formatExcelDate(
    pickField(row, ["วันที่เข้าโรงงาน"])
  );
  const factoryLocation = toStr(
    pickField(row, ["สถานที่โรงงาน", "สถานที่บรรจุ"])
  );

  const returnDate = formatExcelDate(pickField(row, ["วันที่คืนตู้"]));
  const returnLocation = toStr(pickField(row, ["สถานที่คืนตู้"]));

  const closingTime = toStr(
    pickField(row, ["CLOSING TIME", "Closing Time", "closing time"])
  );
  const shipName = toStr(pickField(row, ["ชื่อเรือ"]));

  const containerNumber1 = toStr(
    pickField(row, ["เบอร์ตู้1", "เบอร์ตู้ 1", "เบอร์ตู้"])
  );
  const sealNumber1 = toStr(
    pickField(row, ["เบอร์ซีล1", "เบอร์ซีล 1", "เบอร์ซีล"])
  );
  const containerNumber2 = toStr(pickField(row, ["เบอร์ตู้2", "เบอร์ตู้ 2"]));
  const sealNumber2 = toStr(pickField(row, ["เบอร์ซีล2", "เบอร์ซีล 2"]));

  const driverName = toStr(pickField(row, ["ชื่อ พขร.", "พขร.", "ชื่อ พขร"]));
  const vehicleRegistration = toStr(pickField(row, ["ทะเบียนรถ"]));
  const phoneNumber = toStr(pickField(row, ["โทร", "เบอร์โทร"]));
  const remarks = toStr(pickField(row, ["หมายเหตุ"]));
  const billingAddress = toStr(
    pickField(row, ["ชื่อที่อยู่ออกใบเสร็จ", "ที่อยู่ออกใบเสร็จ"])
  );

  return {
    date,
    customerName,
    booking,
    agent,
    containerSize,
    pickupDate,
    pickupLocation,
    pickupCombined: joinDateLocation(pickupDate, pickupLocation),
    factoryDate,
    factoryLocation,
    factoryCombined: joinDateLocation(factoryDate, factoryLocation),
    returnDate,
    returnLocation,
    closingTime,
    shipName,
    containerNumber1,
    sealNumber1,
    containerNumber2,
    sealNumber2,
    driverName,
    vehicleRegistration,
    phoneNumber,
    remarks,
    billingAddress,
  };
};

export const readWorkOrderExcel = (file: File): Promise<WorkOrderRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
          raw: true,
        }) as Record<string, any>[];

        const mapped = jsonRows
          .map(mapExcelRowToWorkOrder)
          .filter((r) => {
            // ต้องมีอย่างน้อยวันที่ หรือ ชื่อลูกค้า หรือ Booking
            return r.date || r.customerName || r.booking;
          });

        resolve(mapped);
      } catch (err: any) {
        reject(new Error(`Error parsing Excel: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsArrayBuffer(file);
  });
};

export const validateWorkOrderExcelFile = (file: File): boolean => {
  const validExt = [".xls", ".xlsx"];
  const name = file.name.toLowerCase();
  return validExt.some((ext) => name.endsWith(ext));
};

const PLACEHOLDER_KEYS: (keyof WorkOrderRow)[] = [
  "date",
  "customerName",
  "booking",
  "agent",
  "containerSize",
  "pickupCombined",
  "factoryCombined",
  "returnLocation",
  "closingTime",
  "shipName",
  "containerNumber1",
  "sealNumber1",
  "containerNumber2",
  "sealNumber2",
  "driverName",
  "vehicleRegistration",
  "phoneNumber",
  "remarks",
  "billingAddress",
];

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const fillTemplate = (template: string, row: WorkOrderRow): string => {
  let html = template;
  for (const key of PLACEHOLDER_KEYS) {
    const value = (row[key] ?? "") as string;
    html = html.replace(
      new RegExp(`{{${key}}}`, "g"),
      escapeHtml(value)
    );
  }
  return html;
};

export const generateWorkOrderPdf = async (
  rows: WorkOrderRow[]
): Promise<{ success: boolean; filename?: string; error?: string }> => {
  try {
    if (rows.length === 0) {
      return { success: false, error: "ไม่มีข้อมูลสำหรับสร้าง PDF" };
    }

    const res = await fetch("/templates/workOrderTemplate.html");
    const template = await res.text();

    const headMatch = template.match(/<head[^>]*>([\s\S]*?)<\/head>/);
    const headContent = headMatch ? headMatch[1] : "";

    const bodyMatch = template.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    const bodyTemplate = bodyMatch ? bodyMatch[1] : template;

    let combinedBody = "";
    for (let i = 0; i < rows.length; i++) {
      const filled = fillTemplate(bodyTemplate, rows[i]);
      combinedBody += filled;
      if (i < rows.length - 1) {
        combinedBody += '<div style="page-break-after: always;"></div>';
      }
    }

    const fullHtml = `<!DOCTYPE html><html><head>${headContent}</head><body>${combinedBody}</body></html>`;

    const filename = `ใบงาน ${dayjs().format("YYYY-MM-DD")}.pdf`;

    const options = {
      margin: 0.4,
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 1.6,
        useCORS: true,
        letterRendering: true,
        allowTaint: true,
      },
      jsPDF: {
        unit: "in",
        format: "a4",
        orientation: "portrait",
      },
      pagebreak: { mode: ["css", "legacy"] },
    };

    const html2pdf = await getHtml2Pdf();
    await html2pdf().set(options).from(fullHtml).save();

    return { success: true, filename };
  } catch (err: any) {
    console.error("Work order PDF generation error:", err);
    return { success: false, error: err.message };
  }
};
