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

        // Trim all keys to handle headers with trailing/leading spaces
        const trimmedRows = jsonRows.map((row) => {
          const trimmed: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            trimmed[key.trim()] = row[key];
          }
          return trimmed;
        });

        const mapped = trimmedRows
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
  rows: WorkOrderRow[],
  onProgress?: (current: number, total: number) => void
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

    const h2p = (await getHtml2Pdf()) as any;
    const filename = `ใบงาน ${dayjs().format("YYYY-MM-DD")}.pdf`;

    // Wrap each page body with a fixed A4-width container so html2canvas
    // produces a canvas with consistent A4 aspect ratio
    const A4_WIDTH_MM = 210;
    const A4_HEIGHT_MM = 297;
    const PX_PER_MM = 96 / 25.4; // CSS px
    const A4_WIDTH_PX = Math.round(A4_WIDTH_MM * PX_PER_MM); // ≈ 794
    const A4_HEIGHT_PX = Math.round(A4_HEIGHT_MM * PX_PER_MM); // ≈ 1123

    const makePageHtml = (row: WorkOrderRow) =>
      `<!DOCTYPE html><html><head>${headContent}<style>
        html,body{margin:0;padding:0;}
        .__a4_page{width:${A4_WIDTH_PX}px;min-height:${A4_HEIGHT_PX}px;box-sizing:border-box;background:white;}
      </style></head><body><div class="__a4_page">${fillTemplate(bodyTemplate, row)}</div></body></html>`;

    const canvasOptions = {
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        allowTaint: true,
        logging: false,
        windowWidth: A4_WIDTH_PX,
        windowHeight: A4_HEIGHT_PX,
      },
    };

    // Step 1: render every row to a canvas (consistent, same pipeline)
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < rows.length; i++) {
      onProgress?.(i + 1, rows.length);
      const canvas: HTMLCanvasElement = await h2p()
        .set(canvasOptions)
        .from(makePageHtml(rows[i]))
        .toCanvas()
        .get("canvas");
      canvases.push(canvas);
      await new Promise((r) => setTimeout(r, 60));
    }

    // Step 2: build A4 PDF, fit each canvas to A4 page keeping aspect ratio
    const seedDoc: any = await h2p()
      .set({ jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } })
      .from("<html><body></body></html>")
      .toPdf()
      .get("pdf");

    seedDoc.deletePage(1);

    const pageW = A4_WIDTH_MM;
    const pageH = A4_HEIGHT_MM;

    for (let i = 0; i < canvases.length; i++) {
      const c = canvases[i];
      const imgData = c.toDataURL("image/jpeg", 0.95);

      // Fit canvas to A4 page width, keep aspect ratio
      const canvasAspect = c.width / c.height;
      let drawW = pageW;
      let drawH = pageW / canvasAspect;
      if (drawH > pageH) {
        drawH = pageH;
        drawW = pageH * canvasAspect;
      }

      seedDoc.addPage("a4", "portrait");
      seedDoc.addImage(imgData, "JPEG", 0, 0, drawW, drawH);
    }

    seedDoc.save(filename);
    return { success: true, filename };
  } catch (err: any) {
    console.error("Work order PDF generation error:", err);
    return { success: false, error: err.message };
  }
};
