import { PDFParse } from "pdf-parse";
import { Transaction, ParseResult } from "@/types/statement";

// Parse comma-formatted number string to number (e.g., "10,000.00" -> 10000.00)
function parseNumber(str: string): number {
  return parseFloat(str.replace(/,/g, ""));
}

// Extract person name from description using Thai/English title patterns
function extractName(description: string): string {
  const namePattern =
    /(นาย|นาง(?!สาว)|นางสาว|น\.ส\.|MR\.?|MS\.?|MRS\.?)\s+(.+)/i;
  const match = description.match(namePattern);
  if (!match) return "";

  const title = match[1];
  const restOfName = match[2].trim();

  // Take name until end of line or known delimiter
  // Names can contain Thai chars, English chars, and spaces
  const nameEndPattern = restOfName.match(
    /^([ก-๙a-zA-Z\s.]+?)(?:\s*$|\s*(?:NOTE|DESC))/
  );
  if (nameEndPattern) {
    return `${title} ${nameEndPattern[1].trim()}`;
  }

  return `${title} ${restOfName}`;
}

// Parse SCB bank statement PDF buffer into structured transactions
export async function parseBankStatement(
  buffer: Buffer
): Promise<ParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  const result = await parser.getText();
  const text = result.pages.map((p) => p.text).join("\n");

  const lines = text.split("\n").map((line) => line.trim());
  const transactions: Transaction[] = [];

  // Regex for transaction line
  // Format: DD/MM/YY HH:MM CODE CHANNEL AMOUNT BALANCE DESC : description
  const txnRegex =
    /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+([A-Z0-9]+)\s+([A-Z]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+DESC\s*:\s*(.+)/;

  const noteRegex = /^NOTE\s*:\s*(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const txnMatch = lines[i].match(txnRegex);
    if (!txnMatch) continue;

    const [, date, time, code, , amountStr, balanceStr, descRaw] = txnMatch;
    const amount = parseNumber(amountStr);
    const balance = parseNumber(balanceStr);

    // Look for NOTE on the next line
    let noteText = "-";
    if (i + 1 < lines.length) {
      const noteMatch = lines[i + 1].match(noteRegex);
      if (noteMatch) {
        noteText = noteMatch[1].trim();
        i++; // Skip the NOTE line
      }
    }

    // Determine debit/credit sign based on transaction code
    // X1 = receive money (positive), IN = interest (positive)
    // X2 = pay/transfer out (negative), CO = other (keep as-is, usually debit)
    let debitCredit = amount;
    if (code === "X2" || code === "CO") {
      debitCredit = -amount;
    }

    const descriptionClean = descRaw.trim();
    const descriptionNote =
      noteText !== "-"
        ? `${descriptionClean} | ${noteText}`
        : descriptionClean;

    const name = extractName(descriptionClean);

    transactions.push({
      date,
      time,
      code,
      debitCredit,
      balance,
      descriptionNote,
      descriptionClean,
      name,
      note: noteText === "-" ? "" : noteText,
    });
  }

  // Calculate summary
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
