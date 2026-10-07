import { expect, type APIResponse, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'
import type { CoverageTypeKey } from '../../lib/renewals/constants'
import type { VehicleDetailResponse } from '../../types/renewals'

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

export async function createVehicle(page: Page, plate: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await page.request.post('/api/renewals/vehicles', {
    data: { plate, ownerName: 'E2E บริษัท', vehicleType: 'ลากจูง', ...extra },
  })
  return (await expectJson<{ id: string }>(res)).id
}

export async function createCoverage(
  page: Page,
  vehicleId: string,
  type: CoverageTypeKey,
  endDate: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await page.request.post('/api/renewals/coverages', { data: { vehicleId, type, endDate, ...extra } })
  return (await expectJson<{ id: string }>(res)).id
}

export async function getVehicleDetail(page: Page, vehicleId: string): Promise<VehicleDetailResponse> {
  return expectJson<VehicleDetailResponse>(await page.request.get(`/api/renewals/vehicles/${vehicleId}`))
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' ตาม format ของ DatePicker */
/** ข้อความในช่อง DatePicker ของเมนูต่ออายุรถ — ปี พ.ศ. */
export function toPickerText(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${Number(y) + 543}`
}

export async function fillDate(page: Page, selector: string, ymd: string) {
  await page.locator(selector).fill(toPickerText(ymd))
  await page.locator(selector).press('Tab')
}
