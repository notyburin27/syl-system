import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'

// .env.test เป็น single source of truth สำหรับ test — มี credentials ครบ
dotenv.config({ path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx next dev -p 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL:              process.env.DATABASE_URL              ?? '',
      AUTH_SECRET:               process.env.AUTH_SECRET               ?? '',
      NEXTAUTH_SECRET:           process.env.NEXTAUTH_SECRET           ?? '',
      AUTH_URL:                  'http://localhost:3001',
      NEXTAUTH_URL:              'http://localhost:3001',
      LINE_CHANNEL_SECRET:       process.env.LINE_CHANNEL_SECRET       ?? '',
      LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
      DO_SPACES_ENDPOINT:        process.env.DO_SPACES_ENDPOINT        ?? '',
      DO_SPACES_BUCKET:          process.env.DO_SPACES_BUCKET          ?? '',
      DO_SPACES_KEY:             process.env.DO_SPACES_KEY             ?? '',
      DO_SPACES_SECRET:          process.env.DO_SPACES_SECRET          ?? '',
      DO_SPACES_REGION:          process.env.DO_SPACES_REGION          ?? '',
      DO_SPACES_CDN_BASE:        process.env.DO_SPACES_CDN_BASE        ?? '',
    },
  },
})
