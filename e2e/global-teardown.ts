import * as dotenv from 'dotenv'
import * as path from 'path'
import { execSync } from 'child_process'

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })

export default async function globalTeardown() {
  execSync('npx tsx e2e/scripts/cleanup.ts', {
    stdio: 'inherit',
    env: { ...process.env },
  })
}
