import * as dotenv from 'dotenv'
import * as path from 'path'
import { execSync } from 'child_process'

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })

export default async function globalSetup() {
  console.log('\n🔧 [Playwright] กำลัง setup test database...')

  const env = { ...process.env }

  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', env })
  execSync('npx tsx e2e/scripts/seed.ts', { stdio: 'inherit', env })
}
