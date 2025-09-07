import * as XLSX from "xlsx";
import dayjs from "dayjs";

// Column mapping from Excel to form fields
const EXCEL_TO_FORM_MAPPING = {
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
  "Cutoff Date": "cutoffDate",
  "Cutoff Time": "cutoffDate", // Both map to the same field for combination
  เวลาเข้าโรงงาน: "factoryTime",
  ช่องจอดตู้: "loadingSlot",
  "พขร.": "driverName",
  ทะเบียนรถ: "vehicleRegistration",
  โทร: "phoneNumber",
};

// Alternative column names (for fuzzy matching)
const ALTERNATIVE_COLUMN_NAMES = {
  "Cutoff Date": ["cutoff date", "cut off date", "cutoffdate", "cut-off date"],
  "Cutoff Time": ["cutoff time", "cut off time", "cutofftime", "cut-off time"],
};

/**
 * Find the actual column name in Excel headers
 * @param {string} expectedColumn - Expected column name
 * @param {Array} headers - Actual headers from Excel
 * @returns {string|null} Actual column name or null if not found
 */
const findActualColumnName = (expectedColumn, headers) => {
  // Exact match first
  if (headers.includes(expectedColumn)) {
    return expectedColumn;
  }

  // Try alternative names
  const alternatives = ALTERNATIVE_COLUMN_NAMES[expectedColumn] || [];
  for (const alt of alternatives) {
    const found = headers.find(
      (header) => header && header.toLowerCase().trim() === alt.toLowerCase()
    );
    if (found) {
      return found;
    }
  }

  // Try fuzzy matching (contains)
  const fuzzyMatch = headers.find(
    (header) =>
      (header &&
        expectedColumn.toLowerCase().includes(header.toLowerCase().trim())) ||
      header.toLowerCase().includes(expectedColumn.toLowerCase())
  );

  return fuzzyMatch || null;
};

/**
 * Read and parse Excel file
 * @param {File} file - Excel file
 * @returns {Promise<Array>} Array of parsed data
 */
