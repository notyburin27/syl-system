import { PrismaClient } from '../app/generated/prisma/client'
import { hash } from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 เริ่มต้น seed database...')

  // สร้าง admin user เริ่มต้น
  const password = await hash('admin123', 10)

  const admin = await prisma.authUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      id: 'admin-user-id-' + Date.now(),
      username: 'admin',
      password,
      role: 'ADMIN',
      name: 'ผู้ดูแลระบบ',
    },
  })

  console.log('✅ สร้าง admin user สำเร็จ')
  console.log('   Username: admin')
  console.log('   Password: admin123')
  console.log('   Role: ADMIN')
  console.log('   ⚠️  กรุณาเปลี่ยนรหัสผ่านหลังจาก login ครั้งแรก!')
  console.log('')
  console.log('🎉 Seed เสร็จสมบูรณ์!')
}

main()
  .catch((e) => {
    console.error('❌ เกิดข้อผิดพลาดในการ seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
