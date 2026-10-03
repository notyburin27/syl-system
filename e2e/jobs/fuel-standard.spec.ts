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

/** สร้างสถานที่ทดสอบ 3 แห่ง — suffix กันชื่อซ้ำระหว่าง test */
async function seedLocations(page: Page, suffix: string) {
  const make = async (name: string, type: 'general' | 'factory') => {
    const res = await page.request.post('/api/locations', { data: { name, type } })
    if (!res.ok()) throw new Error(`create location ${name} failed — ${await res.text()}`)
    return ((await res.json()) as { id: string }).id
  }
  const names = {
    pickup: `E2E_FUEL_PICK_${suffix}`,
    factory: `E2E_FUEL_FAC_${suffix}`,
    ret: `E2E_FUEL_RET_${suffix}`,
  }
  return {
    names,
    pickupId: await make(names.pickup, 'general'),
    factoryId: await make(names.factory, 'factory'),
    returnId: await make(names.ret, 'general'),
  }
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

  test('Case 1: เพิ่มผ่านหน้าจอ → แสดงในตาราง', async ({ page }) => {
    await login(page)
    const { names } = await seedLocations(page, 'C1')
    await page.goto('/jobs/settings/fuel-standard')

    await expect(async () => {
      await page.getByTestId('fuel-standard-add-btn').click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })

    await selectOption(page, 'fuel-standard-size', '40DC')
    await selectOption(page, 'fuel-standard-pickup', names.pickup)
    await selectOption(page, 'fuel-standard-factory', names.factory)
    await selectOption(page, 'fuel-standard-return', names.ret)
    await page.getByTestId('fuel-standard-liters-input').fill('300')
    await page.getByTestId('fuel-standard-submit-btn').click()

    await expect(page.getByText('เพิ่มสำเร็จ')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: names.pickup })
    await expect(row).toContainText(names.factory)
    await expect(row).toContainText('300.00')
  })

  test('Case 2: key ซ้ำ (รวมกรณีโรงงานว่าง) → 409', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C2')
    const body = { size: '20DC', pickupLocationId: loc.pickupId, factoryLocationId: null, returnLocationId: loc.returnId, liters: 100 }

    expect((await page.request.post('/api/rates/fuel-standard', { data: body })).status()).toBe(201)
    const dup = await page.request.post('/api/rates/fuel-standard', { data: { ...body, liters: 120 } })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe('มีข้อมูลนี้อยู่แล้ว')

    // โรงงานต่างกัน = คนละ key
    const other = await page.request.post('/api/rates/fuel-standard', { data: { ...body, factoryLocationId: loc.factoryId } })
    expect(other.status()).toBe(201)
  })

  test('Case 3: แก้ลิตร → ค่าใหม่ในตาราง', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C3')
    const res = await page.request.post('/api/rates/fuel-standard', {
      data: { size: '40DC', pickupLocationId: loc.pickupId, factoryLocationId: loc.factoryId, returnLocationId: loc.returnId, liters: 300 },
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
    await expect(page.getByRole('row').filter({ hasText: loc.names.pickup })).toContainText('320.00')
  })

  test('Case 4: ลบผ่าน modal.confirm → หายจากตาราง', async ({ page }) => {
    await login(page)
    const loc = await seedLocations(page, 'C4')
    const res = await page.request.post('/api/rates/fuel-standard', {
      data: { size: '40DC', pickupLocationId: loc.pickupId, factoryLocationId: null, returnLocationId: loc.returnId, liters: 50 },
    })
    const { id } = (await res.json()) as { id: string }

    await page.goto('/jobs/settings/fuel-standard')
    await page.getByTestId(`fuel-standard-delete-btn-${id}`).click()
    await page.getByRole('dialog').getByRole('button', { name: 'ลบ' }).click()

    await expect(page.getByText('ลบสำเร็จ')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: loc.names.pickup })).toHaveCount(0)
  })

  test('Case 5: import — validate จับสถานที่ไม่พบ/ซ้ำในไฟล์, import ซ้ำ key เดิมอัปเดตลิตร', async ({ page }) => {
    await login(page)
    const { names } = await seedLocations(page, 'C5')
    const good = { size: '40DC', pickupLocationName: names.pickup, factoryLocationName: names.factory, returnLocationName: names.ret, liters: '300' }

    const bad = await page.request.post('/api/rates/fuel-standard/import', {
      data: { validate: true, rows: [good, { ...good, pickupLocationName: 'E2E_FUEL_NOPE' }, { ...good }] },
    })
    const badBody = await bad.json()
    expect(badBody.valid).toBe(false)
    expect(badBody.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, message: 'ไม่พบสถานที่ "E2E_FUEL_NOPE"' }),
        expect.objectContaining({ row: 3, message: 'ข้อมูลซ้ำในไฟล์ (แถว 1, 3)' }),
      ]),
    )

    expect((await page.request.post('/api/rates/fuel-standard/import', { data: { rows: [good] } })).status()).toBe(201)
    expect((await page.request.post('/api/rates/fuel-standard/import', { data: { rows: [{ ...good, liters: '333' }] } })).status()).toBe(201)

    const list = (await (await page.request.get('/api/rates/fuel-standard')).json()) as { pickupLocation: { name: string }; liters: string }[]
    const mine = list.filter((r) => r.pickupLocation.name === names.pickup)
    expect(mine).toHaveLength(1)
    expect(Number(mine[0].liters)).toBe(333)
  })

  test('Case 6: MANAGER เรียก API ได้ 403 และเข้าหน้าตรงๆ ถูก redirect', async ({ page }) => {
    await login(page, 'testmanager')
    expect((await page.request.get('/api/rates/fuel-standard')).status()).toBe(403)
    await page.goto('/jobs/settings/fuel-standard')
    await expect(page).not.toHaveURL(/fuel-standard/)
  })
})
