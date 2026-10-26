import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

async function login(page: Page, username = 'testadmin') {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs|\/line-images/, { timeout: 10_000 })
}

// antd Select showSearch: id อยู่บน search input — คลิก wrapper เปิด dropdown แล้วพิมพ์ค้น
async function selectOption(page: Page, selectId: string, text: string) {
  const input = page.locator(`#${selectId}`)
  await input.locator('..').locator('..').click()
  await input.fill(text)
  const dropdown = page.locator('.ant-select-dropdown').filter({ has: page.locator(`[id="${selectId}_list"]`) })
  await dropdown.locator('.ant-select-item-option-content', { hasText: text }).first().click()
}

/** สร้างโรงงาน + สถานที่ทอยทดสอบ — suffix กันชื่อซ้ำระหว่าง test */
async function seedLocations(page: Page, suffix: string) {
  const make = async (name: string, type: 'general' | 'factory') => {
    const res = await page.request.post('/api/locations', { data: { name, type } })
    if (!res.ok()) throw new Error(`create location ${name} failed — ${await res.text()}`)
    return ((await res.json()) as { id: string }).id
  }
  const names = { factory: `E2E_FUEL_FAC_${suffix}`, tow: `E2E_FUEL_TOW_${suffix}` }
  return {
    names,
    factoryId: await make(names.factory, 'factory'),
    towId: await make(names.tow, 'general'),
  }
}

