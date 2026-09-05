import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER_NAME = 'Test Driver Playwright'
const VEHICLE_NUMBER = 'BKK-QA1'

/** วันที่ในเดือนปัจจุบันที่ใช้สร้างงาน — ใช้วันที่ 1 เพื่อให้ cell หาเจอเสมอ */
const JOB_DAY = dayjs().startOf('month')
const CURRENT_MONTH = dayjs().format('YYYY-MM')

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill('testadmin')
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs/, { timeout: 15_000 })
}

function cleanupDriver() {
  execSync('npx tsx e2e/scripts/cleanup-driver.ts', {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: path.resolve(__dirname, '../..'),
  })
}

/** สร้าง driver ผ่าน API แล้วคืน id */
async function createDriver(page: Page, overrides: Record<string, unknown> = {}) {
  const res = await page.request.post('/api/drivers', {
    data: { name: DRIVER_NAME, vehicleNumber: VEHICLE_NUMBER, ...overrides },
  })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

/** เปิดโหมดแก้ไขแบบรายการ แล้วกดปุ่มเพิ่มงานใหม่ → คืน locator ของ modal */
async function openCreateJobModal(page: Page) {
  await page.getByTestId('toggle-modal-edit-btn').click()
  await expect(page.getByTestId('add-job-btn')).toBeVisible()
  await page.getByTestId('add-job-btn').click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  return modal
}

/** เลือกวันที่ + ลักษณะงาน ในฟอร์มสร้างงาน */
async function fillDateAndType(page: Page, typeLabel: string) {
  await page.locator('#job-date-picker').click()
  await page.locator(`.ant-picker-cell[title="${JOB_DAY.format('YYYY-MM-DD')}"]`).click()
  await page.locator('#job-type-select').click()
  await page.getByRole('option', { name: typeLabel, exact: true }).click()
}

// serial: ทุกเคสใช้ driver ชื่อเดียวกัน — ต้องรันทีละตัวกัน unique-constraint ชน
test.describe.serial('QA feedback batch', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test.afterEach(() => {
    cleanupDriver()
  })

  // ─── Item 3: SIZE options ใหม่ ──────────────────────────────────────────
  test('Item 3: SIZE dropdown มี 45HC, 20OT, 40OT, 20FL, 40FL', async ({ page }) => {
    const driverId = await createDriver(page)
    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)

    const modal = await openCreateJobModal(page)
    await fillDateAndType(page, 'ขาเข้า')
    await page.locator('#jobNumber').fill('E2E-SIZE-001')
    await page.getByTestId('job-create-btn').click()
    await expect(modal.getByText('ลูกค้า')).toBeVisible({ timeout: 10_000 })

    // เปิด dropdown SIZE แล้วตรวจว่ามีค่าใหม่ครบทั้ง 5
    await modal.locator('.ant-form-item').filter({ hasText: 'SIZE' }).locator('.ant-select-selector').click()
    for (const size of ['45HC', '20OT', '40OT', '20FL', '40FL']) {
      await expect(page.getByRole('option', { name: size, exact: true })).toBeVisible()
    }
  })

  // ─── Item 7: ปุ่มเพิ่มงานใหม่เป็น primary ────────────────────────────────
  test('Item 7: ปุ่ม "เพิ่มงานใหม่" เป็น type primary', async ({ page }) => {
    const driverId = await createDriver(page)
    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)

    await page.getByTestId('toggle-modal-edit-btn').click()
    const addBtn = page.getByTestId('add-job-btn')
    await expect(addBtn).toBeVisible()
    await expect(addBtn).toHaveClass(/ant-btn-primary/)
    await expect(addBtn).not.toHaveClass(/ant-btn-dashed/)
  })

  // ─── Item 1: แก้ JOB/เลขที่ ได้ + ห้ามซ้ำ ────────────────────────────────
  test('Item 1: แก้ JOB/เลขที่ ได้ และซ้ำไม่ได้', async ({ page }) => {
    const driverId = await createDriver(page)

    // สร้าง 2 งานผ่าน API เพื่อทดสอบเคสเลขซ้ำ
    for (const jobNumber of ['E2E-DUP-A', 'E2E-DUP-B']) {
      const res = await page.request.post('/api/jobs', {
        data: {
          jobNumber,
          jobDate: JOB_DAY.format('YYYY-MM-DD'),
          jobType: 'inbound',
          driverId,
        },
      })
      expect(res.ok()).toBeTruthy()
    }

    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)
    await page.getByTestId('toggle-modal-edit-btn').click()

    // เปิดงาน E2E-DUP-A
    await page.getByRole('cell', { name: 'E2E-DUP-A', exact: true }).click()
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    // ช่อง JOB/เลขที่ ต้องแก้ไขได้ (ไม่ disabled)
    const jobNumberInput = page.locator('#jobNumber')
    await expect(jobNumberInput).toBeEnabled()

    // 1a. แก้เป็นเลขที่ยังไม่มีใครใช้ → บันทึกได้
    await jobNumberInput.fill('E2E-DUP-A-EDITED')
    const okPatch = page.waitForResponse(
      (r) => r.url().includes('/api/jobs/') && r.request().method() === 'PATCH' && r.status() === 200,
    )
    await jobNumberInput.blur()
    await okPatch

    // 1b. แก้เป็นเลขที่ซ้ำกับงานอื่น → API ต้องปฏิเสธ 400
    await jobNumberInput.fill('E2E-DUP-B')
    const dupPatch = page.waitForResponse(
      (r) => r.url().includes('/api/jobs/') && r.request().method() === 'PATCH' && r.status() === 400,
    )
    await jobNumberInput.blur()
    const dupRes = await dupPatch
    expect((await dupRes.json()).error).toContain('มีอยู่แล้ว')
    await expect(page.getByText('เลขที่งานนี้มีอยู่แล้ว')).toBeVisible({ timeout: 5_000 })
  })

  // ─── Item 2: คาดการณ์ค่ารับ/คืนตู้ พิมพ์ได้ + คาดการณ์โอน sum realtime ──
  test('Item 2: คาดการณ์ค่ารับ/คืนตู้ พิมพ์ได้ และคาดการณ์โอน sum ทันทีที่พิมพ์', async ({ page }) => {
    const driverId = await createDriver(page)
    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)

    const modal = await openCreateJobModal(page)
    await fillDateAndType(page, 'ขาเข้า')
    await page.locator('#jobNumber').fill('E2E-EST-001')
    await page.getByTestId('job-create-btn').click()
    await expect(modal.getByText('ลูกค้า')).toBeVisible({ timeout: 10_000 })

    const pickup = modal.locator('.ant-form-item').filter({ hasText: 'คาดการณ์ค่ารับตู้' }).locator('input')
    const ret = modal.locator('.ant-form-item').filter({ hasText: 'คาดการณ์ค่าคืนตู้' }).locator('input')
    const transfer = modal.locator('.ant-form-item').filter({ hasText: 'คาดการณ์โอน' }).locator('input')

    // ทั้งสองช่องต้องพิมพ์ได้
    await expect(pickup).toBeEnabled()
    await expect(ret).toBeEnabled()

    // พิมพ์ค่ารับตู้ → คาดการณ์โอน update ทันที (ยังไม่ blur)
    await pickup.fill('300')
    await expect(transfer).toHaveValue('300', { timeout: 5_000 })

    // พิมพ์ค่าคืนตู้ → รวมเป็น 500 ทันที
    await ret.fill('200')
    await expect(transfer).toHaveValue('500', { timeout: 5_000 })

    // พิมพ์ทับคาดการณ์โอนเองได้ และไม่ถูก auto-sum เขียนทับ
    await transfer.fill('999')
    await expect(transfer).toHaveValue('999')
    await pickup.fill('100')
    await expect(transfer).toHaveValue('999')
  })

  // ─── Item 4 + 5 + 12: ส่วนต่างสี, น้ำมันสดรวมยอด, ปุ่มเคลียร์ ────────────
  test('Item 4/5/12: น้ำมันสดรวมเข้ายอดคนรถ, ส่วนต่างมีสี, เคลียร์ได้เมื่อส่วนต่าง 0', async ({ page }) => {
    const driverId = await createDriver(page)
    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)

    const modal = await openCreateJobModal(page)
    await fillDateAndType(page, 'ขาเข้า')
    await page.locator('#jobNumber').fill('E2E-FUEL-001')
    await page.getByTestId('job-create-btn').click()
    await expect(modal.getByText('ลูกค้า')).toBeVisible({ timeout: 10_000 })

    const fuelCash = modal.locator('.ant-form-item').filter({ hasText: 'น้ำมันสด (฿)' }).locator('input')
    const driverOverall = modal.locator('.ant-form-item').filter({ hasText: 'รวมคนรถปิดงาน' }).locator('input')
    const difference = modal.locator('.ant-form-item').filter({ hasText: 'ส่วนต่าง' }).locator('input')

    // Item 5: น้ำมันสด (฿) ต้องแสดงพื้นหลังฟ้าจริงแบบเดียวกับช่องค่าใช้จ่ายอื่น
    // (เช็คสีที่ render จริง ไม่ใช่แค่ class เพราะ antd สลับโครงสร้าง DOM ตามว่ามีค่าหรือไม่)
    const liftFee = modal.locator('.ant-form-item').filter({ hasText: 'ค่ายกตู้' }).locator('input')
    await expect(fuelCash).toHaveCSS('background-color', 'rgb(212, 238, 241)')
    await expect(liftFee).toHaveCSS('background-color', 'rgb(212, 238, 241)')

    // Item 5: กรอกน้ำมันสด → รวมเข้า "รวมคนรถปิดงาน"
    await fuelCash.fill('250')
    // สีต้องคงอยู่หลังมีค่า (antd เปลี่ยนไปใช้ affix wrapper)
    await expect(fuelCash).toHaveCSS('background-color', 'rgb(212, 238, 241)')
    await expect(driverOverall).toHaveValue('250', { timeout: 5_000 })

    // Item 4: ส่วนต่างเป็นบวก → สีฟ้า
    await expect(difference).toHaveValue('+250', { timeout: 5_000 })
    await expect(difference).toHaveCSS('color', 'rgb(22, 119, 255)')

    // Item 12: ส่วนต่าง != 0 → ปุ่มเคลียร์กดไม่ได้
    const clearBtn = page.getByTestId('job-clear-status-btn')
    await expect(clearBtn).toBeDisabled()

    // ล้างน้ำมันสด → ส่วนต่างกลับเป็น 0 → เคลียร์ได้
    await fuelCash.fill('')
    await expect(clearBtn).toBeEnabled({ timeout: 5_000 })
  })

  // ─── Item 6: backend block เคลียร์เมื่อส่วนต่าง != 0 ─────────────────────
  test('Item 6: API เคลียร์งาน ปฏิเสธเมื่อส่วนต่างไม่เป็น 0', async ({ page }) => {
    const driverId = await createDriver(page)

    // สร้างงานที่มีค่าใช้จ่ายแต่ยังไม่มีการโอน → ส่วนต่าง != 0
    const createRes = await page.request.post('/api/jobs', {
      data: {
        jobNumber: 'E2E-CLEAR-001',
        jobDate: JOB_DAY.format('YYYY-MM-DD'),
        jobType: 'inbound',
        driverId,
        liftFee: 500,
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const { id: jobId } = (await createRes.json()) as { id: string }

    // เรียก API ตรงๆ — ต้องถูกปฏิเสธแม้ frontend จะไม่ให้กด
    const blocked = await page.request.patch(`/api/jobs/${jobId}/clear`)
    expect(blocked.status()).toBe(400)
    expect((await blocked.json()).error).toContain('ส่วนต่างต้องเป็น 0')

    // เคลียร์ค่าใช้จ่ายให้ส่วนต่างเป็น 0 → เคลียร์ผ่าน
    const patchRes = await page.request.patch(`/api/jobs/${jobId}`, { data: { liftFee: null } })
    expect(patchRes.ok()).toBeTruthy()
    const allowed = await page.request.patch(`/api/jobs/${jobId}/clear`)
    expect(allowed.ok()).toBeTruthy()
    expect((await allowed.json()).clearStatus).toBe(true)
  })

  // ─── Item 8: ประเภทงาน "ไม่มีงาน" ───────────────────────────────────────
  test('Item 8: สร้างงาน "ไม่มีงาน" พร้อมเหตุผล+หมายเหตุ และแถวเป็นสีเทา', async ({ page }) => {
    const driverId = await createDriver(page)
    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}`)

    const modal = await openCreateJobModal(page)
    await fillDateAndType(page, 'ไม่มีงาน')

    // ระบบต้อง auto-gen เลขที่ให้ (prefix NJB) และช่องถูกล็อค
    const jobNumberInput = page.locator('#jobNumber')
    await expect(jobNumberInput).toHaveValue(/^NJB-/, { timeout: 10_000 })
    await expect(jobNumberInput).toBeDisabled()

    // เลือกเหตุผล — คลิกที่ selector (คลิก #id จะโดน hidden input, dropdown ไม่เปิด)
    const reasonItem = modal.locator('.ant-form-item').filter({ hasText: 'เหตุผล' })
    await reasonItem.locator('.ant-select-selector').click()
    await page.locator('.ant-select-dropdown:not(.ant-slide-up-leave)')
      .getByTitle('ซ่อมรถ', { exact: true }).click()
    await expect(reasonItem.locator('.ant-select-selection-item')).toHaveText('ซ่อมรถ')

    await modal.locator('.ant-form-item').filter({ hasText: 'หมายเหตุ' }).locator('input').fill('เข้าอู่เปลี่ยนคลัตช์')

    await page.getByTestId('job-create-btn').click()
    // สร้างสำเร็จ → ปุ่ม "สร้าง" หายไป
    await expect(page.getByTestId('job-create-btn')).toBeHidden({ timeout: 10_000 })

    // งานประเภทนี้ไม่มีส่วนการเงิน
    await expect(modal.getByText('รวมคนรถปิดงาน')).toBeHidden()

    // ปิด modal แล้วตรวจแถวในตาราง
    await modal.getByRole('button', { name: 'บันทึก' }).click()
    await expect(modal).toBeHidden({ timeout: 5_000 })

    const row = page.locator('tr.no-job-row')
    await expect(row).toHaveCount(1, { timeout: 10_000 })
    await expect(row.getByText('ไม่มีงาน')).toBeVisible()
    // แถวสีเทาแบบเดียวกับ banner placeholder
    await expect(row.locator('td').first()).toHaveCSS('background-color', 'rgb(240, 240, 240)')
  })

  // ─── Item 9: คนขับลาออก ────────────────────────────────────────────────
  test('Item 9: ตั้งวันลาออก → หายจากรายการงานขนส่งในเดือนถัดไป', async ({ page }) => {
    const driverId = await createDriver(page)

    // ลาออกเดือนที่แล้ว → เดือนปัจจุบันต้องไม่เห็น
    const lastMonth = dayjs().subtract(1, 'month')
    const res = await page.request.patch(`/api/drivers/${driverId}`, {
      data: { resignedAt: lastMonth.startOf('month').format('YYYY-MM-DD') },
    })
    expect(res.ok()).toBeTruthy()

    // เดือนปัจจุบัน (หลังลาออก) → ไม่มี card
    await page.goto(`/jobs?month=${CURRENT_MONTH}`)
    await expect(page.getByTestId(`driver-card-${driverId}`)).toBeHidden({ timeout: 10_000 })

    // เดือนที่ลาออก → ยังเห็นอยู่
    const summaryResp = page.waitForResponse(
      (r) => r.url().includes('/api/jobs/summary') && r.url().includes(`month=${lastMonth.format('YYYY-MM')}`),
    )
    await page.goto(`/jobs?month=${lastMonth.format('YYYY-MM')}`)
    await summaryResp
    await expect(page.getByTestId(`driver-card-${driverId}`)).toBeVisible({ timeout: 10_000 })
  })

  // ─── Item 10 + 11: month picker + ปุ่มกลับคืน tab/เดือน ─────────────────
  test('Item 10/11: month picker ในหน้าคนขับ และปุ่มกลับคืน tab กลุ่ม + เดือนเดิม', async ({ page }) => {
    const GROUP = 'กลุ่มทดสอบ QA'
    const driverId = await createDriver(page, { groupName: GROUP })

    const prevMonth = dayjs().subtract(1, 'month').format('YYYY-MM')

    // เข้าหน้าคนขับพร้อม group + month
    await page.goto(`/jobs/${driverId}?month=${CURRENT_MONTH}&group=${encodeURIComponent(GROUP)}`)
    await expect(page.getByText(DRIVER_NAME)).toBeVisible({ timeout: 10_000 })

    // Item 10: month picker มีอยู่และเปลี่ยนเดือนได้ → URL เปลี่ยนตาม
    // หน้านี้ตั้ง dayjs.locale('th') → panel เดือนแสดงชื่อย่อภาษาไทย เช่น "ส.ค."
    const MONTH_ABBREV_TH = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ]
    const prev = dayjs().subtract(1, 'month')
    const monthPicker = page.locator('#job-month-picker')
    await expect(monthPicker).toBeVisible()
    await monthPicker.click()
    // ถ้าเดือนก่อนหน้าอยู่คนละปี ต้องถอยปีก่อน (panel แสดงทีละปี)
    if (prev.year() !== dayjs().year()) {
      await page.locator('.ant-picker-header-super-prev-btn').click()
    }
    await page.locator('.ant-picker-dropdown .ant-picker-cell-inner')
      .getByText(MONTH_ABBREV_TH[prev.month()], { exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`month=${prevMonth}`), { timeout: 10_000 })
    // group ต้องยังติดมาใน URL หลังเปลี่ยนเดือน
    await expect(page).toHaveURL(/group=/)

    // Item 11: กดกลับ → กลับไป /jobs พร้อม group + เดือนเดิม
    await page.getByTestId('back-to-jobs-btn').click()
    await expect(page).toHaveURL(new RegExp(`/jobs\\?.*month=${prevMonth}`), { timeout: 10_000 })
    await expect(page).toHaveURL(/group=/)

    // tab ของกลุ่มนั้นต้อง active
    await expect(page.locator('.ant-tabs-tab-active')).toHaveText(GROUP, { timeout: 10_000 })
  })
})
