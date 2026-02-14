import ExcelJS from "exceljs";
import { Transaction } from "@/types/statement";

// Generate Excel file from parsed transactions
export async function generateStatementExcel(
  transactions: Transaction[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Bank Statement");

  // Define columns
  worksheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Time", key: "time", width: 8 },
    { header: "Code", key: "code", width: 8 },
    { header: "Debit/Credit", key: "debitCredit", width: 15 },
    { header: "Balance/Baht", key: "balance", width: 15 },
    { header: "Description/Note", key: "descriptionNote", width: 50 },
    { header: "Description_Clean", key: "descriptionClean", width: 45 },
    { header: "Name", key: "name", width: 30 },
    { header: "Note", key: "note", width: 20 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  // Add data rows
  for (const txn of transactions) {
    const row = worksheet.addRow({
      date: txn.date,
      time: txn.time,
      code: txn.code,
      debitCredit: txn.debitCredit,
      balance: txn.balance,
      descriptionNote: txn.descriptionNote,
      descriptionClean: txn.descriptionClean,
      name: txn.name,
      note: txn.note,
    });

    // Format number cells
    row.getCell("debitCredit").numFmt = "#,##0.00";
    row.getCell("balance").numFmt = "#,##0.00";

    // Color debit/credit: green for positive, red for negative
    if (txn.debitCredit < 0) {
      row.getCell("debitCredit").font = { color: { argb: "FFFF0000" } };
    } else {
      row.getCell("debitCredit").font = { color: { argb: "FF008000" } };
    }
  }

  // Auto-filter on all columns
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: transactions.length + 1, column: 9 },
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
