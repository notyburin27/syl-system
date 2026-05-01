import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
})
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.authUser.deleteMany({ where: { username: 'testadmin' } })
  // Delete jobs before driver to satisfy FK constraint
  const testDrivers = await prisma.driver.findMany({ where: { name: 'Test Driver Playwright' } })
  for (const d of testDrivers) {
    await prisma.job.deleteMany({ where: { driverId: d.id } })
  }
  await prisma.driver.deleteMany({ where: { name: 'Test Driver Playwright' } })
  console.log('🧹 [Playwright] ลบ test data สำเร็จ')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
