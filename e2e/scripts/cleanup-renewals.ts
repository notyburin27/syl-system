import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// local Postgres (docker) ไม่รองรับ SSL — เปิดเฉพาะตอนต่อ DB บนคลาวด์
const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const vehicles = await prisma.vehicle.findMany({ where: { plate: { startsWith: 'E2E' } }, select: { id: true } })
  const ids = vehicles.map((v) => v.id)
  // ไฟล์แนบลบตาม cascade ของงวด
  await prisma.vehicleCoverage.deleteMany({
    where: { OR: [{ vehicleId: { in: ids } }, { pairedVehicleId: { in: ids } }] },
  })
  await prisma.vehicle.deleteMany({ where: { id: { in: ids } } })
  await prisma.insurer.deleteMany({ where: { name: { startsWith: 'E2E' } } })
  fs.rmSync(path.resolve(__dirname, '../../.tmp/renewal-attachments'), { recursive: true, force: true })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
