import html2pdf from "html2pdf.js";
import pdfTemplate from "../templates/pdfTemplate.html?raw";

// Convert date to Buddhist Era format
export const formatDateToBuddhistEra = (date) => {
  if (!date) return "";

  const jsDate = new Date(date);
  const day = jsDate.getDate();
  const month = jsDate.getMonth() + 1;
  const year = jsDate.getFullYear() + 543; // Convert to Buddhist Era

  return `${day}/${month}/${year.toString().slice(-2)}`;
};

// Format closing time to Buddhist Era with time
export const formatClosingTimeToBuddhistEra = (datetime) => {
  if (!datetime) return "";

  const jsDate = new Date(datetime);
  const day = jsDate.getDate();
  const month = jsDate.getMonth() + 1;
  const year = jsDate.getFullYear() + 543; // Convert to Buddhist Era
  const hours = jsDate.getHours().toString().padStart(2, "0");
  const minutes = jsDate.getMinutes().toString().padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// Replace template placeholders with actual data
export const generatePDFFromTemplate = (formData) => {
  let htmlTemplate = pdfTemplate;

  // Format dates with Buddhist Era
  const formattedDate = formatDateToBuddhistEra(formData.date);
  const formattedClosingTime = formatClosingTimeToBuddhistEra(
    formData.closingTime
  );

  // Replace all placeholders
  const replacements = {
    "{{date}}": formattedDate,
    "{{customerName}}": formData.customerName || "",
    "{{booking}}": formData.booking || "",
    "{{agent}}": formData.agent || "",
    "{{shipName}}": formData.shipName || "",
    "{{invoice}}": formData.invoice || "",
    "{{containerSize}}": formData.containerSize || "",
    "{{containerNumber}}": formData.containerNumber || "",
    "{{sealNumber}}": formData.sealNumber || "",
    "{{shipping}}": formData.shipping || "",
    "{{pickupLocation}}": formData.pickupLocation || "",
    "{{returnLocation}}": formData.returnLocation || "",
    "{{closingTime}}": formattedClosingTime,
    "{{factoryTime}}": formData.factoryTime || "",
    "{{loadingSlot}}": formData.loadingSlot || "",
    "{{driverName}}": formData.driverName || "",
    "{{vehicleRegistration}}": formData.vehicleRegistration || "",
    "{{phoneNumber}}": formData.phoneNumber || "",
    "{{remarks}}": formData.remarks || "",
  };

  // Replace all placeholders in the template
  Object.entries(replacements).forEach(([placeholder, value]) => {
    htmlTemplate = htmlTemplate.replace(new RegExp(placeholder, "g"), value);
  });

  return htmlTemplate;
};

// Generate PDF from form data
export const generateSinglePDF = async (formData, formTitle) => {
  try {
    const htmlContent = generatePDFFromTemplate(formData);

    // Create filename with current date
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");
    const filename = `${formTitle.replace(/\s+/g, "_")}_${dateStr}.pdf`;

    const options = {
      margin: 0.5,
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
      },
      jsPDF: {
        unit: "in",
        format: "a4",
        orientation: "portrait",
      },
    };

    // Generate and download PDF
    await html2pdf().set(options).from(htmlContent).save();

    return { success: true, filename };
  } catch (error) {
    console.error("PDF generation error:", error);
    return { success: false, error: error.message };
  }
};

// Generate multiple PDFs
export const generateMultiplePDFs = async (forms, onProgress) => {
  const results = [];

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];

    // Update progress
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: forms.length,
        formTitle: form.title,
        status: "processing",
      });
    }

    try {
      const result = await generateSinglePDF(form.data, form.title);
      results.push({
        formId: form.id,
        formTitle: form.title,
        ...result,
      });

      // Small delay to prevent browser freezing
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      results.push({
        formId: form.id,
        formTitle: form.title,
        success: false,
        error: error.message,
      });
    }
  }

  // Final progress update
  if (onProgress) {
    onProgress({
      current: forms.length,
      total: forms.length,
      status: "completed",
    });
  }

  return results;
};

// Validate form data before PDF generation
export const validateFormForPDF = (formData) => {
  const requiredFields = [];

  const missingFields = requiredFields.filter(
    (field) => !formData[field.key] || formData[field.key] === ""
  );

  return {
    isValid: missingFields.length === 0,
    missingFields: missingFields.map((field) => field.label),
  };
};
