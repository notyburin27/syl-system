export interface Transaction {
  date: string;
  time: string;
  code: string;
  debitCredit: number;
  balance: number;
  descriptionNote: string;
  descriptionClean: string;
  name: string;
  note: string;
}

export interface ParseResult {
  transactions: Transaction[];
  totalCredit: number;
  totalDebit: number;
  totalTransactions: number;
  finalBalance: number;
}
