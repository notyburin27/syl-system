import pdfTemplate from "../templates/pdfTemplate.html?raw";
import {
  formatDateToBuddhistEra,
  formatClosingTimeToBuddhistEra,
} from "./pdfUtils";

// Template renderer utility
export const renderTemplate = (template, data) => {
  let renderedTemplate = template;

  // Format dates
  const formattedDate = formatDateToBuddhistEra(data.date);
  const formattedClosingTime = formatClosingTimeToBuddhistEra(data.closingTime);

  // Create replacement map
  const replacements = {
    "{{date}}": formattedDate,
    "{{customerName}}": data.customerName || "",
    "{{booking}}": data.booking || "",
    "{{agent}}": data.agent || "",
    "{{shipName}}": data.shipName || "",
    "{{invoice}}": data.invoice || "",
    "{{containerSize}}": data.containerSize || "",
    "{{containerNumber}}": data.containerNumber || "",
    "{{sealNumber}}": data.sealNumber || "",
    "{{shipping}}": data.shipping || "",
    "{{pickupLocation}}": data.pickupLocation || "",
    "{{returnLocation}}": data.returnLocation || "",
    "{{closingTime}}": formattedClosingTime,
    "{{factoryTime}}": data.factoryTime || "",
    "{{loadingSlot}}": data.loadingSlot || "",
    "{{driverName}}": data.driverName || "",
    "{{vehicleRegistration}}": data.vehicleRegistration || "",
    "{{phoneNumber}}": data.phoneNumber || "",
    "{{remarks}}": data.remarks || "",
  };

  // Apply all replacements
  Object.entries(replacements).forEach(([placeholder, value]) => {
    renderedTemplate = renderedTemplate.replace(
      new RegExp(placeholder, "g"),
      value
    );
  });

  return renderedTemplate;
};

// Get PDF template
export const getPDFTemplate = () => {
  return pdfTemplate;
};

// Preview template with sample data
export const previewTemplate = () => {
  const sampleData = {
    date: new Date(),
    customerName: "ตัวอย่างชื่อลูกค้า",
    booking: "BK123456",
    agent: "ตัวอย่างเอเย่นต์",
    shipName: "ตัวอย่างชื่อเรือ",
    invoice: "INV123456",
    containerSize: "40FT",
    containerNumber: "CONT123456",
    sealNumber: "SEAL123456",
    shipping: "ตัวอย่างชิปปิ้ง",
    pickupLocation: "ตัวอย่างสถานที่รับตู้",
    returnLocation: "ตัวอย่างสถานที่คืนตู้",
    closingTime: new Date(),
    factoryTime: "08:00 น.",
    loadingSlot: "A1",
    driverName: "ตัวอย่างชื่อพขร.",
    vehicleRegistration: "1กก-1234",
    phoneNumber: "081-234-5678",
    remarks: "ตัวอย่างหมายเหตุ",
  };

  return renderTemplate(pdfTemplate, sampleData);
};
