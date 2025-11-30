-- ==============================================
-- SYL Transport System - Database Setup Script
-- ==============================================
-- คำแนะนำ: รันไฟล์นี้ใน pgAdmin, DBeaver หรือ DigitalOcean Database Dashboard
--
-- Script นี้จะสร้าง:
-- 1. Enum สำหรับ Role (ADMIN, STAFF)
-- 2. ตาราง auth_users สำหรับ authentication
-- 3. ตาราง transport_documents สำหรับเอกสารขนส่ง
-- ==============================================

-- ตรวจสอบว่ามี enum Role อยู่แล้วหรือไม่
DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- สร้างตาราง auth_users (สำหรับ authentication)
CREATE TABLE IF NOT EXISTS "auth_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- สร้างตาราง transport_documents (สำหรับเอกสารขนส่ง)
CREATE TABLE IF NOT EXISTS "transport_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    -- 19 ฟิลด์ของฟอร์ม
    "date" TIMESTAMP(3),
    "customerName" TEXT,
    "booking" TEXT,
    "agent" TEXT,
    "shipName" TEXT,
    "invoice" TEXT,
    "containerSize" TEXT,
    "containerNumber" TEXT,
    "sealNumber" TEXT,
    "shipping" TEXT,
    "pickupLocation" TEXT,
    "returnLocation" TEXT,
    "closingTime" TIMESTAMP(3),
    "factoryTime" TEXT,
    "loadingSlot" TEXT,
    "driverName" TEXT,
    "vehicleRegistration" TEXT,
    "phoneNumber" TEXT,
    "remarks" TEXT,

    -- Metadata
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_documents_pkey" PRIMARY KEY ("id")
);

-- สร้าง unique index สำหรับ username
CREATE UNIQUE INDEX IF NOT EXISTS "auth_users_username_key" ON "auth_users"("username");

-- สร้าง index สำหรับค้นหาเร็วขึ้น
CREATE INDEX IF NOT EXISTS "auth_users_username_idx" ON "auth_users"("username");
CREATE INDEX IF NOT EXISTS "transport_documents_createdById_idx" ON "transport_documents"("createdById");
CREATE INDEX IF NOT EXISTS "transport_documents_createdAt_idx" ON "transport_documents"("createdAt");

-- สร้าง foreign key constraint
DO $$ BEGIN
    ALTER TABLE "transport_documents"
    ADD CONSTRAINT "transport_documents_createdById_fkey"
    FOREIGN KEY ("createdById")
    REFERENCES "auth_users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- สร้าง function สำหรับ auto-update updatedAt
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- สร้าง trigger สำหรับ auth_users
DROP TRIGGER IF EXISTS update_auth_users_updated_at ON "auth_users";
CREATE TRIGGER update_auth_users_updated_at
    BEFORE UPDATE ON "auth_users"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- สร้าง trigger สำหรับ transport_documents
DROP TRIGGER IF EXISTS update_transport_documents_updated_at ON "transport_documents";
CREATE TRIGGER update_transport_documents_updated_at
    BEFORE UPDATE ON "transport_documents"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- แสดงผลลัพธ์
SELECT 'ตารางถูกสร้างเรียบร้อยแล้ว! ✅' AS status;
SELECT 'ตาราง auth_users: ' || COUNT(*)::TEXT || ' แถว' AS info FROM "auth_users";
SELECT 'ตาราง transport_documents: ' || COUNT(*)::TEXT || ' แถว' AS info FROM "transport_documents";
