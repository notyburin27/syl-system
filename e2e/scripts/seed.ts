import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hash } from 'bcrypt'

// local Postgres (docker) ไม่รองรับ SSL — เปิดเฉพาะตอนต่อ DB บนคลาวด์
const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const password = await hash('admin123', 10)
  await prisma.authUser.upsert({
    where: { username: 'testadmin' },
    update: { password },
    create: { username: 'testadmin', password, role: 'ADMIN', name: 'Test Admin' },
  })
  console.log('✅ [Playwright] seed test user สำเร็จ: testadmin / admin123')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
