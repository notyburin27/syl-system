-- ============================================================================
-- แก้เบอร์รถคนขับที่มีอักษรไทยหลุดเข้ามา
--
-- พบใน prod 2026-11-14: คนขับ "มารุต  การกะสัง" (กลุ่ม 3) เบอร์รถ 'ํY02'
-- ตัวแรกเป็นนิคหิต U+0E4D (hex e0b98d) ติดมาตอนลืมสลับแป้นพิมพ์ มองแทบไม่เห็น
-- โค้ดใหม่ (lib/utils/vehicleNumber.ts) ปฏิเสธเบอร์รถที่มีอักษรไทยแล้ว
--
-- เปลี่ยนเป็น Y03 (ไม่ใช่แค่ลบนิคหิตเป็น Y02): "จรอน อ่อนทอง" (กลุ่ม 5) ใช้ Y02
-- อยู่แล้ว ทั้งสองคนวิ่งงานวันเดียวกัน 77/87 วัน และตาราง vehicles มี SYL Y-03
-- (64-1114) ที่ยังไม่มีคนขับคนไหนผูกอยู่ — ผู้ใช้ยืนยันให้ใช้ Y03 เมื่อ 2026-11-14
--
-- ต้องรันหลัง deploy โค้ดใหม่ เพราะหลัง deploy API จะปฏิเสธการแก้ไขข้อมูลของคนขับคนนี้
-- จนกว่าจะเอาอักษรไทยออกจากเบอร์รถ (จะแก้เบอร์ผ่าน UI แทนการรัน SQL ก็ได้)
--
-- วิธีรัน:
--   psql "$DATABASE_URL" -f scripts/sql/2026-11-14-fix-driver-vehicle-number-thai-char.sql
--
-- ค่าเดิม (ไว้ย้อนคืน):
--   id cmrlu5ybc01am0tu4ug0yka6g  vehicleNumber 'ํY02' (e0b98d593032)
--
-- หมายเหตุ:
--   - รันซ้ำได้ (idempotent) — WHERE ล็อกทั้ง id และค่าเดิม
--   - SELECT แรกต้องได้ 1 แถว, SELECT สุดท้ายต้องได้ 0
-- ============================================================================

BEGIN;

-- ตรวจก่อนแก้: เบอร์รถที่มีอักษรไทยทั้งหมด (ต้องได้ 1 แถวคือมารุต)
SELECT "id", "name", "vehicleNumber",
       encode(convert_to("vehicleNumber", 'UTF8'), 'hex') AS hex
FROM "drivers"
WHERE "vehicleNumber" ~ '[ก-๛]';

UPDATE "drivers"
SET "vehicleNumber" = 'Y03',
    "updatedAt"     = NOW()
WHERE "id" = 'cmrlu5ybc01am0tu4ug0yka6g'
  AND "vehicleNumber" = E'\u0E4DY02';

-- ยืนยันผล: ต้องได้ 0
SELECT COUNT(*) AS remaining_thai_vehicle_numbers
FROM "drivers"
WHERE "vehicleNumber" ~ '[ก-๛]';

-- ----------------------------------------------------------------------------
-- เลขตัวถังรถ SYL 136 (64-0217) มีนิคหิตนำหน้าแบบเดียวกัน — มาจาก import 7 ต.ค.
-- ค่าเดิม: 'ํYS2P6X20005459963' (e0b98d5953...) → 'YS2P6X20005459963'
-- ----------------------------------------------------------------------------
UPDATE "vehicles"
SET "chassisNumber" = 'YS2P6X20005459963',
    "updatedAt"     = NOW()
WHERE "id" = 'cmuxm56zx001u0uut48gvqmjo'
  AND "chassisNumber" = E'\u0E4DYS2P6X20005459963';

-- ยืนยันผล: ต้องได้ 0
SELECT COUNT(*) AS remaining_thai_chassis_numbers
FROM "vehicles"
WHERE "chassisNumber" ~ '[ก-๛]';

COMMIT;
