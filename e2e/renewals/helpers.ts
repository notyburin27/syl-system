import { expect, type APIResponse, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'

export async function login(page: Page, username: string, landing: RegExp) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(landing, { timeout: 10_000 })
}

export function cleanupRenewals() {
  execSync('npx tsx e2e/scripts/cleanup-renewals.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

export async function expectJson<T>(res: APIResponse): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`)
  return (await res.json()) as T
}

export async function createInsurer(page: Page, name: string): Promise<string> {
  return (await expectJson<{ id: string }>(await page.request.post('/api/renewals/insurers', { data: { name } }))).id
}
