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

// Determine debit/credit sign for a KBANK transaction from its รายการ (txnType).
// Works for both statement formats (short labels in the new format and the long
// descriptive labels in the pre-2019 format).
//   Credit (+): รับโอนเงิน, ฝาก..., ดอกเบี้ย
//   Debit  (-): โอนเงิน, ถอนเงิน, หักบัญชี, ค่าธรรมเนียม, ชำระเงิน
// NOTE: use startsWith("ฝาก") — every old-format label ends with "ไม่มีสมุดคู่ฝาก",
// so includes("ฝาก") would wrongly mark withdrawals as deposits.
function isKBANKCredit(txnType: string): boolean {
  const t = txnType.trim();
  return t.startsWith("ฝาก") || t.includes("รับ") || t.includes("ดอกเบี้ย");
}

// A standalone money amount on its own line (e.g. "60,404.83")
const KBANK_AMOUNT_ONLY = /^[\d,]+\.\d{2}$/;

// A money amount at the end of a string (e.g. "...ไม่มีสมุดคู่ฝาก 50,000.00")
const KBANK_TRAILING_AMOUNT = /^(.+?)\s+([\d,]+\.\d{2})$/;

// Build and append a KBANK transaction (shared by every format variant).
function pushKBANK(
  transactions: Transaction[],
  dateRaw: string,
  time: string,
  txnType: string,
  amountStr: string,
  balanceStr: string,
  descriptionClean: string
): void {
  const amount = parseNumber(amountStr);
  transactions.push({
    date: dateRaw.replace(/-/g, "/"),
    time,
    code: txnType,
    debitCredit: isKBANKCredit(txnType) ? amount : -amount,
    balance: parseNumber(balanceStr),
    descriptionNote: `${descriptionClean} | ${txnType}`,
    descriptionClean,
    name: extractName(descriptionClean),
    note: "",
  });
}

// The second column of every KBANK record is "เวลา/วันที่มีผล": either a time
// (HH:MM) or an effective date (DD-MM-YY). Carry HH:MM into the time field, drop
// the effective date (it isn't a time).
const KBANK_TIME_OR_EFFDATE = String.raw`(?:\d{2}:\d{2}|\d{2}-\d{2}-\d{2})`;
const asTime = (s: string): string => (/^\d{2}:\d{2}$/.test(s) ? s : "");

// New format: full single-line record (two tab-separated columns + trailing amount)
//   "01-11-19 21:36 K-Cyber Banking\t1,313,637.83 จาก X4876...\tรับโอนเงิน 1,000,000.00"
//    DATE TIME CHANNEL\tBALANCE DESCRIPTION\tTXNTYPE AMOUNT
const KBANK_NEW_FULL = new RegExp(
  String.raw`^(\d{2}-\d{2}-\d{2})\s+(${KBANK_TIME_OR_EFFDATE})\s+(.+?)\t([\d,]+\.\d{2})\s+(.+?)\t(.+?)\s+([\d,]+\.\d{2})$`
);

// New format header: channel text, then a tab, then the balance number. Matches
// both full single-line records and wrapped ones (where description/txnType/amount
// spill onto following lines). Used both to start a record and as a "next record"
// stop guard.
const KBANK_NEW_HEADER = new RegExp(
  String.raw`^(\d{2}-\d{2}-\d{2})\s+(${KBANK_TIME_OR_EFFDATE})\s+(.+?)\t([\d,]+\.\d{2})\s+(.+)$`
);

// Old format header: balance comes right after the time/effective-date column,
// single tab before txnType.
const KBANK_OLD_HEADER = new RegExp(
  String.raw`^(\d{2}-\d{2}-\d{2})\s+(${KBANK_TIME_OR_EFFDATE})\s+([\d,]+\.\d{2})\s+(.+?)\t(.+)$`
);

// Does a line start a new transaction record (either format)?
function isKBANKHeader(line: string): boolean {
  return KBANK_NEW_HEADER.test(line) || KBANK_OLD_HEADER.test(line);
}

// Bare header: "DATE TIME …" with no tab and no balance — the channel (e.g. a
// long branch name) wrapped before reaching its tab/balance column.
const KBANK_BARE_HEADER = new RegExp(
  String.raw`^(\d{2}-\d{2}-\d{2})\s+(${KBANK_TIME_OR_EFFDATE})\s+(\S.*)$`
);
// A line that begins with the balance number (the wrapped channel's true tail).
const KBANK_BALANCE_START = /^[\d,]+\.\d{2}(\s|\t)/;

