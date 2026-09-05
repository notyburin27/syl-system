import { PrismaClient } from '@/app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Postgres บนเครื่อง (docker สำหรับ e2e/dev) ไม่เปิด SSL — บังคับ SSL แล้วจะต่อไม่ติด
  // DB บนคลาวด์ (staging/prod) ยังใช้ SSL เหมือนเดิม
  const connectionString = process.env.DATABASE_URL!
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
  const adapter = new PrismaPg({
    connectionString,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
