import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseBankStatement, BankType } from "@/lib/utils/statementPdfParser";
import { generateStatementExcel } from "@/lib/utils/statementExcelGenerator";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Get bank type from form data
    const bankTypeRaw = formData.get("bankType") as string | null;
    const bankType: BankType = bankTypeRaw === "KBANK" ? "KBANK" : "SCB";

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse PDF
    const parseResult = await parseBankStatement(buffer, bankType);

    if (parseResult.transactions.length === 0) {
      return NextResponse.json(
        { error: "No transactions found in the PDF. Please check the file format." },
        { status: 400 }
      );
    }

    // Generate Excel
    const excelBuffer = await generateStatementExcel(parseResult.transactions);

    // Build filename with current date
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const filename = `bank_statement_detailed_${dateStr}.xlsx`;

    // Return Excel file with summary in headers
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Total-Transactions": String(parseResult.totalTransactions),
        "X-Total-Credit": String(parseResult.totalCredit),
        "X-Total-Debit": String(parseResult.totalDebit),
        "X-Final-Balance": String(parseResult.finalBalance),
      },
    });
  } catch (error: any) {
    console.error("Statement conversion error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process the PDF file" },
      { status: 500 }
    );
  }
}
