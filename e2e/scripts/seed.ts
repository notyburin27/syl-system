import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hash } from 'bcrypt'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
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