// Repair records whose channel name wrapped before the tab, by folding the
// channel continuation + the balance line back into one physical line:
//   "04-03-20 15:10 สาขาเทสโก้ โลตัส อมตะ"            ┐
//   "นคร ชลบุรี"                                      ├─► one line, then parsed normally
//   "6,608,286.88 รหัสอ้างอิง K0446488\tฝากเงินสด 300,000.00" ┘
// Subsequent desc/txnType/amount wraps (if any) are left untouched for the main
// loop's lookahead to handle.
function mergeKBANKChannelWraps(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const bare = line.match(KBANK_BARE_HEADER);
    // Only a candidate when it has no tab and no amount (a real header has both).
    const isChannelWrap =
      bare &&
      !line.includes("\t") &&
      !/[\d,]+\.\d{2}/.test(bare[3]) &&
      !line.includes("ยอดยกมา");

    if (isChannelWrap) {
      let channel = bare![3].trim();
      let balanceLine: string | null = null;
      let consumeTo = i;
      for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
        const next = lines[j].trim();
        if (KBANK_BALANCE_START.test(next)) {
          balanceLine = next;
          consumeTo = j;
          break;
        }
        if (isKBANKHeader(next) || next.includes("ยอดยกมา")) break;
        if (next) channel += next; // channel continuation (Thai → no space)
      }
      if (balanceLine !== null) {
        out.push(`${bare![1]} ${bare![2]} ${channel}\t${balanceLine}`);
        i = consumeTo;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

// Parse KBANK bank statement. pdf-parse emits several layouts depending on the
// statement vintage and how long the description/txnType is:
//
// New (from ~Nov 2019, has ช่องทาง/channel column):
//   - single line:  DATE TIME CHANNEL\tBALANCE DESC\tTXNTYPE AMOUNT
//   - wrapped v1:    long DESC wraps; closing line is "TXNTYPE AMOUNT"
//   - wrapped v2:    long TXNTYPE wraps; closing line is "AMOUNT" only
//
// Old (pre-Nov 2019, no channel). Balance comes before the detail, second column
// is a time (HH:MM) or an effective date (DD-MM-YY); amount sits on the header
// line or wraps to its own trailing line.
function parseKBANK(text: string): Transaction[] {
  const lines = mergeKBANKChannelWraps(text.split("\n"));
  const transactions: Transaction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip ยอดยกมา (brought forward) lines
    if (line.includes("ยอดยกมา")) continue;

    // --- New format, full single line ---
    const fullMatch = line.match(KBANK_NEW_FULL);
    if (fullMatch) {
      const [, dateRaw, timeRaw, , balanceStr, description, txnType, amountStr] =
        fullMatch;
      pushKBANK(
        transactions,
        dateRaw,
        asTime(timeRaw),
        txnType,
        amountStr,
        balanceStr,
        description.trim()
      );
      continue;
    }

    // --- New format, wrapped across lines ---
    const newHeader = line.match(KBANK_NEW_HEADER);
    if (newHeader) {
      const [, dateRaw, timeRaw, , balanceStr, tail] = newHeader;
      const time = asTime(timeRaw);
      const tabIdx = tail.indexOf("\t");

      let description: string;
      let txnType: string;
      let amountStr: string | null = null;

      if (tabIdx >= 0) {
        // v2: header already carries "DESC\tTXNTYPE…"; TXNTYPE wraps, amount on
        // its own trailing line. Wrap break here sits on a space → join with space.
        description = tail.slice(0, tabIdx).trim();
        txnType = tail.slice(tabIdx + 1).trim();
        for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
          const next = lines[j].trim();
          if (KBANK_AMOUNT_ONLY.test(next)) {
            amountStr = next;
            i = j;
            break;
          }
          if (isKBANKHeader(next)) break;
          if (next) txnType += ` ${next}`;
        }
      } else {
        // v1: only DESC so far; DESC wraps (mid Thai word → join without space),
        // closing line is "TXNTYPE AMOUNT".
        description = tail.trim();
        txnType = "";
        for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
          const next = lines[j].trim();
          const trailing = next.match(KBANK_TRAILING_AMOUNT);
          if (trailing) {
            txnType = trailing[1].trim();
            amountStr = trailing[2];
            i = j;
            break;
          }
          if (isKBANKHeader(next)) break;
          if (next) description += next;
        }
      }

      if (amountStr === null) continue; // malformed record — skip safely
      pushKBANK(
        transactions,
        dateRaw,
        time,
        txnType,
        amountStr,
        balanceStr,
        description
      );
      continue;
    }

    // --- Old format (pre-2019): may be single-line or wrapped across lines ---
    const oldMatch = line.match(KBANK_OLD_HEADER);
    if (!oldMatch) continue;

    const [, dateRaw, timeRaw, balanceStr, detail, rest] = oldMatch;
    // Second column is a time only when it looks like HH:MM (otherwise it's
    // the effective date, which we don't carry into the time field).
    const time = /^\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : "";

    let txnType: string;
    let amountStr: string;

    const trailing = rest.match(KBANK_TRAILING_AMOUNT);
    if (trailing) {
      // (a) amount already on the header line
      txnType = trailing[1].trim();
      amountStr = trailing[2];
    } else {
      // (b) txnType wrapped — collect continuation lines until the amount line
      txnType = rest.trim();
      let found: string | null = null;
      for (let j = i + 1; j < lines.length && j <= i + 5; j++) {
        const next = lines[j].trim();
        if (KBANK_AMOUNT_ONLY.test(next)) {
          found = next;
          i = j; // consume up to and including the amount line
          break;
        }
        // Stop if we ran into the next transaction header instead of an amount
        if (isKBANKHeader(next)) break;
        if (next) txnType += next; // append wrapped fragment (no space, Thai)
      }
      if (found === null) continue; // malformed record — skip safely
      amountStr = found;
    }

    pushKBANK(
      transactions,
      dateRaw,
      time,
      txnType,
      amountStr,
      balanceStr,
      detail.trim()
    );
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
