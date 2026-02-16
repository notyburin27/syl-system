import { PDFParse } from "pdf-parse";
import { Transaction, ParseResult } from "@/types/statement";

export type BankType = "SCB" | "KBANK";

// Parse comma-formatted number string to number (e.g., "10,000.00" -> 10000.00)
function parseNumber(str: string): number {
  return parseFloat(str.replace(/,/g, ""));
}

// Extract person or company name from description
function extractName(description: string): string {
  // Match person names with Thai/English titles
  const namePattern =
    /(นาย|นาง(?!สาว)|นางสาว|น\.ส\.|MR\.?|MS\.?|MRS\.?)\s+(.+)/i;
  const match = description.match(namePattern);
  if (match) {
    const title = match[1];
    const restOfName = match[2].trim();

    const nameEndPattern = restOfName.match(
      /^([ก-๙a-zA-Z\s.]+?)(?:\s*$|\s*(?:NOTE|DESC))/
    );
    if (nameEndPattern) {
      return `${title} ${nameEndPattern[1].trim()}`;
    }

    return `${title} ${restOfName}`;
  }

  // Match company names (บจก., บริษัท, หจก., etc.)
  const companyPattern =
    /(บจก\.|บริษัท|หจก\.|ห้างหุ้นส่วน|สหกรณ์|มูลนิธิ)\s+(.+)/i;
  const companyMatch = description.match(companyPattern);
  if (companyMatch) {
    const prefix = companyMatch[1];
    const companyName = companyMatch[2].trim();
    return `${prefix} ${companyName}`;
  }

  return "";
}

// Extract text from PDF buffer
async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  const result = await parser.getText();
  return result.pages.map((p) => p.text).join("\n");
}

// Calculate summary from transactions
function calculateSummary(transactions: Transaction[]): ParseResult {
  const totalCredit = transactions
    .filter((t) => t.debitCredit > 0)
    .reduce((sum, t) => sum + t.debitCredit, 0);

  const totalDebit = transactions
    .filter((t) => t.debitCredit < 0)
    .reduce((sum, t) => sum + t.debitCredit, 0);

  const finalBalance =
    transactions.length > 0
      ? transactions[transactions.length - 1].balance
      : 0;

  return {
    transactions,
    totalCredit,
    totalDebit,
    totalTransactions: transactions.length,
    finalBalance,
  };
}

// Parse SCB bank statement
function parseSCB(text: string): Transaction[] {
  const lines = text.split("\n").map((line) => line.trim());
  const transactions: Transaction[] = [];

  const txnRegex =
    /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+([A-Z0-9]+)\s+([A-Z]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+DESC\s*:\s*(.+)/;
  const noteRegex = /^NOTE\s*:\s*(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const txnMatch = lines[i].match(txnRegex);
    if (!txnMatch) continue;

    const [, date, time, code, , amountStr, balanceStr, descRaw] = txnMatch;
    const amount = parseNumber(amountStr);
    const balance = parseNumber(balanceStr);

    let noteText = "-";
    if (i + 1 < lines.length) {
      const noteMatch = lines[i + 1].match(noteRegex);
      if (noteMatch) {
        noteText = noteMatch[1].trim();
        i++;
      }
    }

    let debitCredit = amount;
    if (code === "X2" || code === "CO") {
      debitCredit = -amount;
    }

    // Map code to Thai label: X1 = รับโอนเงิน, X2 = โอนเงิน, others keep original
    const codeMap: Record<string, string> = {
      X1: "รับโอนเงิน",
      X2: "โอนเงิน",
    };
    const codeLabel = codeMap[code] || code;

    const descriptionClean = descRaw.trim();
    const descriptionNote =
      noteText !== "-"
        ? `${descriptionClean} | ${noteText}`
        : descriptionClean;

    const name = extractName(descriptionClean);

    transactions.push({
      date,
      time,
      code: codeLabel,
      debitCredit,
      balance,
      descriptionNote,
      descriptionClean,
      name,
      note: noteText === "-" ? "" : noteText,
    });
  }

  return transactions;
}

// Parse KBANK bank statement
// Format: DD-MM-YY HH:MM CHANNEL\tBALANCE DESCRIPTION\tTRANSACTION_TYPE AMOUNT
function parseKBANK(text: string): Transaction[] {
  const lines = text.split("\n");
  const transactions: Transaction[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip ยอดยกมา (brought forward) lines
    if (line.includes("ยอดยกมา")) continue;

    // Match with tab separators (primary format from pdf-parse)
    // Example: "01-02-26 10:35 K PLUS\t2,186.43 โอนไป BBL X5303 น.ส. จิราพร อุป++\tโอนเงิน 309.00"
    const txnRegex =
      /^(\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+?)\t([\d,]+\.\d{2})\s+(.+?)\t(.+?)\s+([\d,]+\.\d{2})$/;

    const match = line.match(txnRegex);
    if (!match) continue;

    const [, dateRaw, time, channel, balanceStr, description, txnType, amountStr] = match;
    const amount = parseNumber(amountStr);
    const balance = parseNumber(balanceStr);

    // Convert date from DD-MM-YY to DD/MM/YY for consistency
    const date = dateRaw.replace(/-/g, "/");

    // Determine debit/credit based on transaction type
    // รับโอนเงิน (receive), ฝากเงิน (deposit), ดอกเบี้ย (interest) = positive
    // โอนเงิน (transfer out), ถอนเงิน (withdraw), ค่าธรรมเนียม (fee) = negative
    const isCredit =
      txnType.includes("รับ") ||
      txnType === "ฝากเงิน" ||
      txnType === "ดอกเบี้ย";
    const debitCredit = isCredit ? amount : -amount;

    const descriptionClean = description.trim();
    const name = extractName(descriptionClean);

    transactions.push({
      date,
      time,
      code: txnType,
      debitCredit,
      balance,
      descriptionNote: `${descriptionClean} | ${txnType}`,
      descriptionClean,
      name,
      note: "",
    });
  }

  return transactions;
}

// Main entry point: parse bank statement by type
export async function parseBankStatement(
  buffer: Buffer,
  bankType: BankType = "SCB"
): Promise<ParseResult> {
  const text = await extractPdfText(buffer);

  const transactions =
    bankType === "KBANK" ? parseKBANK(text) : parseSCB(text);

  return calculateSummary(transactions);
}