export const readExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        // Get the first worksheet
        const worksheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[worksheetName];

        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1, // Use first row as header
          defval: "", // Default value for empty cells
        });

        if (jsonData.length < 2) {
          reject(
            new Error(
              "Excel file must contain at least header row and one data row"
            )
          );
          return;
        }

        // Parse the data
        const headers = jsonData[0];
        const rows = jsonData.slice(1);

        const parsedData = rows
          .map((row, index) => {
            const rowData = {};
            headers.forEach((header, colIndex) => {
              if (header && row[colIndex] !== undefined) {
                rowData[header] = row[colIndex];
              }
            });
            return { originalRowIndex: index + 2, data: rowData }; // +2 because Excel is 1-indexed and we skip header
          })
          .filter((item) => {
            // Only include rows that have a "วันที่" value
            const dateValue = item.data["วันที่"];
            return (
              dateValue !== undefined && dateValue !== "" && dateValue !== null
            );
          })
          .map((item, filteredIndex) => ({
            ...item,
            rowIndex: filteredIndex + 1 // Sequential index after filtering
          }));

        resolve(parsedData);
      } catch (error) {
        reject(new Error(`Error parsing Excel file: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error("Error reading file"));
    };

    reader.readAsArrayBuffer(file);
  });
};

/**
 * Convert Excel data to form data format
 * @param {Array} excelData - Parsed Excel data
 * @returns {Array} Array of form data objects
 */
export const convertExcelToFormData = (excelData) => {
  const timestamp = Date.now(); // Unique timestamp for this import session
  
  return excelData
    .map((item, formIndex) => {
      const formData = {};
      const excelRow = item.data;

      // Double-check that this row has a date value (should already be filtered)
      if (!excelRow["วันที่"] || excelRow["วันที่"] === "") {
        return null;
      }

      // Map each Excel column to form field
      Object.entries(EXCEL_TO_FORM_MAPPING).forEach(
        ([excelColumn, formField]) => {
          const value = excelRow[excelColumn];
          if (value !== undefined && value !== "") {
            // Special handling for date field
            if (formField === "date") {
              formData[formField] = parseDateFromExcel(value);
            }
            // Skip individual cutoff date/time mapping - will be handled below
            else if (
              excelColumn === "Cutoff Date" ||
              excelColumn === "Cutoff Time"
            ) {
              // Skip individual mapping
            } else {
              formData[formField] = String(value).trim();
            }
          }
        }
      );

      // Handle special case for CLOSING TIME (combine Cutoff Date + Cutoff Time)
      const cutoffDateColumn = findActualColumnName(
        "Cutoff Date",
        Object.keys(excelRow)
      );
      const cutoffTimeColumn = findActualColumnName(
        "Cutoff Time",
        Object.keys(excelRow)
      );

      if (excelRow[cutoffDateColumn] || excelRow[cutoffTimeColumn]) {
        formData.closingTime = combineDateTimeFromExcel(
          excelRow[cutoffDateColumn],
          excelRow[cutoffTimeColumn]
        );
      }

      // Add row identification with unique key
      formData._excelRowIndex = item.rowIndex;
      formData._originalData = excelRow;
      formData._uniqueKey = `${timestamp}-${formIndex + 1}`; // Unique key for React

      // Generate meaningful title
      formData._generatedTitle = generateFormTitle(formIndex + 1);

      return formData;
    })
    .filter(Boolean); // Remove null values from skipped rows
};

/**
 * Generate form title using index only
 * @param {number} rowIndex - Excel row index
 * @returns {string} Generated title
 */
const generateFormTitle = (rowIndex) => {
  return `Document #${rowIndex}`;
};

/**
 * Parse date from Excel into a Date object
 * @param {string|number} dateValue - Date value from Excel
 * @returns {Date|null} Parsed Date object or null
 */
const parseDateFromExcel = (dateValue) => {
  try {
    if (!dateValue) return null;

    // Handle Excel serial date number
    if (typeof dateValue === "number") {
      // Excel serial date: days since December 30, 1899
      // Use dayjs for more reliable date calculation
      const excelEpoch = dayjs("1899-12-30");
      const result = excelEpoch.add(dateValue, "day").toDate();
      return result;
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

/**
 * Combine date and time from Excel into a single Date object
 * @param {string|number} dateValue - Date value from Excel
 * @param {string|number} timeValue - Time value from Excel
 * @returns {Date|null} Combined Date object or null
 */
const combineDateTimeFromExcel = (dateValue, timeValue) => {
  try {
    let combinedDateTime = null;

    // Handle different date formats
    if (dateValue) {
      // Try to parse as Excel serial date first
      if (typeof dateValue === "number") {
        // Use dayjs for consistent date calculation
        const excelEpoch = dayjs("1899-12-30");
        combinedDateTime = excelEpoch.add(dateValue, "day").toDate();
      } else {
        // Try to parse as string date
        combinedDateTime = dayjs(dateValue).toDate();
      }
    }

    // Handle time
    if (timeValue && combinedDateTime) {
      if (typeof timeValue === "number" && timeValue < 1) {
        // Excel time as fraction of day
        const hours = Math.floor(timeValue * 24);
        const minutes = Math.floor((timeValue * 24 * 60) % 60);
        combinedDateTime.setHours(hours, minutes, 0, 0);
      } else if (typeof timeValue === "number" && timeValue >= 1) {
        // Handle time as decimal number (e.g., 23.59)
        const hours = Math.floor(timeValue);
        const minutes = Math.round((timeValue - hours) * 100); // .59 becomes 59 minutes
        combinedDateTime.setHours(hours, minutes, 0, 0);
      } else if (typeof timeValue === "string") {
        // Parse time string (e.g., "14:30", "2:30 PM", "23.59")

        // Handle decimal format (e.g., "23.59")
        const decimalMatch = timeValue.match(/^(\d{1,2})\.(\d{1,2})$/);
        if (decimalMatch) {
          const hours = parseInt(decimalMatch[1]);
          const minutes = parseInt(decimalMatch[2]);
          combinedDateTime.setHours(hours, minutes, 0, 0);
        }
        // Handle colon format (e.g., "14:30", "2:30 PM")
        else {
          const timeMatch = timeValue.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);

            // Handle AM/PM
            if (timeValue.toLowerCase().includes("pm") && hours !== 12) {
              hours += 12;
            } else if (timeValue.toLowerCase().includes("am") && hours === 12) {
              hours = 0;
            }

            combinedDateTime.setHours(hours, minutes, 0, 0);
          }
        }
      }
    }

    return combinedDateTime;
  } catch (error) {
    return null;
  }
};

/**
 * Validate Excel file format
 * @param {File} file - File to validate
 * @returns {boolean} True if valid Excel file
 */
export const validateExcelFile = (file) => {
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

/**
 * Get expected Excel columns for user reference
 * @returns {Array} Array of expected column names
 */
export const getExpectedExcelColumns = () => {
  return Object.keys(EXCEL_TO_FORM_MAPPING);
};

/**
 * Check if Excel data has required columns
 * @param {Array} headers - Excel headers
 * @returns {Object} Validation result with missing columns
 */
export const validateExcelColumns = (headers) => {
  const expectedColumns = getExpectedExcelColumns();
  const missingColumns = expectedColumns.filter(
    (col) => !headers.includes(col)
  );
  const extraColumns = headers.filter((col) => !expectedColumns.includes(col));

  return {
    isValid: missingColumns.length === 0,
    missingColumns,
    extraColumns,
    foundColumns: headers.filter((col) => expectedColumns.includes(col)),
  };
};
