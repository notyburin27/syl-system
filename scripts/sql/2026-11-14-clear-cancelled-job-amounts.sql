-- ============================================================================
-- เคลียร์ค่าขนส่ง (income) / ค่าเที่ยวคนขับ (driverWage) ของงานที่ยกเลิก — รอบ 2
--
-- รอบแรก (2026-09-19-clear-cancelled-job-amounts.sql) ล้างข้อมูลเดิมไปแล้ว
-- แต่หลังจากนั้นยังมียอดถูกเขียนกลับเข้างานที่ยกเลิก: ฟอร์มแก้ไขงานเติมค่าขนส่ง
-- อัตโนมัติตอนเปลี่ยนลูกค้า/สถานที่ และ API รับไว้ เพราะล้างเฉพาะตอนติ๊กยกเลิก
-- โค้ดแก้แล้ว (API ปฏิเสธ + ฟอร์มล็อกช่อง) — สคริปต์นี้ล้างข้อมูลที่หลุดไปแล้ว
--
-- รันหลัง deploy โค้ดใหม่ขึ้น prod เพื่อไม่ให้มีแถวใหม่หลุดเข้ามาอีก
--
-- วิธีรัน:
--   psql "$DATABASE_URL" -f scripts/sql/2026-11-14-clear-cancelled-job-amounts.sql
--
-- ค่าเดิมใน prod ณ 2026-11-14 (ไว้ย้อนคืนด้วยมือถ้าจำเป็น — driverWage เป็น NULL ทุกแถว):
--   165270/551640  income 9500.00   (clearStatus = true)
--   165759/552759  income 9500.00
--   165853/552988  income 9205.00
--   165566/552640  income 18600.00
--
-- หมายเหตุ:
--   - รันซ้ำได้ (idempotent) — แถวที่เคลียร์แล้วจะไม่เข้าเงื่อนไข WHERE
--   - ชื่อคอลัมน์เป็น camelCase จึงต้องใส่ double quote ทุกตัว
--   - SELECT แรกต้องได้ 4 แถวตามรายการข้างบน ถ้าได้มากกว่านี้ให้ดูก่อน COMMIT
-- ============================================================================

BEGIN;

-- ตรวจก่อนแก้: แถวที่จะถูกกระทบ
SELECT "jobNumber", "jobDate", "income", "driverWage", "clearStatus"
FROM "jobs"
WHERE "isCancelled" = TRUE
  AND ("income" IS NOT NULL OR "driverWage" IS NOT NULL)
ORDER BY "jobDate";

UPDATE "jobs"
SET
  "income"     = NULL,
  "driverWage" = NULL,
  "updatedAt"  = NOW()
WHERE "isCancelled" = TRUE
  AND ("income" IS NOT NULL OR "driverWage" IS NOT NULL);

-- ยืนยันผล: ต้องได้ 0
SELECT COUNT(*) AS remaining_dirty_rows
FROM "jobs"
WHERE "isCancelled" = TRUE
  AND ("income" IS NOT NULL OR "driverWage" IS NOT NULL);

COMMIT;
