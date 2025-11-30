import * as XLSX from "xlsx";
import dayjs from "dayjs";
import { TransportFormData } from "@/types/document";

// Column mapping from Excel to form fields
const EXCEL_TO_FORM_MAPPING: Record<string, keyof TransportFormData> = {
  วันที่: "date",
  ชื่อลูกค้า: "customerName",
  "Booking No.": "booking",
  เอเย่น: "agent",
  ชื่อเรือ: "shipName",
  "Invoice NO.": "invoice",
  ขนาดตู้: "containerSize",
  "CONT. NO.": "containerNumber",
  "SEAL NO.": "sealNumber",
  "บริษัท Shipping": "shipping",
  รับตู้: "pickupLocation",
  คืนตู้: "returnLocation",
  เวลาเข้าโรงงาน: "factoryTime",
  ช่องจอดตู้: "loadingSlot",
  "พขร.": "driverName",
  ทะเบียนรถ: "vehicleRegistration",
  โทร: "phoneNumber",
};

// Parse date from Excel
const parseDateFromExcel = (dateValue: any): Date | null => {
  try {
    if (!dateValue) return null;

    // Handle Excel serial date number
    if (typeof dateValue === "number") {
      const excelEpoch = dayjs("1899-12-30");
      return excelEpoch.add(dateValue, "day").toDate();
    }

    // Handle string date
    if (typeof dateValue === "string") {
      const parsedDate = dayjs(dateValue);
      return parsedDate.isValid() ? parsedDate.toDate() : null;
    }

    return null;
  } catch (error) {
    return null;
  }
};

// Combine date and time from Excel
const combineDateTimeFromExcel = (
  dateValue: any,
  timeValue: any
): Date | null => {
  try {
    let combinedDateTime: Date | null = null;

    if (dateValue) {
      if (typeof dateValue === "number") {
        const excelEpoch = dayjs("1899-12-30");
        combinedDateTime = excelEpoch.add(dateValue, "day").toDate();
      } else {
        combinedDateTime = dayjs(dateValue).toDate();
      }
    }

    if (timeValue && combinedDateTime) {
      if (typeof timeValue === "number") {
        // Check if it's a fraction (Excel time format) or a whole number (hour)
        if (timeValue < 1) {
          // Excel time is stored as fraction of day (0.5 = 12:00)
          const hours = Math.floor(timeValue * 24);
          const minutes = Math.floor((timeValue * 24 * 60) % 60);
          combinedDateTime.setHours(hours, minutes, 0, 0);
        } else {
          // Whole number represents hours directly (e.g., 16 = 16:00)
          const hours = Math.floor(timeValue);
          const minutes = Math.floor((timeValue % 1) * 60);
          combinedDateTime.setHours(hours, minutes, 0, 0);
        }
      } else if (typeof timeValue === "string") {
        // Support both : and . as time separator (e.g., "09:30" or "09.30")
        const timeMatch = timeValue.match(/(\d{1,2})[:.](\d{2})/);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          if (timeValue.toLowerCase().includes("pm") && hours !== 12) {
            hours += 12;
          }
          combinedDateTime.setHours(hours, minutes, 0, 0);
        }
      }
    }

    return combinedDateTime;
  } catch (error) {
    console.error('Error in combineDateTimeFromExcel:', error);
    return null;
  }
};

// Read and parse Excel file
export const readExcelFile = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        const worksheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[worksheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        }) as any[][];

        if (jsonData.length < 2) {
          reject(
            new Error(
              "Excel file must contain at least header row and one data row"
            )
          );
          return;
        }

        const headers = jsonData[0];
        const rows = jsonData.slice(1);

        const parsedData = rows
          .map((row, index) => {
            const rowData: any = {};
            headers.forEach((header: any, colIndex: number) => {
              if (header && row[colIndex] !== undefined) {
                rowData[header] = row[colIndex];
              }
            });
            return { originalRowIndex: index + 2, data: rowData };
          })
          .filter((item) => {
            const dateValue = item.data["วันที่"];
            return (
              dateValue !== undefined && dateValue !== "" && dateValue !== null
            );
          })
          .map((item, filteredIndex) => ({
            ...item,
            rowIndex: filteredIndex + 1,
          }));

        resolve(parsedData);
      } catch (error: any) {
        reject(new Error(`Error parsing Excel file: ${error.message}`));
      }
    };

    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsArrayBuffer(file);
  });
};

// Convert Excel data to form data format
export const convertExcelToFormData = (
  excelData: any[]
): Array<Partial<TransportFormData> & { _generatedTitle: string }> => {
  return excelData
    .map((item, formIndex) => {
      const formData: any = {};
      const excelRow = item.data;

      if (!excelRow["วันที่"] || excelRow["วันที่"] === "") {
        return null;
      }

      Object.entries(EXCEL_TO_FORM_MAPPING).forEach(
        ([excelColumn, formField]) => {
          const value = excelRow[excelColumn];
          if (value !== undefined && value !== "") {
            if (formField === "date") {
              formData[formField] = parseDateFromExcel(value);
            } else {
              formData[formField] = String(value).trim();
            }
          }
        }
      );

      // Handle closing time - support multiple column name formats
      // Find columns with trimmed names to handle spaces
      const findColumnValue = (possibleNames: string[]) => {
        for (const name of possibleNames) {
          // Try exact match first
          if (excelRow[name] !== undefined) return excelRow[name];

          // Try trimmed match
          const trimmedKey = Object.keys(excelRow).find(
            (key) => key.trim() === name || key.trim() === name.trim()
          );
          if (trimmedKey && excelRow[trimmedKey] !== undefined) {
            return excelRow[trimmedKey];
          }
        }
        return null;
      };

      const closingDate = findColumnValue(["Cutoff Date"]);
      const closingTime = findColumnValue(["Cutoff Time"]);

      if (closingDate || closingTime) {
        formData.closingTime = combineDateTimeFromExcel(
          closingDate,
          closingTime
        );
      }

      formData._generatedTitle = `เอกสารขนส่ง #${formIndex + 1}`;

      return formData;
    })
    .filter(Boolean) as Array<
    Partial<TransportFormData> & { _generatedTitle: string }
  >;
};

// Validate Excel file
export const validateExcelFile = (file: File): boolean => {
  const validTypes = [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  const validExtensions = [".xls", ".xlsx"];
  const fileExtension = file.name
    .toLowerCase()
    .substring(file.name.lastIndexOf("."));

  return (
    validTypes.includes(file.type) || validExtensions.includes(fileExtension)
  );
};

// Get expected Excel columns
export const getExpectedExcelColumns = (): string[] => {
  return Object.keys(EXCEL_TO_FORM_MAPPING);
};

// Validate Excel columns
export const validateExcelColumns = (headers: string[]) => {
  const expectedColumns = getExpectedExcelColumns();
  const foundColumns = headers.filter((header) =>
    expectedColumns.includes(header)
  );
  const missingColumns = expectedColumns.filter(
    (col) => !headers.includes(col)
  );
  const extraColumns = headers.filter(
    (header) => !expectedColumns.includes(header)
  );

  return {
    isValid: missingColumns.length === 0,
    foundColumns,
    missingColumns,
    extraColumns,
  };
};