async function openAddForm(page: Page) {
  await page.goto('/jobs/settings/fuel-standard')
  await expect(async () => {
    await page.getByTestId('fuel-standard-add-btn').click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
}

function cleanup() {
  execSync('npx tsx e2e/scripts/cleanup-fuel-standard.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

test.describe.serial('น้ำมันมาตรฐาน', () => {
  test.afterEach(() => cleanup())

  test('Case 1: เพิ่มงานวิ่งแหลมฉบังผ่านหน้าจอ → แสดงในตาราง', async ({ page }) => {
    await login(page)
    const { names } = await seedLocations(page, 'C1')
    await openAddForm(page)

    await selectOption(page, 'fuel-standard-size', '40DC')
    await selectOption(page, 'fuel-standard-location', names.factory)
    await page.locator('#fuel-standard-laem').check()
    await page.getByTestId('fuel-standard-liters-input').fill('450')
    await page.getByTestId('fuel-standard-submit-btn').click()

    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: names.factory })
    await expect(row).toContainText('วิ่ง')
    await expect(row).toContainText('✓')
    await expect(row).toContainText('450.00')
  })

  test('Case 2: เพิ่มงานทอยผ่านหน้าจอ — เลือกสถานที่ทั่วไปได้ ไม่มีช่องแหลมฉบัง', async ({ page }) => {
    await login(page)
    const { names } = await seedLocations(page, 'C2')
    await openAddForm(page)

    await page.getByRole('dialog').getByText('งานทอย').click()
    await expect(page.locator('#fuel-standard-laem')).toHaveCount(0)
    await selectOption(page, 'fuel-standard-size', '20DC')
    await selectOption(page, 'fuel-standard-location', names.tow)
    await page.getByTestId('fuel-standard-liters-input').fill('25')
    await page.getByTestId('fuel-standard-submit-btn').click()

    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: names.tow })
    await expect(row).toContainText('ทอย')
    await expect(row).toContainText('25.00')
  })

  test('Case 3: key ซ้ำ → 409, แหลมฉบังคนละ key, ทอยติ๊กแหลมฉบัง → 400', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C3')
    const body = { kind: 'run', size: '20DC', locationId: loc.factoryId, isLaemChabang: false, liters: 100 }

    expect((await page.request.post('/api/rates/fuel-standard', { data: body })).status()).toBe(201)
    const dup = await page.request.post('/api/rates/fuel-standard', { data: { ...body, liters: 120 } })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('มีข้อมูลนี้อยู่แล้ว')

    const laem = await page.request.post('/api/rates/fuel-standard', { data: { ...body, isLaemChabang: true } })
    expect(laem.status()).toBe(201)

    const towLaem = await page.request.post('/api/rates/fuel-standard', {
      data: { kind: 'towing', size: '20DC', locationId: loc.towId, isLaemChabang: true, liters: 20 },
    })
    expect(towLaem.status()).toBe(400)
    expect((await towLaem.json()).error).toBe('งานทอยไม่ต้องระบุแหลมฉบัง')
  })

  test('Case 4: แก้ลิตร → ค่าใหม่ในตาราง', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C4')
    const res = await page.request.post('/api/rates/fuel-standard', {
      data: { kind: 'run', size: '40DC', locationId: loc.factoryId, liters: 300 },
    })
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/fuel-standard')
    await expect(async () => {
      await page.getByTestId(`fuel-standard-edit-btn-${id}`).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })
    await page.getByTestId('fuel-standard-liters-input').fill('320')
    await page.getByTestId('fuel-standard-submit-btn').click()

    await expect(page.getByText('แก้ไขสำเร็จ')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: loc.names.factory })).toContainText('320.00')
  })

  test('Case 5: ลบผ่าน modal.confirm → หายจากตาราง', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C5')
    const res = await page.request.post('/api/rates/fuel-standard', {
      data: { kind: 'towing', size: '40DC', locationId: loc.towId, liters: 50 },
    })
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/fuel-standard')
    await page.getByTestId(`fuel-standard-delete-btn-${id}`).click()
    await page.getByRole('dialog').getByRole('button', { name: 'ลบ' }).click()

    await expect(page.getByText('ลบสำเร็จ')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: loc.names.tow })).toHaveCount(0)
  })

  test('Case 6: import — validate จับสถานที่ไม่พบ/ซ้ำในไฟล์, import ซ้ำ key เดิมอัปเดตลิตร', async ({ page }) => {
    await login(page)
    const { names } = await seedLocations(page, 'C6')
    const good = { kind: 'วิ่ง', size: '40DC', locationName: names.factory, isLaemChabang: 'Y', liters: '450' }
    const tow = { kind: 'ทอย', size: '40DC', locationName: names.tow, isLaemChabang: '', liters: '25' }

    const bad = await page.request.post('/api/rates/fuel-standard/import', {
      data: { validate: true, rows: [good, { ...good, locationName: 'E2E_FUEL_NOPE' }, { ...good }] },
    })
    const badBody = await bad.json()
    expect(badBody.valid).toBe(false)
    expect(badBody.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, message: 'ไม่พบสถานที่ "E2E_FUEL_NOPE"' }),
        expect.objectContaining({ row: 3, message: 'ข้อมูลซ้ำในไฟล์ (แถว 1, 3)' }),
      ]),
    )

    expect((await page.request.post('/api/rates/fuel-standard/import', { data: { rows: [good, tow] } })).status()).toBe(201)
    expect((await page.request.post('/api/rates/fuel-standard/import', { data: { rows: [{ ...good, liters: '460' }] } })).status()).toBe(201)

    type Row = { kind: string; isLaemChabang: boolean; location: { name: string }; liters: string }
    const list = (await (await page.request.get('/api/rates/fuel-standard')).json()) as Row[]
    const run = list.filter((r) => r.location.name === names.factory)
    expect(run).toHaveLength(1)
    expect(run[0].isLaemChabang).toBe(true)
    expect(Number(run[0].liters)).toBe(460)
    expect(list.filter((r) => r.location.name === names.tow && r.kind === 'towing')).toHaveLength(1)
  })

  test('Case 7: MANAGER เรียก API ได้ 403 และเข้าหน้าตรงๆ ถูก redirect', async ({ page }) => {
    await login(page, 'testmanager')
    expect((await page.request.get('/api/rates/fuel-standard')).status()).toBe(403)
    await page.goto('/jobs/settings/fuel-standard')
    await expect(page).not.toHaveURL(/fuel-standard/)
  })
})
