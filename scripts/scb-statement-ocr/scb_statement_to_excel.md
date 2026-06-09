# SCB Statement OCR → Excel

แปลง **statement SCB ที่เป็นไฟล์สแกน (รูปภาพ ไม่มี text layer)** ให้เป็น Excel

> ตัวแปลงในแอป (`lib/utils/statementPdfParser.ts`) รองรับเฉพาะ PDF ที่มี text layer
> และรูปแบบ statement แบบดิจิทัลเท่านั้น ไฟล์ที่สแกนมา (เช่นจากเครื่องถ่ายเอกสาร)
> ไม่มี text + เลย์เอาต์ "STATEMENT OF SAVING ACCOUNT" ต่างจากที่ parser รู้จัก
> จึงต้องใช้ script นี้ซึ่งทำ OCR แยกต่างหาก (ไม่เกี่ยวกับ code ในแอป)

## วิธีทำงาน

1. แปลงแต่ละหน้า PDF เป็นรูป (`pdftoppm` 300 dpi)
2. OCR ทีละหน้าเป็นกล่องคำพร้อมพิกัด (`tesseract` ภาษา `tha+eng`)
3. จัดคำเข้าคอลัมน์ตามตำแหน่ง x (ตารางชิดขวา ขอบขวาแต่ละคอลัมน์คงที่)
4. **กระทบยอดด้วยคอลัมน์ยอดคงเหลือสะสม** — เพราะ `ยอดคงเหลือ = ยอดก่อนหน้า ± จำนวนเงิน`
   คอลัมน์นี้ทำหน้าที่เป็น checksum แก้เลข OCR ที่ผิดเป็นส่วนใหญ่อัตโนมัติ และ flag
   แถวที่ยืนยันไม่ได้

## ติดตั้ง dependencies

```bash
brew install poppler tesseract tesseract-lang   # pdftoppm/pdfinfo + tesseract (มีภาษาไทย)
pip3 install --user openpyxl
```

## วิธีใช้

```bash
python3 scb_statement_to_excel.py OUT.xlsx IN1.pdf [IN2.pdf ...]

# ตัวอย่าง: statement ที่สแกนแยกเป็น 2 ชุด (เรียงตามเวลา)
python3 scb_statement_to_excel.py statement.xlsx \
    "Set 1 93 Page .pdf" "Set 2 91 Page .pdf"

# ปรับเพดานค่าที่เป็นไปได้ (กันเลข OCR เกินหลัก) ให้สูงกว่ายอดสูงสุดจริงของบัญชีเล็กน้อย
python3 scb_statement_to_excel.py statement.xlsx --max-balance 15000000 IN.pdf
```

- ส่ง PDF ตาม**ลำดับเวลา** เพื่อให้ยอดคงเหลือต่อเนื่อง
- หน้าที่ไม่ใช่ตาราง statement (ใบเสร็จ, หน้าปกว่าง) จะไม่มีรายการ → ถูกข้ามอัตโนมัติ

## ผลลัพธ์

ไฟล์ `.xlsx` มี 2 sheet:

- **Statement** — ทุกรายการ คอลัมน์: Date, Time, Code, Channel, Debit/Credit,
  Balance/Baht, Description/Note, Description_Clean, Name, Note, Page, **Check**
- **Review** — เฉพาะแถวที่ `Check` ถูก flag (มีเลขหน้าให้เทียบกับ PDF ได้ง่าย)

ค่าในคอลัมน์ `Check`:

| สถานะ | ความหมาย |
|------|----------|
| `OK` | จำนวนเงินตรงกับผลต่างยอดคงเหลือพอดี (มั่นใจสูง) |
| `FIX_BAL` | ยอดคงเหลือ OCR ผิด → แก้จากจำนวนเงิน (ยืนยันด้วยแถวถัดไป) |
| `FIX_AMT` | จำนวนเงิน OCR ผิด → คิดใหม่จากผลต่างยอดคงเหลือ |
| `DERIVED_AMT` | อ่านจำนวนเงินไม่ได้ → คิดจากผลต่างยอดคงเหลือ |
| `BF` / `BF_FIX` | แถวยอดยกมา (ต้นหน้า) |
| `REVIEW`, `BF_MISMATCH`, `NO_BAL`, `NO_ANCHOR` | **ยืนยันไม่ได้ → ควรตรวจกับ PDF เอง** |

## ข้อจำกัด

- OCR บนสแกนภาษาไทยไม่แม่น 100% — **ชื่อ/รายละเอียดภาษาไทยจะเพี้ยน** (เน้นตัวเลขเป็นหลัก)
- ตัวเลขที่กระทบยอดได้จะถูกต้องเป็นส่วนใหญ่ ส่วนแถว `REVIEW` ต้องตรวจเอง
- ค่า x-band (ตำแหน่งคอลัมน์) อิงเลย์เอาต์ statement ออมทรัพย์ SCB ที่ 300 dpi
  ถ้ารูปแบบฟอร์ม/DPI เปลี่ยน อาจต้องปรับ band ในไฟล์ script
- `--max-balance` เป็นค่าเฉพาะบัญชี (ดีฟอลต์ 15,000,000) ใส่ `0` เพื่อปิด
```
