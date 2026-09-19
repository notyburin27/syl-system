-- ============================================================================
-- เคลียร์ค่าขนส่ง (income) และค่าเที่ยวคนขับ (driverWage) ของงานที่ถูกยกเลิก
--
-- ตั้งแต่รอบนี้เป็นต้นไป การติ๊ก "ยกเลิกใบงาน" จะเซ็ตสองช่องนี้เป็น NULL
-- ให้อัตโนมัติ (ดู PATCH /api/jobs/[id]) สคริปต์นี้ไล่แก้ข้อมูลเดิมที่ยกเลิก
-- ไปก่อนหน้าแล้วแต่ยังมีตัวเลขค้างอยู่
--
-- วิธีรัน:
--   psql "$DATABASE_URL" -f scripts/sql/2026-09-19-clear-cancelled-job-amounts.sql
--
-- หมายเหตุ:
--   - รันซ้ำได้ (idempotent) — แถวที่เคลียร์แล้วจะไม่เข้าเงื่อนไข WHERE
--   - ชื่อคอลัมน์เป็น camelCase จึงต้องใส่ double quote ทุกตัว
--   - การเคลียร์นี้ถาวร ไม่มีการ backup ค่าเดิม
-- ============================================================================

BEGIN;

-- ตรวจก่อนแก้: มีกี่แถวที่จะถูกกระทบ และยอดรวมที่จะหายไป
SELECT
  COUNT(*)                        AS rows_to_update,
  COALESCE(SUM("income"), 0)      AS total_income_to_clear,
  COALESCE(SUM("driverWage"), 0)  AS total_driver_wage_to_clear
FROM "jobs"
WHERE "isCancelled" = TRUE
  AND ("income" IS NOT NULL OR "driverWage" IS NOT NULL);

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
