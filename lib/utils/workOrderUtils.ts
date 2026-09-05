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
  orderNumber: string;
  jobNumber: string;
  orderJobCombined: string;
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
  const trimmedKeys = Object.keys(row);
  for (const name of candidates) {
    const found = trimmedKeys.find((k) => k.trim() === name.trim());
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
  const orderNumber = toStr(pickField(row, ["ORDER", "Order", "order"]));
  const jobNumber = toStr(
    pickField(row, ["เลขใบงานคนรถ", "เลขที่ใบงาน", "เลขที่", "Job No.", "Job No", "เลขงาน"])
  );
  const customerName = toStr(
    pickField(row, ["ชื่อผู้ว่าจ้าง", "ชื่อลูกค้า"])
  );
  const booking = toStr(pickField(row, ["Booking No.", "Booking", "บุ๊คกิ้ง"]));
  const agent = toStr(pickField(row, ["เอเย่น", "เอเย่นต์"]));
  const containerSize = toStr(pickField(row, ["ขนาดตู้"]));

  const pickupDate = formatExcelDate(pickField(row, ["วันที่รับตู้"]));
  const pickupLocation = toStr(pickField(row, ["สถานที่รับตู้"]));

  const factoryDate = formatExcelDate(pickField(row, ["วันที่เข้าโรงงาน"]));
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

  const orderJobCombined = [orderNumber, jobNumber].filter(Boolean).join(" / ");

  return {
    date,
    orderNumber,
    jobNumber,
    orderJobCombined,
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

export const validateWorkOrderExcelFile = (file: File): boolean => {
  const validExt = [".xls", ".xlsx"];
  const name = file.name.toLowerCase();
  return validExt.some((ext) => name.endsWith(ext));
};

const PLACEHOLDER_KEYS: (keyof WorkOrderRow)[] = [
  "date",
  "orderJobCombined",
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

const SECTION_TEMPLATE = `
<div class="section">
  <div class="company-header">
    <div class="company-name">บริษัท ทรงยุทธ โลจิสติคส์ จำกัด (สำนักงานใหญ่)</div>
    <div class="company-line">เลขที่ 7 ซอยแฮปปี้เพลซ 15 แขวงคลองสามประเวศ เขตลาดกระบัง กรุงเทพมหานคร 10520</div>
    <div class="company-line">เลขประจำตัวผู้เสียภาษี 0115547009287 &nbsp;&nbsp; โทร. 02-7458109-10</div>
  </div>
  <div class="header-rule"></div>

  <div class="row-split">
    <div class="form-row">
      <div class="field-label">วันที่</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{date}}</div>
    </div>
    <div class="form-row">
      <div class="field-label-right">ORDER / เลขที่ใบงาน</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{orderJobCombined}}</div>
    </div>
  </div>

  <div class="form-row">
    <div class="field-label">ชื่อลูกค้า</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{customerName}}</div>
  </div>

  <div class="row-split">
    <div class="form-row">
      <div class="field-label">บุ๊คกิ้ง</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{booking}}</div>
    </div>
    <div class="form-row">
      <div class="field-label-right">เอเย่นต์</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{agent}}</div>
    </div>
  </div>

  <div class="form-row">
    <div class="field-label">ขนาดตู้</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{containerSize}}</div>
  </div>

  <div class="form-row align-top">
    <div class="field-label">สถานที่รับตู้</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{pickupCombined}}</div>
  </div>

  <div class="form-row align-top">
    <div class="field-label">สถานที่บรรจุ</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{factoryCombined}}</div>
  </div>

  <div class="form-row align-top">
    <div class="field-label">สถานที่คืนตู้</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{returnLocation}}</div>
  </div>

  <div class="form-row">
    <div class="field-label">คืนตู้ก่อนวันที่</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{closingTime}}</div>
  </div>

  <div class="form-row">
    <div class="field-label">ชื่อเรือ</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{shipName}}</div>
  </div>

  <div class="row-split">
    <div class="form-row">
      <div class="field-label">เบอร์ตู้</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{containerNumber1}}</div>
    </div>
    <div class="form-row">
      <div class="field-label-right">เบอร์ซีล</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{sealNumber1}}</div>
    </div>
  </div>

  <div class="row-split">
    <div class="form-row">
      <div class="field-label">เบอร์ตู้</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{containerNumber2}}</div>
    </div>
    <div class="form-row">
      <div class="field-label-right">เบอร์ซีล</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{sealNumber2}}</div>
    </div>
  </div>

  <div class="row-split">
    <div class="form-row">
      <div class="field-label">ชื่อ พขร.</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{driverName}}</div>
    </div>
    <div class="form-row">
      <div class="field-label-right">ทะเบียนรถ</div>
      <div class="field-sep">:</div>
      <div class="field-value">{{vehicleRegistration}}</div>
    </div>
  </div>

  <div class="form-row">
    <div class="field-label">เบอร์โทร</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{phoneNumber}}</div>
  </div>

  <div class="form-row align-top">
    <div class="field-label">หมายเหตุ</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{remarks}}</div>
  </div>

  <div class="form-row align-top">
    <div class="field-label">ชื่อที่อยู่ออกใบเสร็จ</div>
    <div class="field-sep">:</div>
    <div class="field-value">{{billingAddress}}</div>
  </div>
</div>`;

const fillSection = (row: WorkOrderRow): string => {
  let html = SECTION_TEMPLATE;
  for (const key of PLACEHOLDER_KEYS) {
    const value = (row[key] ?? "") as string;
    html = html.replace(new RegExp(`{{${key}}}`, "g"), escapeHtml(value));
  }
  return html;
};

const buildPageHtml = (row: WorkOrderRow): string => {
  const section = fillSection(row);
  return `<div class="a4-page">${section}<hr class="section-divider">${section}</div>`;
};

const PAGE_CSS = `
  * { box-sizing: border-box; }
  html, body {
    font-family: 'Kanit', sans-serif;
    margin: 0; padding: 0;
    line-height: 1.3;
    font-size: 15px;
    color: #000;
    background: white;
  }
  .a4-page {
    width: 210mm;
    height: 297mm;
    padding: 5mm 12mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: white;
  }
  .section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .section-divider {
    border: none;
    border-top: 2px dashed #555;
    margin: 4mm 0;
    flex-shrink: 0;
  }
  .company-header { text-align: center; margin-bottom: 6px; }
  .company-name { font-size: 15px; font-weight: 700; margin-bottom: 1px; }
  .company-line { font-size: 11px; line-height: 1.4; }
  .header-rule { border: none; border-bottom: 1.5px solid #000; margin: 5px 0 8px 0; }
  .form-row {
    display: flex;
    align-items: flex-end;
    margin-bottom: 6px;
    border-bottom: 1px dotted #888;
    padding-bottom: 2px;
    min-height: 20px;
  }
  .form-row.align-top { align-items: flex-start; }
  .field-label { font-weight: 600; color: #1463d8; font-size: 14px; flex-shrink: 0; padding-right: 4px; width: 130px; }
  .field-label-right { font-weight: 600; color: #1463d8; font-size: 14px; flex-shrink: 0; padding-right: 4px; width: 130px; }
  .field-sep { margin: 0 4px; font-weight: 600; color: #1463d8; flex-shrink: 0; }
  .field-value { flex: 1; font-size: 15px; font-weight: 400; min-height: 18px; color: #000; }
  .row-split { display: flex; gap: 10px; margin-bottom: 6px; }
  .row-split > .form-row { flex: 1; margin-bottom: 0; }
`;

const FONT_LINK = `<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600&display=swap" rel="stylesheet">`;

const makeSinglePageHtml = (row: WorkOrderRow): string =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${FONT_LINK}<style>${PAGE_CSS}</style></head><body>${buildPageHtml(row)}</body></html>`;

export const generateWorkOrderPdf = async (
  rows: WorkOrderRow[],
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; filename?: string; error?: string }> => {
  try {
    if (rows.length === 0) {
      return { success: false, error: "ไม่มีข้อมูลสำหรับสร้าง PDF" };
    }

    const h2p = (await getHtml2Pdf()) as any;
    const filename = `ใบงาน ${dayjs().format("YYYY-MM-DD")}.pdf`;

    // A4 dimensions in mm
    const A4_W = 210;
    const A4_H = 297;

    // Render each row to its own canvas at a fixed A4 px size (matches 96dpi: 794x1123, scale 2 → 1588x2246)
    const A4_W_PX = 794;
    const A4_H_PX = 1123;

    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < rows.length; i++) {
      onProgress?.(i + 1, rows.length);

      const canvas: HTMLCanvasElement = await h2p()
        .set({
          html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            allowTaint: true,
            logging: false,
            windowWidth: A4_W_PX,
            windowHeight: A4_H_PX,
            width: A4_W_PX,
            height: A4_H_PX,
          },
        })
        .from(makeSinglePageHtml(rows[i]))
        .toCanvas()
        .get("canvas");

      canvases.push(canvas);
      // small delay so progress paints
      await new Promise((r) => setTimeout(r, 20));
    }

    // Build A4 PDF; add each canvas as a full-page image (fit to A4 exactly)
    const seedDoc: any = await h2p()
      .set({ jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } })
      .from("<html><body></body></html>")
      .toPdf()
      .get("pdf");

    seedDoc.deletePage(1);

    for (let i = 0; i < canvases.length; i++) {
      const c = canvases[i];
      const imgData = c.toDataURL("image/jpeg", 0.95);
      seedDoc.addPage("a4", "portrait");
      // Force full A4 fill — canvas was already rendered at A4 aspect, so no distortion
      seedDoc.addImage(imgData, "JPEG", 0, 0, A4_W, A4_H);
    }

    seedDoc.save(filename);
    return { success: true, filename };
  } catch (err: any) {
    console.error("Work order PDF generation error:", err);
    return { success: false, error: err.message };
  }
};
