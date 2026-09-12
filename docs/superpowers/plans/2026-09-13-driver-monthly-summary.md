# สรุปงานคนขับรายเดือน Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มเมนู "สรุปงาน" (ADMIN เท่านั้น) สำหรับดูสรุปรายเดือนของคนขับและ export Excel ตามฟอร์มที่ทีมใช้อยู่ พร้อมเพิ่ม field ฐานเงินเดือน/วันเริ่มงาน และแก้ bug ค้นหาคนขับข้าม tab

**Architecture:** ต่อยอดจากโครงเดิมของหน้า jobs — API route คำนวณสรุปจาก `Job`/`DriverLeave`/`FuelPriceLog` แล้วส่งให้ client component เรนเดอร์ ส่วน Excel ใช้ `exceljs` สร้าง generator ตัวเดียวที่รองรับทั้ง 1 sheet (รายคน) และ N sheets (ทั้งกลุ่ม) การกันสิทธิ์ทำ 3 ชั้น: middleware `authorized()`, server component, และ API route

**Tech Stack:** Next.js 15 App Router, Prisma 6, Ant Design v5, exceljs, Playwright, TypeScript

**Spec:** [docs/superpowers/specs/2026-09-13-driver-monthly-summary-design.md](../specs/2026-09-13-driver-monthly-summary-design.md)

## Global Constraints

- ตอบกลับผู้ใช้เป็นภาษาไทยเสมอ / error message ใน API เป็นภาษาไทย
- `<Table>` ทุกตัวต้องใส่ `size="small"`
- Confirm การลบ/action สำคัญใช้ `App.useApp().modal` → `modal.confirm({...})` ไม่ใช้ `Popconfirm`
- Client components ใช้ `'use client'`, notification ใช้ `App.useApp().message`
- Auth check ใน API: `const session = await auth(); if (!session?.user) return 401`
- `data-testid` บน Button/Input ได้โดยตรง; `<Modal>` **ห้าม**ใส่ `data-testid` ใช้ `page.getByRole('dialog')`
- `<DatePicker>` และ `<Select>` ใช้ `id` prop ไม่ครอบด้วย `<div data-testid>`
- Prisma: soft delete ใช้ `isActive`, id ใช้ `@default(cuid())`
- E2E รันด้วย `npx playwright test --workers=1` เสมอ
- Migration: `make migrate-stag` (ห้ามใช้ `prisma migrate` — โปรเจกต์นี้ใช้ `db push`)

---

## File Structure

**สร้างใหม่**

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/utils/summaryCalculator.ts` | คำนวณสรุปรายเดือนของคนขับ 1 คน — pure function ทดสอบได้ไม่ต้องพึ่ง DB |
| `lib/utils/summaryExcelGenerator.ts` | สร้าง Excel workbook จากผลสรุป (1 หรือ N sheets) |
| `lib/utils/thaiDate.ts` | แปลงวันที่/เดือนเป็นรูปแบบไทย (พ.ศ.) ใช้ร่วมกันหลายที่ |
| `app/api/summary/route.ts` | GET สรุปคนขับทุกคนในเดือน |
| `app/api/summary/[driverId]/route.ts` | GET สรุปคนขับคนเดียว (หลายเดือนได้) |
| `app/api/summary/export/route.ts` | GET ไฟล์ Excel |
| `app/(protected)/summary/page.tsx` | Server component — เช็ค role แล้วเรนเดอร์ list |
| `app/(protected)/summary/[driverId]/page.tsx` | Server component — เช็ค role แล้วเรนเดอร์ detail |
| `components/summary/SummaryDriverList.tsx` | หน้า list: เลือกเดือน, group by, filter, ค้นหา, download |
| `components/summary/SummaryDetail.tsx` | หน้ารายคน: บล็อกสรุป + download |
| `components/summary/ExportRangeModal.tsx` | Modal เลือกช่วงเดือนก่อน download (ใช้ร่วมทั้งสองหน้า) |
| `components/jobs/DriverSearchModal.tsx` | Modal ค้นหาคนขับข้ามกลุ่ม (แก้ bug) |
| `e2e/summary/summary.spec.ts` | E2E ของเมนูสรุปงาน |
| `e2e/scripts/cleanup-summary.ts` | ลบข้อมูลทดสอบของ summary spec |

**แก้ไข**

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `prisma/schema.prisma` | เพิ่ม `baseSalary`, `startDate` ใน `Driver` |
| `types/job.ts` | เพิ่ม field ใน `Driver`, เพิ่ม `DriverMonthlySummary` |
| `app/api/drivers/route.ts` | กรอง `baseSalary` ตาม role (GET/POST) |
| `app/api/drivers/[id]/route.ts` | กรอง `baseSalary` ตาม role (PATCH) |
| `components/jobs/DriverManager.tsx` | คอลัมน์ + form field ใหม่, รับ prop `isAdmin` |
| `app/(protected)/jobs/settings/drivers/page.tsx` | ส่ง `isAdmin` |
| `components/jobs/DriverJobList.tsx` | เปลี่ยนช่องค้นหาเป็นปุ่ม + modal |
| `components/ProtectedLayoutClient.tsx` | เมนู "สรุปงาน" |
| `lib/auth.ts` | กัน `/summary` ให้เฉพาะ ADMIN |
| `e2e/scripts/seed.ts` | เพิ่ม MANAGER user สำหรับทดสอบสิทธิ์ |

---

## Task 1: แก้ bug ค้นหาคนขับข้าม tab

งานนี้อิสระจากงานอื่น ทำก่อนได้เลย

**Files:**
- Create: `components/jobs/DriverSearchModal.tsx`
- Modify: `components/jobs/DriverJobList.tsx`
- Test: `e2e/jobs/dashboard.spec.ts`

**Interfaces:**
- Consumes: `DriverJobSummary` จาก `types/job.ts` (มีอยู่แล้ว มี `driverId`, `driverName`, `vehicleNumber`, `groupName`)
- Produces: `DriverSearchModal` component รับ props `{ open, summaries, onClose, onSelect }` โดย `onSelect: (driverId: string, groupName: string | null) => void`

### Step 1: เขียน E2E test ที่ fail

- [ ] เพิ่ม test case ท้ายไฟล์ `e2e/jobs/dashboard.spec.ts` (ใน `test.describe.serial` block เดิม)

```typescript
  // ─── Case: ค้นหาคนขับข้ามกลุ่ม (regression ของ bug ที่หาไม่เจอเมื่ออยู่คนละ tab) ───
  test('Case: ค้นหาคนขับที่อยู่คนละกลุ่มแล้วเจอ + สลับ tab ให้อัตโนมัติ', async ({ page }) => {
    // สร้างคนขับ 2 คน คนละกลุ่ม
    await page.goto('/jobs/settings/drivers')
    await expect(page.getByText('จัดการคนขับรถ')).toBeVisible()

    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.getByRole('dialog').getByPlaceholder('เบอร์รถ').fill(VEHICLE_NUMBER)
    await page.locator('#driver-group-name').fill('กลุ่มทดสอบ A')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME_B)
    await page.getByRole('dialog').getByPlaceholder('เบอร์รถ').fill(VEHICLE_NUMBER_B)
    await page.locator('#driver-group-name').fill('กลุ่มทดสอบ B')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // ไปหน้า dashboard แล้วเลือก tab กลุ่ม A
    await page.goto('/jobs')
    await page.getByRole('tab', { name: 'กลุ่มทดสอบ A' }).click()
    await expect(page.getByText(DRIVER_NAME, { exact: false })).toBeVisible()

    // เปิด modal ค้นหาคนขับ แล้วค้นคนที่อยู่กลุ่ม B (คนละ tab)
    await page.getByTestId('driver-search-btn').click()
    await page.getByRole('dialog').getByTestId('driver-search-input').fill(DRIVER_NAME_B)

    // ต้องเจอ ทั้งที่อยู่คนละ tab — นี่คือจุดที่ bug เดิมพัง
    const result = page.getByRole('dialog').getByTestId('driver-search-result').first()
    await expect(result).toBeVisible()
    await expect(result).toContainText('กลุ่มทดสอบ B')

    // คลิกแล้วต้องสลับ tab ไปกลุ่ม B ให้เอง
    await result.click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByRole('tab', { name: 'กลุ่มทดสอบ B', selected: true })).toBeVisible()
    await expect(page.getByText(DRIVER_NAME_B, { exact: false })).toBeVisible()
  })

  // ─── Case: ค้นหาด้วยเบอร์รถ ───
  test('Case: ค้นหาคนขับด้วยเบอร์รถ', async ({ page }) => {
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.getByRole('dialog').getByPlaceholder('เบอร์รถ').fill(VEHICLE_NUMBER)
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await page.goto('/jobs')
    await page.getByTestId('driver-search-btn').click()
    await page.getByRole('dialog').getByTestId('driver-search-input').fill(VEHICLE_NUMBER)

    const result = page.getByRole('dialog').getByTestId('driver-search-result').first()
    await expect(result).toBeVisible()
    await expect(result).toContainText(DRIVER_NAME)
  })
```

- [ ] เพิ่ม constant ท้ายกลุ่ม constant เดิมด้านบนไฟล์ (ใต้ `const JOB_NUMBER = 'E2E-TEST-001'`)

```typescript
const DRIVER_NAME_B = 'Test Driver Playwright B'
const VEHICLE_NUMBER_B = 'BKK-002'
```

- [ ] แก้ `e2e/scripts/cleanup-driver.ts` ให้ลบคนขับทดสอบทั้งสองคน — เปลี่ยนบรรทัด `const DRIVER_NAME = 'Test Driver Playwright'` และ query เป็น:

```typescript
const DRIVER_NAMES = ['Test Driver Playwright', 'Test Driver Playwright B']

async function main() {
  const drivers = await prisma.driver.findMany({ where: { name: { in: DRIVER_NAMES } } })
  if (drivers.length === 0) {
    console.log(`🧹 [Playwright] ไม่พบคนขับทดสอบ ไม่ต้องล้างข้อมูล`)
    return
  }
  for (const driver of drivers) {
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }
  console.log(`🧹 [Playwright] ลบคนขับทดสอบ ${drivers.length} คน พร้อมงานทั้งหมด`)
}
```

### Step 2: รัน test ให้เห็นว่า fail

- [ ] Run: `npx playwright test e2e/jobs/dashboard.spec.ts --workers=1 -g "ค้นหาคนขับ"`
- [ ] Expected: FAIL — หา `driver-search-btn` ไม่เจอ (ยังไม่มีปุ่ม)

### Step 3: ตรวจว่า DriverManager มี id บนช่องกลุ่ม

- [ ] เปิด `components/jobs/DriverManager.tsx` หา `Form.Item name="groupName"` — ข้างในเป็น `<AutoComplete>` ถ้ายังไม่มี `id` ให้ใส่ `id="driver-group-name"` (test ด้านบนใช้ `page.locator('#driver-group-name')`)
- [ ] ตรวจว่าปุ่ม submit ในโมดัลมี `data-testid="driver-submit-btn"` และปุ่มเพิ่มมี `data-testid="add-driver-btn"` ถ้าไม่มีให้เพิ่ม

### Step 4: สร้าง DriverSearchModal

- [ ] Create `components/jobs/DriverSearchModal.tsx`

```tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { Modal, Input, Empty, List } from 'antd'
import { SearchOutlined, TruckOutlined } from '@ant-design/icons'
import type { DriverJobSummary } from '@/types/job'

export default function DriverSearchModal({
  open,
  summaries,
  onClose,
  onSelect,
}: {
  open: boolean
  summaries: DriverJobSummary[]
  onClose: () => void
  onSelect: (driverId: string, groupName: string | null) => void
}) {
  const [searchText, setSearchText] = useState('')

  // ล้างคำค้นทุกครั้งที่เปิดใหม่ ไม่ให้ค้างจากครั้งก่อน
  useEffect(() => {
    if (open) setSearchText('')
  }, [open])

  // ค้นจาก summaries ทั้งชุด ไม่ผ่านตัวกรองกลุ่ม — จุดสำคัญที่แก้ bug เดิม
  const results = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return []
    return summaries.filter(
      (s) =>
        s.driverName.toLowerCase().includes(q) ||
        (s.vehicleNumber ?? '').toLowerCase().includes(q)
    )
  }, [summaries, searchText])

  return (
    <Modal
      title="ค้นหาคนขับ"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <Input
        data-testid="driver-search-input"
        placeholder="ค้นจากชื่อคนขับ หรือ เบอร์รถ"
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
        autoFocus
        style={{ marginBottom: 12 }}
      />

      {searchText.trim() === '' ? (
        <Empty description="พิมพ์ชื่อคนขับหรือเบอร์รถเพื่อค้นหา" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : results.length === 0 ? (
        <Empty description="ไม่พบคนขับที่ค้นหา" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={results}
          style={{ maxHeight: 360, overflowY: 'auto' }}
          renderItem={(s) => (
            <List.Item
              data-testid="driver-search-result"
              onClick={() => onSelect(s.driverId, s.groupName)}
              style={{ cursor: 'pointer' }}
            >
              <List.Item.Meta
                avatar={<TruckOutlined style={{ fontSize: 18, color: '#1890ff' }} />}
                title={`${s.driverName}${s.vehicleNumber ? ` (${s.vehicleNumber})` : ''}`}
                description={s.groupName ?? 'กลุ่มอื่นๆ'}
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  )
}
```

### Step 5: แก้ DriverJobList ให้ใช้ modal แทนช่องค้นหา

- [ ] เพิ่ม import ท้ายกลุ่ม import เดิม

```tsx
import DriverSearchModal from './DriverSearchModal'
```

- [ ] ลบ state `searchText` — ลบบรรทัด `const [searchText, setSearchText] = useState('')` แล้วเพิ่มแทน

```tsx
const [driverSearchOpen, setDriverSearchOpen] = useState(false)
```

- [ ] แก้ `filteredSummaries` (ราวบรรทัด 196-205) ให้เหลือแค่กรองกลุ่ม

```tsx
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) =>
      activeGroup === OTHER_GROUP_KEY ? !s.groupName : s.groupName === activeGroup
    )
  }, [summaries, activeGroup])
```

- [ ] เพิ่ม handler ถัดจาก `handleCardClick`

```tsx
  // เลือกคนขับจาก modal ค้นหา → สลับไป tab กลุ่มของคนนั้น แล้ว scroll ไปที่การ์ด
  const handleSearchSelect = (driverId: string, groupName: string | null) => {
    setDriverSearchOpen(false)
    setActiveGroup(groupName ?? OTHER_GROUP_KEY)
    // รอ tab เปลี่ยนเสร็จก่อนค่อย scroll — การ์ดยังไม่อยู่ใน DOM ตอนนี้
    setTimeout(() => {
      document
        .querySelector(`[data-testid="driver-card-${driverId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }
```

- [ ] แทนที่ `<Input data-testid="driver-search-input" ... />` ใน JSX (ราวบรรทัด 262-270) ด้วยปุ่ม

```tsx
          <Button
            data-testid="driver-search-btn"
            icon={<SearchOutlined />}
            onClick={() => setDriverSearchOpen(true)}
          >
            ค้นหาคนขับ
          </Button>
```

- [ ] เพิ่ม modal ท้าย JSX ถัดจาก `<JobSearchModal ... />`

```tsx
      <DriverSearchModal
        open={driverSearchOpen}
        summaries={summaries}
        onClose={() => setDriverSearchOpen(false)}
        onSelect={handleSearchSelect}
      />
```

- [ ] ลบ `Input` ออกจาก import ของ antd ถ้าไม่ได้ใช้ที่อื่นในไฟล์แล้ว (ตรวจด้วย `grep -n "<Input" components/jobs/DriverJobList.tsx`)

### Step 6: รัน test ให้ผ่าน

- [ ] Run: `npx playwright test e2e/jobs/dashboard.spec.ts --workers=1`
- [ ] Expected: PASS ทุก case (รวม case เดิมที่ต้องไม่พัง)

### Step 7: Commit

- [ ] Run:

```bash
git add components/jobs/DriverSearchModal.tsx components/jobs/DriverJobList.tsx e2e/jobs/dashboard.spec.ts e2e/scripts/cleanup-driver.ts
git commit -m "$(cat <<'EOF'
fix(jobs): ค้นหาคนขับข้ามกลุ่มได้ + ค้นจากเบอร์รถได้

เดิมกรองกลุ่มก่อนกรองคำค้น ทำให้คนขับที่อยู่คนละ tab หาไม่เจอ
เปลี่ยนเป็นปุ่มเปิด modal ที่ค้นจากข้อมูลทั้งชุด แล้วสลับ tab ให้อัตโนมัติ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: เพิ่ม baseSalary + startDate ใน Driver

**Files:**
- Modify: `prisma/schema.prisma`, `types/job.ts`, `app/api/drivers/route.ts`, `app/api/drivers/[id]/route.ts`, `components/jobs/DriverManager.tsx`, `app/(protected)/jobs/settings/drivers/page.tsx`, `e2e/scripts/seed.ts`
- Test: `e2e/jobs/settings.spec.ts`

**Interfaces:**
- Produces: `Driver.baseSalary: number | null` (ADMIN เท่านั้น — non-admin จะไม่มี key นี้เลย), `Driver.startDate: string | null` (ISO date string)
- Produces: `DriverManager` รับ prop `{ isAdmin: boolean }`

### Step 1: แก้ schema

- [ ] เปิด `prisma/schema.prisma` หา `model Driver` แล้วเพิ่ม 2 บรรทัดใต้ `groupName`

```prisma
  groupName           String?
  baseSalary          Decimal?            @db.Decimal(10, 2)
  startDate           DateTime?           @db.Date
```

- [ ] Run: `npx prisma generate`
- [ ] Expected: generate สำเร็จ ไม่มี error

### Step 2: แก้ types

- [ ] เปิด `types/job.ts` หา `export interface Driver` เพิ่ม 2 field ใต้ `groupName`

```typescript
  groupName: string | null;
  /** ฐานเงินเดือน — API ตัด field นี้ออกสำหรับ role ที่ไม่ใช่ ADMIN */
  baseSalary?: number | null;
  /** วันเริ่มงาน (ISO date string) */
  startDate: string | null;
```

### Step 3: เขียน E2E test ที่ fail

- [ ] เพิ่ม MANAGER user ใน `e2e/scripts/seed.ts` — แทนที่ function `main()` ทั้งตัว

```typescript
async function main() {
  const password = await hash('admin123', 10)
  await prisma.authUser.upsert({
    where: { username: 'testadmin' },
    update: { password },
    create: { username: 'testadmin', password, role: 'ADMIN', name: 'Test Admin' },
  })
  await prisma.authUser.upsert({
    where: { username: 'testmanager' },
    update: { password, role: 'MANAGER' },
    create: { username: 'testmanager', password, role: 'MANAGER', name: 'Test Manager' },
  })
  console.log('✅ [Playwright] seed test users สำเร็จ: testadmin, testmanager / admin123')
}
```

- [ ] สร้าง `e2e/jobs/driver-salary.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER_NAME = 'Test Driver Playwright'

async function login(page: import('@playwright/test').Page, username: string) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs/, { timeout: 10_000 })
}

test.describe.serial('ฐานเงินเดือน + วันเริ่มงาน', () => {
  test.afterEach(async () => {
    execSync('npx tsx e2e/scripts/cleanup-driver.ts', {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: path.resolve(__dirname, '../..'),
    })
  })

  test('Case 1: ADMIN เห็นคอลัมน์ฐานเงินเดือน และบันทึกค่าได้', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await expect(page.getByText('จัดการคนขับรถ')).toBeVisible()

    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.locator('#driver-start-date').fill('25/08/2568')
    await page.keyboard.press('Enter')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // คอลัมน์ต้องมี และแสดงค่าที่บันทึก
    await expect(page.getByRole('columnheader', { name: 'ฐานเงินเดือน' })).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(DRIVER_NAME) })).toContainText('9,000')
  })

  test('Case 2: MANAGER ไม่เห็นคอลัมน์ฐานเงินเดือน', async ({ page }) => {
    // ADMIN สร้างคนขับพร้อมเงินเดือนก่อน
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // MANAGER เข้ามาดู
    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')
    await page.goto('/jobs/settings/drivers')
    await expect(page.getByText('จัดการคนขับรถ')).toBeVisible()
    await expect(page.getByText(DRIVER_NAME)).toBeVisible()

    await expect(page.getByRole('columnheader', { name: 'ฐานเงินเดือน' })).not.toBeVisible()
  })

  test('Case 3: MANAGER ยิง API ตรงๆ ไม่เห็นค่า baseSalary', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')

    const res = await page.request.get('/api/drivers')
    expect(res.ok()).toBeTruthy()
    const drivers = await res.json()
    const target = drivers.find((d: { name: string }) => d.name === DRIVER_NAME)
    expect(target).toBeTruthy()
    expect(target.baseSalary).toBeUndefined()
  })

  test('Case 4: MANAGER แก้ baseSalary ผ่าน API ไม่ได้', async ({ page }) => {
    await login(page, 'testadmin')
    await page.goto('/jobs/settings/drivers')
    await page.getByTestId('add-driver-btn').click()
    await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(DRIVER_NAME)
    await page.locator('#driver-base-salary').fill('9000')
    await page.getByTestId('driver-submit-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const adminRes = await page.request.get('/api/drivers')
    const driverId = (await adminRes.json()).find(
      (d: { name: string }) => d.name === DRIVER_NAME
    ).id

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')

    // MANAGER พยายามแก้เงินเดือนเป็น 99999
    await page.request.patch(`/api/drivers/${driverId}`, {
      data: { name: DRIVER_NAME, baseSalary: 99999 },
    })

    // ADMIN กลับมาดู — ค่าต้องยังเป็น 9000
    await page.goto('/api/auth/signout')
    await login(page, 'testadmin')
    const verifyRes = await page.request.get('/api/drivers')
    const verified = (await verifyRes.json()).find(
      (d: { name: string }) => d.name === DRIVER_NAME
    )
    expect(Number(verified.baseSalary)).toBe(9000)
  })
})
```

### Step 4: รัน test ให้เห็นว่า fail

- [ ] Run: `npx playwright test e2e/jobs/driver-salary.spec.ts --workers=1`
- [ ] Expected: FAIL — หา `#driver-base-salary` ไม่เจอ

### Step 5: กรอง baseSalary ใน GET /api/drivers

- [ ] เปิด `app/api/drivers/route.ts` แก้ function `GET` — แทนที่ทั้ง block `try`

```typescript
  try {
    const drivers = await prisma.driver.findMany({
      where: { isActive: true },
      include: { bankAccounts: true },
      orderBy: { name: "asc" },
    });

    // ฐานเงินเดือนเป็นข้อมูลลับ — ตัดออกก่อนส่งให้ role ที่ไม่ใช่ ADMIN
    // ต้องกรองที่นี่ ไม่ใช่แค่ซ่อนใน UI เพราะ MANAGER ยิง API ตรงๆ ได้
    if (session.user.role !== "ADMIN") {
      const safe = drivers.map(({ baseSalary: _baseSalary, ...rest }) => rest);
      return NextResponse.json(safe);
    }

    return NextResponse.json(drivers);
  } catch (error) {
    console.error("Error fetching drivers:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูลคนขับ" },
      { status: 500 }
    );
  }
```

### Step 6: รับ baseSalary + startDate ใน POST

- [ ] ใน `app/api/drivers/route.ts` แก้ function `POST` — แทนที่ตั้งแต่ `const body = await req.json();` ถึง `});` ของ `prisma.driver.create`

```typescript
    const body = await req.json();
    const { name, vehicleNumber, vehicleRegistration, groupName, baseSalary, startDate } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อคนขับ" },
        { status: 400 }
      );
    }

    const isAdmin = session.user.role === "ADMIN";

    const driver = await prisma.driver.create({
      data: {
        name: name.trim(),
        vehicleNumber: vehicleNumber?.trim() || null,
        vehicleRegistration: vehicleRegistration?.trim() || null,
        groupName: groupName?.trim() || null,
        startDate: startDate ? new Date(startDate) : null,
        // non-admin ส่ง baseSalary มาก็เพิกเฉย
        ...(isAdmin && { baseSalary: baseSalary != null ? baseSalary : null }),
      },
      include: { bankAccounts: true },
    });
```

### Step 7: รับ baseSalary + startDate ใน PATCH

- [ ] เปิด `app/api/drivers/[id]/route.ts` แก้ destructure

```typescript
    const { name, vehicleNumber, vehicleRegistration, groupName, resignedAt, baseSalary, startDate } = body;
```

- [ ] แก้ `prisma.driver.update` ตัวที่สอง (ตัวที่อยู่หลัง validate name) — เพิ่ม 2 บรรทัดใน `data`

```typescript
    const isAdmin = session.user.role === "ADMIN";

    const driver = await prisma.driver.update({
      where: { id },
      data: {
        name: name.trim(),
        vehicleNumber: vehicleNumber?.trim() || null,
        vehicleRegistration: vehicleRegistration?.trim() || null,
        groupName: groupName?.trim() || null,
        startDate: startDate ? new Date(startDate) : null,
        // non-admin แก้เงินเดือนไม่ได้ — ไม่ใส่ key นี้เลยเพื่อไม่ให้ทับค่าเดิม
        ...(isAdmin && "baseSalary" in body && {
          baseSalary: baseSalary != null ? baseSalary : null,
        }),
        ...("resignedAt" in body && {
          resignedAt: resignedAt ? new Date(resignedAt) : null,
        }),
      },
      include: { bankAccounts: true },
    });
```

- [ ] เพิ่มการกรอง response ก่อน `return NextResponse.json(driver);` ตัวสุดท้าย

```typescript
    if (!isAdmin) {
      const { baseSalary: _baseSalary, ...safe } = driver;
      return NextResponse.json(safe);
    }
    return NextResponse.json(driver);
```

### Step 8: ส่ง isAdmin เข้า DriverManager

- [ ] แทนที่ `app/(protected)/jobs/settings/drivers/page.tsx` ทั้งไฟล์

```tsx
import { auth } from '@/lib/auth'
import DriverManager from '@/components/jobs/DriverManager'

export default async function DriversPage() {
  const session = await auth()
  const isAdmin = (session?.user as { role?: string })?.role === 'ADMIN'
  return <DriverManager isAdmin={isAdmin} />
}
```

### Step 9: เพิ่ม field ใน DriverManager

- [ ] แก้ signature ของ component

```tsx
export default function DriverManager({ isAdmin }: { isAdmin: boolean }) {
```

- [ ] เพิ่ม `InputNumber` เข้า import ของ antd (ตรวจก่อนว่ามีหรือยังด้วย `grep -n "InputNumber" components/jobs/DriverManager.tsx`)

- [ ] แก้ `handleOpenModal` ให้เซ็ตค่า 2 field ใหม่ — เพิ่มใน `form.setFieldsValue`

```tsx
      form.setFieldsValue({
        name: driver.name,
        vehicleNumber: driver.vehicleNumber,
        vehicleRegistration: driver.vehicleRegistration,
        groupName: driver.groupName,
        baseSalary: driver.baseSalary != null ? Number(driver.baseSalary) : undefined,
        startDate: driver.startDate ? dayjs(driver.startDate) : undefined,
      })
```

- [ ] แก้ type ของ `handleSubmit` values และแปลง `startDate` ก่อนส่ง

```tsx
  const handleSubmit = async (values: {
    name: string
    vehicleNumber?: string
    vehicleRegistration?: string
    groupName?: string
    baseSalary?: number
    startDate?: dayjs.Dayjs
  }) => {
    setSubmitLoading(true)
    try {
      const url = editingDriver ? `/api/drivers/${editingDriver.id}` : '/api/drivers'
      const method = editingDriver ? 'PATCH' : 'POST'

      const payload = {
        ...values,
        startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
```

(ที่เหลือของ `handleSubmit` คงเดิม)

- [ ] เพิ่มคอลัมน์ในตาราง — หา array `columns` แล้วเพิ่มก่อนคอลัมน์ `'สถานะ'`

```tsx
    {
      title: 'วันเริ่มงาน',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (v: string | null) =>
        v ? dayjs(v).add(543, 'year').format('DD/MM/YYYY') : '-',
    },
    ...(isAdmin
      ? [
          {
            title: 'ฐานเงินเดือน',
            dataIndex: 'baseSalary',
            key: 'baseSalary',
            align: 'right' as const,
            render: (v: number | null) =>
              v != null ? Number(v).toLocaleString('th-TH', { minimumFractionDigits: 0 }) : '-',
          },
        ]
      : []),
```

- [ ] เพิ่ม Form.Item ในโมดัลเพิ่ม/แก้ไข ถัดจาก `Form.Item name="groupName"`

```tsx
          <Form.Item name="startDate" label="วันเริ่มงาน">
            <DatePicker
              id="driver-start-date"
              format="DD/MM/BBBB"
              style={{ width: '100%' }}
              placeholder="เลือกวันเริ่มงาน"
            />
          </Form.Item>
          {isAdmin && (
            <Form.Item name="baseSalary" label="ฐานเงินเดือน">
              <InputNumber
                id="driver-base-salary"
                style={{ width: '100%' }}
                min={0}
                step={1000}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(`${v}`.replace(/,/g, ''))}
                placeholder="ฐานเงินเดือน (บาท)"
              />
            </Form.Item>
          )}
```

- [ ] ตรวจว่า `dayjs` รองรับ `BBBB` (พ.ศ.) — ถ้ายังไม่มี plugin ให้เพิ่มท้าย import ของไฟล์

```tsx
import buddhistEra from 'dayjs/plugin/buddhistEra'
dayjs.extend(buddhistEra)
```

### Step 10: push schema แล้วรัน test

- [ ] Run: `npx playwright test e2e/jobs/driver-salary.spec.ts --workers=1`
  (`global-setup` จะ `prisma db push` ให้เองอัตโนมัติ ไม่ต้อง migrate มือ)
- [ ] Expected: PASS ทั้ง 4 case
- [ ] ถ้า Case 1 fail ที่การกรอกวันที่ ให้เปลี่ยนวิธีกรอกเป็นคลิกเลือกจากปฏิทินแทนการ `fill()` (antd DatePicker กับ format พ.ศ. บางครั้งไม่รับ typed input)

### Step 11: ตรวจว่า test เดิมไม่พัง

- [ ] Run: `npx playwright test --workers=1`
- [ ] Expected: PASS ทั้งหมด (ยกเว้น `"อัตราค่าเที่ยวคนขับ Case 1"` ที่ flaky อยู่ก่อนแล้ว — ถ้า fail ให้รันซ้ำเฉพาะตัวนั้นเพื่อยืนยันว่าเป็น flake เดิม ไม่ใช่ของใหม่)

### Step 12: Commit

- [ ] Run:

```bash
git add prisma/schema.prisma types/job.ts app/api/drivers components/jobs/DriverManager.tsx "app/(protected)/jobs/settings/drivers/page.tsx" e2e/scripts/seed.ts e2e/jobs/driver-salary.spec.ts
git commit -m "$(cat <<'EOF'
feat(drivers): เพิ่มฐานเงินเดือน (ADMIN เท่านั้น) และวันเริ่มงาน

ฐานเงินเดือนกรองที่ API ทั้ง GET/POST/PATCH ไม่ใช่แค่ซ่อนใน UI
เพื่อไม่ให้ MANAGER เห็นหรือแก้ผ่าน API ได้

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] Run: `make migrate-stag` เพื่อ push schema ขึ้น staging

---

## Task 3: ตัวคำนวณสรุป + helper วันที่ไทย

**Files:**
- Create: `lib/utils/thaiDate.ts`, `lib/utils/summaryCalculator.ts`
- Test: `lib/utils/__tests__/summaryCalculator.test.ts`

**Interfaces:**
- Produces: `toThaiMonthYear(month: string): string` → `'กรกฎาคม 69'`
- Produces: `toPayDate(month: string): string` → `'15/8/69'`
- Produces: `toThaiShortDate(date: Date | string | null): string` → `'25/8/68'` หรือ `''`
- Produces: `calculateDriverSummary(input: SummaryInput): DriverMonthlySummary`
- Produces: type `DriverMonthlySummary` (export จาก `types/job.ts`)

### Step 1: ตรวจว่ามี test runner หรือยัง

- [ ] Run: `grep -n '"test"\|vitest\|jest' package.json`
- [ ] ถ้า**ไม่มี** unit test runner: ข้าม Step 2-5 ของ task นี้ไปเลย แล้วเขียน `summaryCalculator.ts` ตรงๆ ตาม Step 4 โดยยืนยันความถูกต้องผ่าน E2E ใน Task 6 แทน (โปรเจกต์นี้ใช้ Playwright เป็นหลัก การเพิ่ม runner ใหม่อยู่นอกขอบเขตงานนี้)
- [ ] ถ้า**มี**: ทำต่อตามปกติ

### Step 2: เพิ่ม type

- [ ] เพิ่มท้าย `types/job.ts`

```typescript
/** สรุปงานคนขับ 1 คน 1 เดือน — ช่องที่ระบบไม่มีข้อมูลจะเป็น null (เว้นว่างใน Excel ให้กรอกเอง) */
export interface DriverMonthlySummary {
  month: string;              // 'YYYY-MM'
  driverId: string;
  driverName: string;
  vehicleNumber: string | null;
  groupName: string | null;
  startDate: string | null;

  leaveDays: number;          // ลาหยุด
  repairDays: number;         // ซ่อมรถ
  jobTrips: number;           // งาน (เที่ยว)
  towingTrips: number;        // ทอย (เที่ยว)

  income: number;             // รายได้
  fuelPricePerLiter: number | null;
  fuelLiters: number;         // จำนวนน้ำมัน
  driverWage: number;         // ค่าเที่ยว
  baseSalary: number | null;  // เงินเดือน
}
```

### Step 3: เขียน test ที่ fail

- [ ] Create `lib/utils/__tests__/summaryCalculator.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { calculateDriverSummary } from '../summaryCalculator'
import { toThaiMonthYear, toPayDate, toThaiShortDate } from '../thaiDate'

describe('thaiDate', () => {
  it('แปลงเดือนเป็นชื่อไทย + ปี พ.ศ. 2 หลัก', () => {
    expect(toThaiMonthYear('2026-07')).toBe('กรกฎาคม 69')
    expect(toThaiMonthYear('2026-01')).toBe('มกราคม 69')
  })

  it('วันจ่ายคือวันที่ 15 ของเดือนถัดไป', () => {
    expect(toPayDate('2026-07')).toBe('15/8/69')
    expect(toPayDate('2026-06')).toBe('15/7/69')
  })

  it('วันจ่ายของเดือน ธ.ค. ข้ามไปปีถัดไป', () => {
    expect(toPayDate('2026-12')).toBe('15/1/70')
  })

  it('แปลงวันที่สั้นเป็น พ.ศ.', () => {
    expect(toThaiShortDate('2025-08-25')).toBe('25/8/68')
    expect(toThaiShortDate(null)).toBe('')
  })
})

describe('calculateDriverSummary', () => {
  const base = {
    month: '2026-07',
    driver: {
      id: 'd1',
      name: 'ประวิทย์ กันภัย',
      vehicleNumber: 'SYL 50',
      groupName: 'กลุ่ม 1',
      startDate: '2025-08-25',
      baseSalary: 9000,
    },
    leaveCount: 0,
    fuelPricePerLiter: 36,
  }

  it('นับงานแยกตามประเภท และไม่นับงานที่ยกเลิก', () => {
    const result = calculateDriverSummary({
      ...base,
      jobs: [
        { jobType: 'inbound', noJobReason: null, isCancelled: false, income: 100, driverWage: 10, fuelOfficeLiters: 1, fuelCashLiters: 0, fuelCreditLiters: 0 },
        { jobType: 'outbound', noJobReason: null, isCancelled: false, income: 200, driverWage: 20, fuelOfficeLiters: 0, fuelCashLiters: 2, fuelCreditLiters: 0 },
        { jobType: 'towing', noJobReason: null, isCancelled: false, income: 50, driverWage: 5, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 3 },
        { jobType: 'noJob', noJobReason: 'repair', isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
        // งานที่ยกเลิก ต้องไม่ถูกนับในทุกช่อง
        { jobType: 'inbound', noJobReason: null, isCancelled: true, income: 9999, driverWage: 999, fuelOfficeLiters: 99, fuelCashLiters: 0, fuelCreditLiters: 0 },
      ],
    })

    expect(result.jobTrips).toBe(2)      // inbound + outbound
    expect(result.towingTrips).toBe(1)
    expect(result.repairDays).toBe(1)
    expect(result.income).toBe(350)
    expect(result.driverWage).toBe(35)
    expect(result.fuelLiters).toBe(6)    // 1 + 2 + 3
  })

  it('นับ flatbed และ mill รวมเป็น "งาน"', () => {
    const result = calculateDriverSummary({
      ...base,
      jobs: [
        { jobType: 'flatbed', noJobReason: null, isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
        { jobType: 'mill', noJobReason: null, isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      ],
    })
    expect(result.jobTrips).toBe(2)
  })

  it('noJob ที่ไม่ใช่ซ่อมรถ ไม่นับเป็นซ่อมรถ', () => {
    const result = calculateDriverSummary({
      ...base,
      jobs: [
        { jobType: 'noJob', noJobReason: 'lowVolume', isCancelled: false, income: 0, driverWage: 0, fuelOfficeLiters: 0, fuelCashLiters: 0, fuelCreditLiters: 0 },
      ],
    })
    expect(result.repairDays).toBe(0)
    expect(result.jobTrips).toBe(0)
  })

  it('คนขับไม่มีงานเลย ได้ผลเป็น 0 ทุกช่อง ไม่ throw', () => {
    const result = calculateDriverSummary({ ...base, jobs: [] })
    expect(result.jobTrips).toBe(0)
    expect(result.income).toBe(0)
    expect(result.fuelLiters).toBe(0)
    expect(result.baseSalary).toBe(9000)
  })

  it('ส่งต่อข้อมูลคนขับและวันลา', () => {
    const result = calculateDriverSummary({ ...base, leaveCount: 3, jobs: [] })
    expect(result.leaveDays).toBe(3)
    expect(result.driverName).toBe('ประวิทย์ กันภัย')
    expect(result.groupName).toBe('กลุ่ม 1')
    expect(result.fuelPricePerLiter).toBe(36)
  })
})
```

### Step 4: รัน test ให้เห็นว่า fail

- [ ] Run: `npx vitest run lib/utils/__tests__/summaryCalculator.test.ts`
- [ ] Expected: FAIL — module ไม่มีอยู่

### Step 5: เขียน thaiDate.ts

- [ ] Create `lib/utils/thaiDate.ts`

```typescript
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** '2026-07' → 'กรกฎาคม 69' (ชื่อเดือนไทย + ปี พ.ศ. 2 หลัก) */
export function toThaiMonthYear(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const buddhistYear = (year + 543) % 100;
  return `${THAI_MONTHS[mon - 1]} ${String(buddhistYear).padStart(2, "0")}`;
}

/**
 * วันจ่ายเงินเดือน = วันที่ 15 ของเดือนถัดจากเดือนที่สรุป
 * '2026-07' → '15/8/69' (จ่ายเงินเดือน ก.ค. ในวันที่ 15 ส.ค.)
 */
export function toPayDate(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const payMonth = mon === 12 ? 1 : mon + 1;
  const payYear = mon === 12 ? year + 1 : year;
  const buddhistYear = (payYear + 543) % 100;
  return `15/${payMonth}/${String(buddhistYear).padStart(2, "0")}`;
}

/** Date → '25/8/68' (D/M/YY พ.ศ.) — คืนสตริงว่างถ้าไม่มีค่า */
export function toThaiShortDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const buddhistYear = (d.getUTCFullYear() + 543) % 100;
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${String(buddhistYear).padStart(2, "0")}`;
}
```

### Step 6: เขียน summaryCalculator.ts

- [ ] Create `lib/utils/summaryCalculator.ts`

```typescript
import type { DriverMonthlySummary } from "@/types/job";

/** ลักษณะงานที่นับเป็น "งาน" ในสรุป — ทอยตู้แยกนับต่างหาก */
const MAIN_JOB_TYPES = ["inbound", "outbound", "flatbed", "mill"];

export interface SummaryJobInput {
  jobType: string;
  noJobReason: string | null;
  isCancelled: boolean;
  income: number | null;
  driverWage: number | null;
  fuelOfficeLiters: number | null;
  fuelCashLiters: number | null;
  fuelCreditLiters: number | null;
}

export interface SummaryInput {
  month: string;
  driver: {
    id: string;
    name: string;
    vehicleNumber: string | null;
    groupName: string | null;
    startDate: string | null;
    baseSalary: number | null;
  };
  jobs: SummaryJobInput[];
  leaveCount: number;
  fuelPricePerLiter: number | null;
}

export function calculateDriverSummary(input: SummaryInput): DriverMonthlySummary {
  const { month, driver, jobs, leaveCount, fuelPricePerLiter } = input;

  // งานที่ยกเลิกไม่นับในทุกช่อง
  const active = jobs.filter((j) => !j.isCancelled);

  const num = (v: number | null) => Number(v ?? 0);

  return {
    month,
    driverId: driver.id,
    driverName: driver.name,
    vehicleNumber: driver.vehicleNumber,
    groupName: driver.groupName,
    startDate: driver.startDate,

    leaveDays: leaveCount,
    // ซ่อมรถเก็บในรูปงานประเภท "ไม่มีงาน" ที่มีเหตุผลเป็น repair
    repairDays: active.filter((j) => j.jobType === "noJob" && j.noJobReason === "repair").length,
    jobTrips: active.filter((j) => MAIN_JOB_TYPES.includes(j.jobType)).length,
    towingTrips: active.filter((j) => j.jobType === "towing").length,

    income: active.reduce((sum, j) => sum + num(j.income), 0),
    fuelPricePerLiter,
    fuelLiters: active.reduce(
      (sum, j) => sum + num(j.fuelOfficeLiters) + num(j.fuelCashLiters) + num(j.fuelCreditLiters),
      0
    ),
    driverWage: active.reduce((sum, j) => sum + num(j.driverWage), 0),
    baseSalary: driver.baseSalary,
  };
}
```

### Step 7: รัน test ให้ผ่าน

- [ ] Run: `npx vitest run lib/utils/__tests__/summaryCalculator.test.ts`
- [ ] Expected: PASS ทุก case

### Step 8: Commit

- [ ] Run:

```bash
git add lib/utils/thaiDate.ts lib/utils/summaryCalculator.ts lib/utils/__tests__ types/job.ts
git commit -m "$(cat <<'EOF'
feat(summary): ตัวคำนวณสรุปงานคนขับรายเดือน + helper วันที่ไทย

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: API สรุปงาน

**Files:**
- Create: `app/api/summary/route.ts`, `app/api/summary/[driverId]/route.ts`
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: `calculateDriverSummary`, `SummaryInput` จาก Task 3
- Produces: `GET /api/summary?month=YYYY-MM` → `DriverMonthlySummary[]`
- Produces: `GET /api/summary/[driverId]?from=YYYY-MM&to=YYYY-MM` → `DriverMonthlySummary[]` (เรียงเดือนล่าสุดก่อน)

### Step 1: กัน /summary ที่ middleware

- [ ] เปิด `lib/auth.ts` หา `authorized({ auth, request: { nextUrl } })` เพิ่ม block ถัดจาก block `"Admin-only routes"`

```typescript
      // สรุปงาน — ADMIN เท่านั้น (ข้อมูลเงินเดือน)
      if (pathname.startsWith("/summary") && role !== "ADMIN") {
        return Response.redirect(new URL(defaultPage, nextUrl))
      }
```

- [ ] ตรวจว่า block ของ SENIOR_STAFF/STAFF ที่อยู่ด้านล่างกัน `/summary` อยู่แล้ว (เพราะ whitelist ไม่มี `/summary`) — ถ้าใช่ไม่ต้องแก้อะไรเพิ่ม

### Step 2: สร้าง helper ดึงข้อมูลสรุป

- [ ] Create `app/api/summary/route.ts`

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDriverSummary } from "@/lib/utils/summaryCalculator";
import type { DriverMonthlySummary } from "@/types/job";

/** ดึงสรุปของคนขับหลายคนในเดือนเดียว — ใช้ร่วมกับ export route */
export async function buildMonthSummaries(
  month: string,
  driverIds?: string[]
): Promise<DriverMonthlySummary[]> {
  const [year, mon] = month.split("-").map(Number);
  const gte = new Date(Date.UTC(year, mon - 1, 1));
  const lt = new Date(Date.UTC(year, mon, 1));

  // คนขับที่ลาออกแล้วยังเห็นในเดือนที่ลาออก แต่ไม่เห็นตั้งแต่เดือนถัดไป
  const drivers = await prisma.driver.findMany({
    where: {
      isActive: true,
      ...(driverIds ? { id: { in: driverIds } } : {}),
      OR: [{ resignedAt: null }, { resignedAt: { gte } }],
    },
    orderBy: [{ groupName: "asc" }, { name: "asc" }],
  });

  // ราคาน้ำมัน: record ล่าสุดที่มีผลภายในเดือนนั้น
  const fuelLog = await prisma.fuelPriceLog.findFirst({
    where: { effectiveDate: { gte, lt } },
    orderBy: { effectiveDate: "desc" },
  });
  const fuelPricePerLiter = fuelLog ? Number(fuelLog.pricePerLiter) : null;

  const driverIdList = drivers.map((d) => d.id);

  const [jobs, leaves] = await Promise.all([
    prisma.job.findMany({
      where: { driverId: { in: driverIdList }, jobDate: { gte, lt } },
      select: {
        driverId: true,
        jobType: true,
        noJobReason: true,
        isCancelled: true,
        income: true,
        driverWage: true,
        fuelOfficeLiters: true,
        fuelCashLiters: true,
        fuelCreditLiters: true,
      },
    }),
    prisma.driverLeave.groupBy({
      by: ["driverId"],
      where: { driverId: { in: driverIdList }, leaveDate: { gte, lt } },
      _count: { _all: true },
    }),
  ]);

  const jobsByDriver = new Map<string, typeof jobs>();
  for (const job of jobs) {
    if (!job.driverId) continue;
    const list = jobsByDriver.get(job.driverId) ?? [];
    list.push(job);
    jobsByDriver.set(job.driverId, list);
  }

  const leaveByDriver = new Map(leaves.map((l) => [l.driverId, l._count._all]));

  return drivers.map((driver) =>
    calculateDriverSummary({
      month,
      driver: {
        id: driver.id,
        name: driver.name,
        vehicleNumber: driver.vehicleNumber,
        groupName: driver.groupName,
        startDate: driver.startDate ? driver.startDate.toISOString() : null,
        baseSalary: driver.baseSalary != null ? Number(driver.baseSalary) : null,
      },
      jobs: (jobsByDriver.get(driver.id) ?? []).map((j) => ({
        jobType: j.jobType,
        noJobReason: j.noJobReason,
        isCancelled: j.isCancelled,
        income: j.income != null ? Number(j.income) : null,
        driverWage: j.driverWage != null ? Number(j.driverWage) : null,
        fuelOfficeLiters: j.fuelOfficeLiters != null ? Number(j.fuelOfficeLiters) : null,
        fuelCashLiters: j.fuelCashLiters != null ? Number(j.fuelCashLiters) : null,
        fuelCreditLiters: j.fuelCreditLiters != null ? Number(j.fuelCreditLiters) : null,
      })),
      leaveCount: leaveByDriver.get(driver.id) ?? 0,
      fuelPricePerLiter,
    })
  );
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "กรุณาระบุเดือนให้ถูกต้อง (YYYY-MM)" }, { status: 400 });
    }

    return NextResponse.json(await buildMonthSummaries(month));
  } catch (error) {
    console.error("Error fetching summary:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป" }, { status: 500 });
  }
}
```

### Step 3: สร้าง route รายคน

- [ ] Create `app/api/summary/[driverId]/route.ts`

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildMonthSummaries } from "../route";
import { monthsInRange } from "@/lib/utils/monthRange";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  try {
    const { driverId } = await params;
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to") ?? from;

    if (!from || !/^\d{4}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "กรุณาระบุช่วงเดือนให้ถูกต้อง (YYYY-MM)" }, { status: 400 });
    }

    const months = monthsInRange(from, to);
    if (months.length === 0) {
      return NextResponse.json({ error: "ช่วงเดือนไม่ถูกต้อง" }, { status: 400 });
    }

    // เดือนล่าสุดก่อน — ตรงกับลำดับบล็อกใน Excel (ซ้ายสุด = ล่าสุด)
    const results = await Promise.all(
      months.map((m) => buildMonthSummaries(m, [driverId]))
    );
    return NextResponse.json(results.flat());
  } catch (error) {
    console.error("Error fetching driver summary:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป" }, { status: 500 });
  }
}
```

### Step 4: สร้าง monthRange helper

- [ ] Create `lib/utils/monthRange.ts`

```typescript
/**
 * ไล่เดือนในช่วง from..to — คืนเดือนล่าสุดก่อน (ตรงกับลำดับบล็อกใน Excel)
 * จำกัดไม่เกิน 24 เดือน กัน request ที่ใหญ่เกินไป
 */
export function monthsInRange(from: string, to: string, max = 24): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);

  const start = fy * 12 + (fm - 1);
  const end = ty * 12 + (tm - 1);
  if (end < start) return [];

  const months: string[] = [];
  for (let i = end; i >= start && months.length < max; i--) {
    const year = Math.floor(i / 12);
    const mon = (i % 12) + 1;
    months.push(`${year}-${String(mon).padStart(2, "0")}`);
  }
  return months;
}
```

### Step 5: ตรวจว่า build ผ่าน

- [ ] Run: `npx tsc --noEmit`
- [ ] Expected: ไม่มี type error
- [ ] ถ้า import `buildMonthSummaries` จาก `"../route"` ทำให้ Next.js บ่นเรื่อง route export ที่ไม่ใช่ HTTP method ให้ย้าย `buildMonthSummaries` ไปไว้ใน `lib/utils/summaryQuery.ts` แล้ว import จากที่นั่นทั้งสอง route แทน

### Step 6: Commit

- [ ] Run:

```bash
git add app/api/summary lib/utils/monthRange.ts lib/auth.ts
git commit -m "$(cat <<'EOF'
feat(summary): API สรุปงานคนขับ + กัน /summary ให้เฉพาะ ADMIN

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Excel generator

**Files:**
- Create: `lib/utils/summaryExcelGenerator.ts`, `app/api/summary/export/route.ts`

**Interfaces:**
- Consumes: `DriverMonthlySummary` จาก Task 3, `toThaiMonthYear`/`toPayDate`/`toThaiShortDate` จาก Task 3
- Produces: `generateSummaryExcel(sheets: DriverSheetData[]): Promise<Buffer>` โดย `DriverSheetData = { driverName: string; vehicleNumber: string | null; months: DriverMonthlySummary[] }` — ชื่อ sheet generator สร้างเองจาก `driverName + vehicleNumber` ไม่ต้องส่งเข้ามา

### Step 1: เขียน generator

- [ ] Create `lib/utils/summaryExcelGenerator.ts`

```typescript
import ExcelJS from "exceljs";
import type { DriverMonthlySummary } from "@/types/job";
import { toThaiMonthYear, toPayDate, toThaiShortDate } from "./thaiDate";

export interface DriverSheetData {
  driverName: string;
  vehicleNumber: string | null;
  /** เดือนล่าสุดก่อน — บล็อกซ้ายสุดใน sheet */
  months: DriverMonthlySummary[];
}

const FONT = { name: "Courier New", size: 16, bold: true } as const;
const RED = "FFFF0000";
const GREEN = "FF00B050";
const FILL_ORANGE = "FFFFC000";
const FILL_GREEN = "FF92D050";
const FILL_YELLOW = "FFFFFF00";
const FILL_PINK = "FFFCE4D6";
const MONEY_FMT = "#,##0.00";

/**
 * ระยะห่างระหว่างบล็อก = 7 คอลัมน์ (ยืนยันจากไฟล์ต้นฉบับ: label บล็อกแรกอยู่ B=2, บล็อกสองอยู่ I=9)
 * ภายในบล็อก: offset 0 = label, offset 2 = ค่า, offset 3 = หน่วย
 */
const BLOCK_STRIDE = 7;
const LABEL_OFFSET = 0;
const VALUE_OFFSET = 2;
const UNIT_OFFSET = 3;

/** ความกว้างคอลัมน์ 7 คอลัมน์ของ 1 บล็อก (B,C,D,E,F,G,H ของบล็อกแรก) */
const BLOCK_WIDTHS = [35.5, 2.5, 21.5, 10.83, 3, 10.83, 2.83];

/** Excel ห้าม []:*?/\ ในชื่อ sheet และจำกัด 31 ตัวอักษร */
function sanitizeSheetName(name: string, used: Set<string>): string {
  let safe = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  if (used.has(safe)) {
    let i = 2;
    while (used.has(`${safe.slice(0, 28)} ${i}`)) i++;
    safe = `${safe.slice(0, 28)} ${i}`;
  }
  used.add(safe);
  return safe;
}

function buildMonthBlock(
  ws: ExcelJS.Worksheet,
  s: DriverMonthlySummary,
  startCol: number
) {
  // startCol คือคอลัมน์ label (B ของบล็อกแรก = 2)
  const L = startCol + LABEL_OFFSET;   // label
  const V = startCol + VALUE_OFFSET;   // ค่า
  const U = startCol + UNIT_OFFSET;    // หน่วย
  const colLetter = (c: number) => ws.getColumn(c).letter;
  const vCol = colLetter(V);

  const set = (
    row: number,
    col: number,
    value: ExcelJS.CellValue,
    opts: {
      color?: string;
      fill?: string;
      fmt?: string;
      align?: "left" | "right" | "center";
    } = {}
  ) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = { ...FONT, ...(opts.color ? { color: { argb: opts.color } } : {}) };
    if (opts.fill) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    }
    if (opts.fmt) cell.numFmt = opts.fmt;
    if (opts.align) cell.alignment = { horizontal: opts.align, vertical: "middle" };
    return cell;
  };

  // หัวบล็อก
  set(2, L, `เงินเดือน: ${toThaiMonthYear(s.month)}`, { align: "center" });
  set(2, V, `(${toPayDate(s.month)})`, { align: "center" });
  set(2, U, s.groupName ?? "", { fill: FILL_ORANGE, align: "center" });

  set(3, L, s.vehicleNumber ?? "", { align: "right" });
  set(3, V, s.driverName, { align: "left" });
  ws.mergeCells(3, V, 3, U);

  const startText = toThaiShortDate(s.startDate);
  if (startText) {
    set(4, V, `เริ่มขับรับรถ ${startText}`, { align: "center" });
    ws.mergeCells(4, V, 4, U);
  }

  // จำนวนวัน/เที่ยว
  set(5, L, "ลาหยุด", { color: RED, align: "right" });
  set(5, V, s.leaveDays || null, { color: RED, align: "center" });
  set(5, U, "วัน", { color: RED, align: "left" });

  set(6, L, "ซ่อมรถ", { align: "right" });
  set(6, V, s.repairDays || null, { align: "center" });
  set(6, U, "วัน", { align: "left" });

  set(7, L, "งาน", { color: GREEN, align: "right" });
  set(7, V, s.jobTrips || null, { color: GREEN, align: "center" });
  set(7, U, "เที่ยว", { color: GREEN, align: "left" });

  set(8, L, "ทอย", { color: GREEN, align: "right" });
  set(8, V, s.towingTrips || null, { color: GREEN, align: "center" });
  set(8, U, "เที่ยว", { color: GREEN, align: "left" });

  // แบก — ระบบไม่มีข้อมูล เว้นว่างให้กรอกใน Excel
  set(9, L, "แบก", { color: GREEN, align: "right" });
  set(9, U, "เที่ยว", { color: GREEN, align: "left" });

  // ค้างคืน — ระบบไม่มีข้อมูล เว้นว่างให้กรอกใน Excel
  set(10, L, "ค้างคืน", { align: "right" });
  set(10, U, "วัน", { align: "left" });

  // รายได้ + สัดส่วน
  set(12, L, "รายได้", { align: "right" });
  set(12, V, s.income, { fmt: MONEY_FMT });
  set(12, U, "บาท", { align: "left" });

  set(13, L, 0.55, { fmt: "0%", align: "right" });
  set(13, V, { formula: `${vCol}12*55%` }, { fmt: MONEY_FMT });
  set(13, U, "บาท", { align: "left" });

  set(14, L, 0.45, { fmt: "0%", align: "right" });
  set(14, V, { formula: `${vCol}12*45%` }, { fmt: MONEY_FMT });
  set(14, U, "บาท", { align: "left" });

  // น้ำมัน
  set(16, L, "ราคาน้ำมันต่อลิตร", { align: "right" });
  set(16, V, s.fuelPricePerLiter, { fmt: MONEY_FMT });
  set(16, U, "บาท", { align: "left" });

  set(17, L, "จำนวนน้ำมัน", { align: "right" });
  set(17, V, s.fuelLiters, { fmt: MONEY_FMT });
  set(17, U, "ลิตร์", { align: "left" });

  set(18, L, "รวมใช้น้ำมัน", { align: "right" });
  set(18, V, { formula: `${vCol}16*${vCol}17` }, { fmt: MONEY_FMT });
  set(18, U, "บาท", { align: "left" });

  set(20, L, "45% - ราคาน้ำมัน", { fill: FILL_PINK, align: "right" });
  set(20, V, { formula: `${vCol}14-${vCol}18` }, { fill: FILL_PINK, fmt: MONEY_FMT });
  set(20, U, "บาท", { fill: FILL_PINK, align: "left" });

  // ค่าตอบแทน
  set(22, L, "ค่าเที่ยว", { align: "right" });
  set(22, V, s.driverWage, { fmt: MONEY_FMT });
  set(22, U, "บาท", { align: "left" });

  set(23, L, "เงินเดือน", { align: "right" });
  set(23, V, s.baseSalary, { fmt: MONEY_FMT });
  set(23, U, "บาท", { align: "left" });

  // หัก น้ำมัน/หยุด — เว้นว่างให้กรอกใน Excel
  set(24, L, "หัก น้ำมัน/หยุด", { color: RED, align: "right" });
  set(24, U, "บาท", { color: RED, align: "left" });

  set(26, L, "รวม", { align: "right" });
  set(26, V, { formula: `${vCol}22+${vCol}23+${vCol}24` }, { fmt: MONEY_FMT });
  set(26, U, "บาท", { align: "left" });

  // สรุปให้เงินเดือนคนรถ — เว้นว่างให้กรอกเอง (ต้นฉบับเป็นค่าคงที่ ไม่ใช่สูตร)
  set(28, L, "สรุปให้เงินเดือนคนรถ", { fill: FILL_GREEN, align: "right" });
  set(28, V, null, { fill: FILL_GREEN, fmt: MONEY_FMT });
  set(28, U, "บาท", { fill: FILL_GREEN, align: "left" });

  // ค่าใช้จ่ายต่างๆ — เว้นว่างให้กรอกใน Excel
  set(30, L, "ค่าใช่จ่ายต่างๆ", { color: RED, align: "right" });
  set(30, U, "บาท", { color: RED, align: "left" });

  set(32, L, "ยอดคงเหลืองของบริษัท", { fill: FILL_YELLOW, align: "right" });
  set(
    32,
    V,
    { formula: `${vCol}12-${vCol}18-${vCol}28-${vCol}30` },
    { fill: FILL_YELLOW, fmt: MONEY_FMT }
  );
  set(32, U, "บาท", { fill: FILL_YELLOW, align: "left" });
}

export async function generateSummaryExcel(sheets: DriverSheetData[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const usedNames = new Set<string>();

  for (const data of sheets) {
    const rawName = `${data.driverName}${data.vehicleNumber ? ` ${data.vehicleNumber}` : ""}`;
    const ws = wb.addWorksheet(sanitizeSheetName(rawName, usedNames));

    // ความสูงแถวคงที่ทั้ง sheet
    for (let r = 1; r <= 33; r++) ws.getRow(r).height = 24;

    // บล็อกที่ n เริ่มที่คอลัมน์ 2 + n*7 (B=2, I=9, P=16, ...)
    data.months.forEach((summary, idx) => {
      const startCol = 2 + idx * BLOCK_STRIDE;
      BLOCK_WIDTHS.forEach((w, i) => {
        ws.getColumn(startCol + i).width = w;
      });
      buildMonthBlock(ws, summary, startCol);
    });
  }

  // ไม่มี sheet เลย (ไม่มีคนขับตรงเงื่อนไข) — ใส่ sheet ว่างกัน exceljs error
  if (wb.worksheets.length === 0) {
    wb.addWorksheet("ไม่มีข้อมูล").getCell("B2").value = "ไม่พบคนขับตามเงื่อนไขที่เลือก";
  }

  return (await wb.xlsx.writeBuffer()) as Buffer;
}
```

### Step 2: สร้าง export route

- [ ] Create `app/api/summary/export/route.ts`

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildMonthSummaries } from "../route";
import { monthsInRange } from "@/lib/utils/monthRange";
import { generateSummaryExcel, type DriverSheetData } from "@/lib/utils/summaryExcelGenerator";
import { toThaiMonthYear } from "@/lib/utils/thaiDate";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to") ?? from;
    const driverId = searchParams.get("driverId");
    const groupsParam = searchParams.get("groups");

    if (!from || !/^\d{4}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "กรุณาระบุช่วงเดือนให้ถูกต้อง (YYYY-MM)" }, { status: 400 });
    }

    const months = monthsInRange(from, to);
    if (months.length === 0) {
      return NextResponse.json({ error: "ช่วงเดือนไม่ถูกต้อง" }, { status: 400 });
    }

    // ดึงสรุปทุกเดือนในช่วง แล้วจัดกลุ่มตามคนขับ
    const perMonth = await Promise.all(
      months.map((m) => buildMonthSummaries(m, driverId ? [driverId] : undefined))
    );

    const groups = groupsParam ? groupsParam.split(",").filter(Boolean) : [];
    const byDriver = new Map<string, DriverSheetData>();

    for (const monthSummaries of perMonth) {
      for (const s of monthSummaries) {
        // กรองกลุ่ม (ว่าง = ทุกกลุ่ม)
        if (groups.length > 0 && !groups.includes(s.groupName ?? "")) continue;

        const existing = byDriver.get(s.driverId);
        if (existing) {
          existing.months.push(s);
        } else {
          byDriver.set(s.driverId, {
            driverName: s.driverName,
            vehicleNumber: s.vehicleNumber,
            months: [s],
          });
        }
      }
    }

    // months ของแต่ละคนเรียงตาม perMonth อยู่แล้ว (ล่าสุดก่อน)
    const sheets = Array.from(byDriver.values());
    const buffer = await generateSummaryExcel(sheets);

    const groupLabel =
      driverId && sheets.length === 1
        ? sheets[0].driverName
        : groups.length > 0
          ? groups.join(",")
          : "ทุกกลุ่ม";
    const filename = `สรุป${groupLabel} ${toThaiMonthYear(months[0])}.xlsx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("Error exporting summary:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการ export" }, { status: 500 });
  }
}
```

### Step 3: ตรวจไฟล์ที่ generate ออกมาด้วยตาจริง

- [ ] Run: `npm run dev` แล้วเปิดอีก terminal
- [ ] Login เป็น ADMIN ผ่าน browser แล้วเรียก `/api/summary/export?from=2026-07&to=2026-07` ให้ดาวน์โหลดไฟล์
- [ ] เปิดไฟล์เทียบกับ `~/Downloads/สรุปกลุ่ม1 เดือน 7.xlsx` ตรวจว่า: ตำแหน่ง cell ตรงกัน, สูตรคำนวณได้ (ไม่ขึ้น `#REF!`/`#NAME?`), สี/ฟอนต์/ความกว้างใกล้เคียง
- [ ] ตรวจตำแหน่งบล็อกด้วย script (ยืนยันแล้วว่าต้นฉบับใช้ stride 7: label B=2 → I=9, ค่าอยู่ offset +2)

```bash
python3 -c "
import openpyxl
wb = openpyxl.load_workbook('<ไฟล์ที่ generate>.xlsx')
ws = wb.worksheets[0]
cols = [c.column for c in ws[12] if c.value == 'รายได้']
print('label cols:', cols)
print('diffs:', [cols[i+1]-cols[i] for i in range(len(cols)-1)])
assert all(d == 7 for d in [cols[i+1]-cols[i] for i in range(len(cols)-1)]), 'stride ต้องเป็น 7'
print('OK')
"
```

- [ ] Expected: `label cols: [2, 9]` (กรณี 2 เดือน), `diffs: [7]`, พิมพ์ `OK`

### Step 4: Commit

- [ ] Run:

```bash
git add lib/utils/summaryExcelGenerator.ts app/api/summary/export
git commit -m "$(cat <<'EOF'
feat(summary): Excel generator ตามฟอร์มสรุปเงินเดือนคนขับ

แต่ละเดือนเป็นบล็อกเรียงไปทางขวา เดือนล่าสุดซ้ายสุด พร้อมสูตรสด
ช่องที่ระบบไม่มีข้อมูล (แบก/ค้างคืน/หักน้ำมัน/ค่าใช้จ่าย/สรุปเงินเดือน) เว้นว่างให้กรอกเอง

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: หน้า UI สรุปงาน

**Files:**
- Create: `app/(protected)/summary/page.tsx`, `app/(protected)/summary/[driverId]/page.tsx`, `components/summary/SummaryDriverList.tsx`, `components/summary/SummaryDetail.tsx`, `components/summary/ExportRangeModal.tsx`
- Modify: `components/ProtectedLayoutClient.tsx`
- Test: `e2e/summary/summary.spec.ts`, `e2e/scripts/cleanup-summary.ts`

**Interfaces:**
- Consumes: `GET /api/summary`, `GET /api/summary/[driverId]`, `GET /api/summary/export` จาก Task 4-5
- Consumes: `DriverMonthlySummary` จาก Task 3

### Step 1: เขียน E2E test ที่ fail

- [ ] Create `e2e/scripts/cleanup-summary.ts`

```typescript
import { PrismaClient } from '../../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const adapter = new PrismaPg({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
})
const prisma = new PrismaClient({ adapter })

const DRIVER_NAMES = ['Summary Driver A', 'Summary Driver B']

async function main() {
  const drivers = await prisma.driver.findMany({ where: { name: { in: DRIVER_NAMES } } })
  for (const driver of drivers) {
    await prisma.job.deleteMany({ where: { driverId: driver.id } })
    await prisma.driverLeave.deleteMany({ where: { driverId: driver.id } })
    await prisma.driver.delete({ where: { id: driver.id } })
  }
  console.log(`🧹 [Playwright] ลบคนขับทดสอบ summary ${drivers.length} คน`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
```

- [ ] Create `e2e/summary/summary.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import path from 'path'
import dayjs from 'dayjs'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const DRIVER_A = 'Summary Driver A'
const DRIVER_B = 'Summary Driver B'
const GROUP_A = 'กลุ่มสรุป A'
const GROUP_B = 'กลุ่มสรุป B'

async function login(page: import('@playwright/test').Page, username: string) {
  await page.goto('/login')
  await page.getByPlaceholder('ชื่อผู้ใช้').fill(username)
  await page.getByPlaceholder('รหัสผ่าน').fill('admin123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/jobs|\/line-images/, { timeout: 10_000 })
}

async function createDriver(
  page: import('@playwright/test').Page,
  name: string,
  vehicleNumber: string,
  group: string
) {
  await page.goto('/jobs/settings/drivers')
  await page.getByTestId('add-driver-btn').click()
  await page.getByRole('dialog').getByPlaceholder('ชื่อคนขับ').fill(name)
  await page.getByRole('dialog').getByPlaceholder('เบอร์รถ').fill(vehicleNumber)
  await page.locator('#driver-group-name').fill(group)
  await page.getByTestId('driver-submit-btn').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
}

test.describe.serial('สรุปงาน', () => {
  test.afterEach(async () => {
    execSync('npx tsx e2e/scripts/cleanup-summary.ts', {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: path.resolve(__dirname, '../..'),
    })
  })

  test('Case 1: เมนูสรุปงานเห็นเฉพาะ ADMIN', async ({ page }) => {
    await login(page, 'testadmin')
    await expect(page.getByRole('menuitem', { name: 'สรุปงาน' })).toBeVisible()

    await page.goto('/api/auth/signout')
    await login(page, 'testmanager')
    await expect(page.getByRole('menuitem', { name: 'สรุปงาน' })).not.toBeVisible()
  })

  test('Case 2: MANAGER เข้า /summary ตรงๆ ถูก redirect', async ({ page }) => {
    await login(page, 'testmanager')
    await page.goto('/summary')
    await expect(page).not.toHaveURL(/\/summary/)
  })

  test('Case 3: MANAGER ยิง API สรุปงานได้ 403', async ({ page }) => {
    await login(page, 'testmanager')
    const res = await page.request.get(`/api/summary?month=${dayjs().format('YYYY-MM')}`)
    expect(res.status()).toBe(403)
  })

  test('Case 4: หน้า list แสดงทุกกลุ่ม แบ่งหัวข้อตามกลุ่ม', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)
    await createDriver(page, DRIVER_B, 'SUM-02', GROUP_B)

    await page.goto('/summary')
    await expect(page.getByTestId('summary-group-heading').filter({ hasText: GROUP_A })).toBeVisible()
    await expect(page.getByTestId('summary-group-heading').filter({ hasText: GROUP_B })).toBeVisible()
    await expect(page.getByText(DRIVER_A)).toBeVisible()
    await expect(page.getByText(DRIVER_B)).toBeVisible()
  })

  test('Case 5: filter กลุ่มแล้วเหลือเฉพาะกลุ่มที่เลือก', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)
    await createDriver(page, DRIVER_B, 'SUM-02', GROUP_B)

    await page.goto('/summary')
    await expect(page.getByText(DRIVER_B)).toBeVisible()

    await page.locator('#summary-group-filter').click()
    await page.getByTitle(GROUP_A, { exact: true }).click()
    await page.keyboard.press('Escape')

    await expect(page.getByText(DRIVER_A)).toBeVisible()
    await expect(page.getByText(DRIVER_B)).not.toBeVisible()
  })

  test('Case 6: ค้นหาด้วยชื่อ และด้วยเบอร์รถ', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)
    await createDriver(page, DRIVER_B, 'SUM-02', GROUP_B)

    await page.goto('/summary')

    // ค้นด้วยชื่อ
    await page.getByTestId('summary-search-input').fill(DRIVER_A)
    await expect(page.getByText(DRIVER_A)).toBeVisible()
    await expect(page.getByText(DRIVER_B)).not.toBeVisible()

    // ค้นด้วยเบอร์รถ
    await page.getByTestId('summary-search-input').fill('SUM-02')
    await expect(page.getByText(DRIVER_B)).toBeVisible()
    await expect(page.getByText(DRIVER_A)).not.toBeVisible()
  })

  test('Case 7: การ์ดแสดงชื่อกลุ่ม', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)

    await page.goto('/summary')
    const card = page.getByTestId('summary-card').filter({ hasText: DRIVER_A })
    await expect(card).toContainText(GROUP_A)
  })

  test('Case 8: คลิกการ์ดไปหน้ารายคน', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)

    await page.goto('/summary')
    await page.getByTestId('summary-card').filter({ hasText: DRIVER_A }).click()
    await expect(page).toHaveURL(/\/summary\/[a-z0-9]+/)
    await expect(page.getByText(DRIVER_A)).toBeVisible()
    await expect(page.getByText('รายได้')).toBeVisible()
  })

  test('Case 9: download Excel จากหน้า list ได้ไฟล์', async ({ page }) => {
    await login(page, 'testadmin')
    await createDriver(page, DRIVER_A, 'SUM-01', GROUP_A)

    await page.goto('/summary')
    await page.getByTestId('summary-export-btn').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-confirm-btn').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/)
  })
})
```

### Step 2: รัน test ให้เห็นว่า fail

- [ ] Run: `npx playwright test e2e/summary --workers=1`
- [ ] Expected: FAIL — ไม่มีเมนู/หน้า `/summary`

### Step 3: เพิ่มเมนู

- [ ] เปิด `components/ProtectedLayoutClient.tsx` เพิ่ม menu object ถัดจาก `usersMenu`

```tsx
  const summaryMenu = {
    key: "summary",
    icon: <FileTextOutlined />,
    label: <Link href="/summary">สรุปงาน</Link>,
  };
```

- [ ] เพิ่มเข้า `menuItems` ใน `isAdmin` branch (ก่อน `usersMenu`)

```tsx
  const menuItems = isAdmin
    ? [
        ...commonMenuItems,
        summaryMenu,
        stockMenu,
        usersMenu,
      ]
```

- [ ] ตรวจว่า `FileTextOutlined` อยู่ใน import ของ `@ant-design/icons` แล้ว ถ้าไม่มีให้เพิ่ม (ตรวจด้วย `grep -n "FileTextOutlined" components/ProtectedLayoutClient.tsx`)

### Step 4: สร้าง ExportRangeModal

- [ ] Create `components/summary/ExportRangeModal.tsx`

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Modal, DatePicker, App } from 'antd'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export default function ExportRangeModal({
  open,
  defaultMonth,
  onClose,
  buildUrl,
}: {
  open: boolean
  defaultMonth: dayjs.Dayjs
  onClose: () => void
  /** สร้าง URL ของ export API จากช่วงเดือนที่เลือก */
  buildUrl: (from: string, to: string) => string
}) {
  const { message } = App.useApp()
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([defaultMonth, defaultMonth])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setRange([defaultMonth, defaultMonth])
  }, [open, defaultMonth])

  const handleExport = async () => {
    setLoading(true)
    try {
      const url = buildUrl(range[0].format('YYYY-MM'), range[1].format('YYYY-MM'))
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        message.error(err.error || 'เกิดข้อผิดพลาดในการ export')
        return
      }

      // ดึงชื่อไฟล์จาก Content-Disposition ที่ API ตั้งมา
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename\*=UTF-8''(.+)$/)
      const filename = match ? decodeURIComponent(match[1]) : 'สรุปงาน.xlsx'

      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)

      onClose()
    } catch {
      message.error('เกิดข้อผิดพลาดในการ export')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="เลือกช่วงเดือนที่ต้องการ"
      open={open}
      onCancel={onClose}
      onOk={handleExport}
      okText="ดาวน์โหลด"
      cancelText="ยกเลิก"
      confirmLoading={loading}
      okButtonProps={{ 'data-testid': 'export-confirm-btn' } as never}
      destroyOnHidden
    >
      <p style={{ marginBottom: 8, color: '#666' }}>
        แต่ละเดือนจะเป็นบล็อกเรียงไปทางขวาในไฟล์ เดือนล่าสุดอยู่ซ้ายสุด
      </p>
      <RangePicker
        id="export-month-range"
        picker="month"
        value={range}
        onChange={(vals) => {
          if (vals?.[0] && vals?.[1]) setRange([vals[0], vals[1]])
        }}
        format="MMMM YYYY"
        allowClear={false}
        style={{ width: '100%' }}
      />
    </Modal>
  )
}
```

### Step 5: สร้าง SummaryDriverList

- [ ] Create `components/summary/SummaryDriverList.tsx`

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, Row, Col, DatePicker, Select, Input, Spin, Empty, Button, Divider, Tag } from 'antd'
import { TruckOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons'
import { useRouter, useSearchParams } from 'next/navigation'
import type { DriverMonthlySummary } from '@/types/job'
import dayjs from 'dayjs'
import ExportRangeModal from './ExportRangeModal'

const OTHER_GROUP_LABEL = 'กลุ่มอื่นๆ'

function fmt(value: number | null) {
  if (value == null) return '-'
  return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function SummaryCard({
  s,
  onClick,
}: {
  s: DriverMonthlySummary
  onClick: (driverId: string) => void
}) {
  return (
    <Card
      hoverable
      data-testid="summary-card"
      onClick={() => onClick(s.driverId)}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <TruckOutlined style={{ fontSize: 20, color: '#1890ff' }} />
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          {s.driverName}{s.vehicleNumber ? ` (${s.vehicleNumber})` : ''}
        </span>
        <Tag color="blue">{s.groupName ?? OTHER_GROUP_LABEL}</Tag>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <Row gutter={[8, 4]}>
        <Col span={12}><span style={{ color: '#666' }}>งาน</span></Col>
        <Col span={12} style={{ textAlign: 'right', fontWeight: 600 }}>{s.jobTrips} เที่ยว</Col>
        <Col span={12}><span style={{ color: '#666' }}>ทอย</span></Col>
        <Col span={12} style={{ textAlign: 'right', fontWeight: 600 }}>{s.towingTrips} เที่ยว</Col>
        <Col span={12}><span style={{ color: '#666' }}>รายได้</span></Col>
        <Col span={12} style={{ textAlign: 'right', fontWeight: 600, color: '#389e0d' }}>
          {fmt(s.income)} ฿
        </Col>
        <Col span={12}><span style={{ color: '#666' }}>ค่าเที่ยว</span></Col>
        <Col span={12} style={{ textAlign: 'right', color: '#d46b08' }}>{fmt(s.driverWage)} ฿</Col>
      </Row>
    </Card>
  )
}

export default function SummaryDriverList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMonth = searchParams.get('month')

  const [summaries, setSummaries] = useState<DriverMonthlySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(
    initialMonth && dayjs(initialMonth + '-01').isValid() ? dayjs(initialMonth + '-01') : dayjs()
  )
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const [exportOpen, setExportOpen] = useState(false)

  const fetchSummaries = useCallback(async (m: dayjs.Dayjs) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/summary?month=${m.format('YYYY-MM')}`)
      if (res.ok) setSummaries(await res.json())
    } catch {
      console.error('Error fetching summary')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummaries(month)
  }, [month, fetchSummaries])

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    summaries.forEach((s) => set.add(s.groupName ?? OTHER_GROUP_LABEL))
    return Array.from(set).sort().map((g) => ({ label: g, value: g }))
  }, [summaries])

  // กรองด้วยกลุ่ม + คำค้น (ชื่อ หรือ เบอร์รถ) แล้วจัดกลุ่มเป็นหัวข้อ
  const grouped = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    const filtered = summaries.filter((s) => {
      const groupLabel = s.groupName ?? OTHER_GROUP_LABEL
      if (selectedGroups.length > 0 && !selectedGroups.includes(groupLabel)) return false
      if (!q) return true
      return (
        s.driverName.toLowerCase().includes(q) ||
        (s.vehicleNumber ?? '').toLowerCase().includes(q)
      )
    })

    const map = new Map<string, DriverMonthlySummary[]>()
    for (const s of filtered) {
      const key = s.groupName ?? OTHER_GROUP_LABEL
      map.set(key, [...(map.get(key) ?? []), s])
    }

    // กลุ่มอื่นๆ อยู่ท้ายสุดเสมอ
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === OTHER_GROUP_LABEL) return 1
      if (b === OTHER_GROUP_LABEL) return -1
      return a.localeCompare(b, 'th')
    })
  }, [summaries, selectedGroups, searchText])

  const handleCardClick = (driverId: string) => {
    router.push(`/summary/${driverId}?month=${month.format('YYYY-MM')}`)
  }

  const totalShown = grouped.reduce((sum, [, list]) => sum + list.length, 0)

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>สรุปงาน</h1>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button
            data-testid="summary-export-btn"
            icon={<DownloadOutlined />}
            onClick={() => setExportOpen(true)}
          >
            ดาวน์โหลด Excel
          </Button>
          <Input
            data-testid="summary-search-input"
            placeholder="ค้นชื่อคนขับ หรือ เบอร์รถ"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            id="summary-group-filter"
            mode="multiple"
            placeholder="ทุกกลุ่ม"
            value={selectedGroups}
            onChange={setSelectedGroups}
            options={groupOptions}
            allowClear
            style={{ minWidth: 200 }}
            maxTagCount="responsive"
          />
          <DatePicker
            id="summary-month-picker"
            picker="month"
            value={month}
            onChange={(val) => val && setMonth(val)}
            format="MMMM YYYY"
            allowClear={false}
            style={{ width: 180 }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" data-testid="summary-loading" />
        </div>
      ) : totalShown === 0 ? (
        <Empty description={summaries.length === 0 ? 'ไม่มีข้อมูลคนขับ' : 'ไม่พบคนขับตามเงื่อนไข'} />
      ) : (
        grouped.map(([groupName, list]) => (
          <div key={groupName} style={{ marginBottom: 24 }}>
            <h2
              data-testid="summary-group-heading"
              style={{ fontSize: 18, margin: '0 0 12px', borderLeft: '4px solid #1890ff', paddingLeft: 10 }}
            >
              {groupName} <span style={{ fontSize: 14, color: '#888', fontWeight: 400 }}>({list.length} คน)</span>
            </h2>
            <Row gutter={[16, 16]}>
              {list.map((s) => (
                <Col xs={24} sm={12} lg={8} key={s.driverId}>
                  <SummaryCard s={s} onClick={handleCardClick} />
                </Col>
              ))}
            </Row>
          </div>
        ))
      )}

      <ExportRangeModal
        open={exportOpen}
        defaultMonth={month}
        onClose={() => setExportOpen(false)}
        buildUrl={(from, to) => {
          const params = new URLSearchParams({ from, to })
          if (selectedGroups.length > 0) {
            // กลุ่มอื่นๆ ส่งเป็นสตริงว่างให้ API เข้าใจว่าคือคนที่ไม่มีกลุ่ม
            params.set(
              'groups',
              selectedGroups.map((g) => (g === OTHER_GROUP_LABEL ? '' : g)).join(',')
            )
          }
          return `/api/summary/export?${params.toString()}`
        }}
      />
    </div>
  )
}
```

### Step 6: สร้าง SummaryDetail

- [ ] Create `components/summary/SummaryDetail.tsx`

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, DatePicker, Spin, Empty, Button, Row, Col, Divider } from 'antd'
import { DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useRouter, useSearchParams } from 'next/navigation'
import type { DriverMonthlySummary } from '@/types/job'
import dayjs from 'dayjs'
import ExportRangeModal from './ExportRangeModal'

function fmt(value: number | null) {
  if (value == null) return ''
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** แถวหนึ่งในบล็อกสรุป — ช่องที่ระบบไม่มีข้อมูลส่ง value เป็น null จะแสดงว่าง */
function SummaryRow({
  label,
  value,
  unit,
  color,
  background,
}: {
  label: string
  value: string | number | null
  unit: string
  color?: string
  background?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', background, gap: 8 }}>
      <span style={{ flex: 1, textAlign: 'right', color, fontWeight: 600 }}>{label}</span>
      <span style={{ width: 140, textAlign: 'right', color, fontWeight: 600 }}>
        {value ?? ''}
      </span>
      <span style={{ width: 50, color }}>{unit}</span>
    </div>
  )
}

export default function SummaryDetail({ driverId }: { driverId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMonth = searchParams.get('month')

  const [summary, setSummary] = useState<DriverMonthlySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(
    initialMonth && dayjs(initialMonth + '-01').isValid() ? dayjs(initialMonth + '-01') : dayjs()
  )
  const [exportOpen, setExportOpen] = useState(false)

  const fetchSummary = useCallback(
    async (m: dayjs.Dayjs) => {
      setLoading(true)
      try {
        const monthStr = m.format('YYYY-MM')
        const res = await fetch(`/api/summary/${driverId}?from=${monthStr}&to=${monthStr}`)
        if (res.ok) {
          const data: DriverMonthlySummary[] = await res.json()
          setSummary(data[0] ?? null)
        }
      } catch {
        console.error('Error fetching summary')
      } finally {
        setLoading(false)
      }
    },
    [driverId]
  )

  useEffect(() => {
    fetchSummary(month)
  }, [month, fetchSummary])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" data-testid="summary-detail-loading" />
      </div>
    )
  }

  if (!summary) {
    return <Empty description="ไม่พบข้อมูลคนขับ" />
  }

  const fuelTotal =
    summary.fuelPricePerLiter != null ? summary.fuelPricePerLiter * summary.fuelLiters : null
  const pct45 = summary.income * 0.45
  const pct55 = summary.income * 0.55
  const diff45 = fuelTotal != null ? pct45 - fuelTotal : null

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(`/summary?month=${month.format('YYYY-MM')}`)}>
          กลับ
        </Button>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button
            data-testid="summary-detail-export-btn"
            icon={<DownloadOutlined />}
            onClick={() => setExportOpen(true)}
          >
            ดาวน์โหลด Excel
          </Button>
          <DatePicker
            id="summary-detail-month-picker"
            picker="month"
            value={month}
            onChange={(val) => val && setMonth(val)}
            format="MMMM YYYY"
            allowClear={false}
            style={{ width: 180 }}
          />
        </div>
      </div>

      <Card style={{ maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 4, fontSize: 18, fontWeight: 700 }}>
          {summary.driverName}
        </div>
        <div style={{ textAlign: 'center', color: '#888', marginBottom: 16 }}>
          {summary.vehicleNumber ?? ''} · {summary.groupName ?? 'กลุ่มอื่นๆ'}
        </div>

        <SummaryRow label="ลาหยุด" value={summary.leaveDays || null} unit="วัน" color="#cf1322" />
        <SummaryRow label="ซ่อมรถ" value={summary.repairDays || null} unit="วัน" />
        <SummaryRow label="งาน" value={summary.jobTrips || null} unit="เที่ยว" color="#389e0d" />
        <SummaryRow label="ทอย" value={summary.towingTrips || null} unit="เที่ยว" color="#389e0d" />
        <SummaryRow label="แบก" value={null} unit="เที่ยว" color="#389e0d" />
        <SummaryRow label="ค้างคืน" value={null} unit="วัน" />

        <Divider style={{ margin: '12px 0' }} />

        <SummaryRow label="รายได้" value={fmt(summary.income)} unit="บาท" />
        <SummaryRow label="55%" value={fmt(pct55)} unit="บาท" />
        <SummaryRow label="45%" value={fmt(pct45)} unit="บาท" />

        <Divider style={{ margin: '12px 0' }} />

        <SummaryRow label="ราคาน้ำมันต่อลิตร" value={fmt(summary.fuelPricePerLiter)} unit="บาท" />
        <SummaryRow label="จำนวนน้ำมัน" value={fmt(summary.fuelLiters)} unit="ลิตร์" />
        <SummaryRow label="รวมใช้น้ำมัน" value={fmt(fuelTotal)} unit="บาท" />
        <SummaryRow label="45% - ราคาน้ำมัน" value={fmt(diff45)} unit="บาท" background="#fce4d6" />

        <Divider style={{ margin: '12px 0' }} />

        <SummaryRow label="ค่าเที่ยว" value={fmt(summary.driverWage)} unit="บาท" />
        <SummaryRow label="เงินเดือน" value={fmt(summary.baseSalary)} unit="บาท" />
        <SummaryRow label="หัก น้ำมัน/หยุด" value={null} unit="บาท" color="#cf1322" />
        <SummaryRow label="สรุปให้เงินเดือนคนรถ" value={null} unit="บาท" background="#d9f7be" />
        <SummaryRow label="ค่าใช่จ่ายต่างๆ" value={null} unit="บาท" color="#cf1322" />
        <SummaryRow label="ยอดคงเหลืองของบริษัท" value={null} unit="บาท" background="#ffffb8" />

        <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
          ช่องที่เว้นว่างยังไม่มีข้อมูลในระบบ — กรอกได้ในไฟล์ Excel ที่ดาวน์โหลด
        </div>
      </Card>

      <ExportRangeModal
        open={exportOpen}
        defaultMonth={month}
        onClose={() => setExportOpen(false)}
        buildUrl={(from, to) => `/api/summary/export?from=${from}&to=${to}&driverId=${driverId}`}
      />
    </div>
  )
}
```

### Step 7: สร้างหน้า server component

- [ ] Create `app/(protected)/summary/page.tsx`

```tsx
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SummaryDriverList from '@/components/summary/SummaryDriverList'

export default async function SummaryPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    redirect('/jobs')
  }
  return (
    <Suspense>
      <SummaryDriverList />
    </Suspense>
  )
}
```

- [ ] Create `app/(protected)/summary/[driverId]/page.tsx`

```tsx
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SummaryDetail from '@/components/summary/SummaryDetail'

export default async function SummaryDetailPage({
  params,
}: {
  params: Promise<{ driverId: string }>
}) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    redirect('/jobs')
  }
  const { driverId } = await params
  return (
    <Suspense>
      <SummaryDetail driverId={driverId} />
    </Suspense>
  )
}
```

### Step 8: รัน test ให้ผ่าน

- [ ] Run: `npx playwright test e2e/summary --workers=1`
- [ ] Expected: PASS ทั้ง 9 case
- [ ] ถ้า Case 5 fail ที่การเลือกใน Select ให้ลองเปลี่ยนเป็น `await page.getByRole('option', { name: GROUP_A }).click()` แทน `getByTitle`

### Step 9: รัน test ทั้งหมดกันของเดิมพัง

- [ ] Run: `npx playwright test --workers=1`
- [ ] Expected: PASS ทั้งหมด (ยกเว้น flake เดิมของ "อัตราค่าเที่ยวคนขับ Case 1")

### Step 10: ตรวจ build

- [ ] Run: `npm run build`
- [ ] Expected: build สำเร็จ ไม่มี type error

### Step 11: Commit

- [ ] Run:

```bash
git add "app/(protected)/summary" components/summary components/ProtectedLayoutClient.tsx e2e/summary e2e/scripts/cleanup-summary.ts
git commit -m "$(cat <<'EOF'
feat(summary): หน้าสรุปงานคนขับ (ADMIN เท่านั้น)

หน้า list แสดงทุกกลุ่มแบ่งหัวข้อ กรองกลุ่มได้หลายกลุ่ม ค้นชื่อ/เบอร์รถ ไม่มี pagination
หน้ารายคนแสดงบล็อกสรุป ทั้งสองหน้าดาวน์โหลด Excel เลือกช่วงเดือนได้

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: ตรวจงานรวม

**Files:** ไม่มีไฟล์ใหม่ — เป็นการตรวจสอบ

### Step 1: ตรวจสิทธิ์ครบทุกชั้น

- [ ] Run: `npm run dev`
- [ ] Login เป็น `testmanager` แล้วตรวจ:
  - เมนู "สรุปงาน" ไม่โผล่
  - พิมพ์ `/summary` ที่ URL → ถูก redirect
  - `/jobs/settings/drivers` ไม่มีคอลัมน์ฐานเงินเดือน แต่มีคอลัมน์วันเริ่มงาน
- [ ] Login เป็น `testadmin` แล้วตรวจว่าเห็นครบทุกอย่าง

### Step 2: ตรวจไฟล์ Excel ที่ได้จริง

- [ ] ดาวน์โหลดจากหน้า list เลือกช่วง 2 เดือน
- [ ] เปิดไฟล์เทียบกับ `~/Downloads/สรุปกลุ่ม1 เดือน 7.xlsx`:
  - แต่ละ sheet = 1 คนขับ ชื่อ sheet ถูกต้อง
  - บล็อกเดือนที่ 2 อยู่ตำแหน่งคอลัมน์เดียวกับต้นฉบับ
  - สูตรทุกตัวคำนวณได้ ไม่มี `#REF!` / `#NAME?` / `#VALUE!`
  - กรอกค่าลงช่อง "สรุปให้เงินเดือนคนรถ" แล้ว "ยอดคงเหลืองของบริษัท" อัปเดตตาม
  - กรอกค่าลงช่อง "หัก น้ำมัน/หยุด" แล้วแถว "รวม" อัปเดตตาม

### Step 3: ตรวจด้วย detect_changes

- [ ] Run: `node .gitnexus/run.cjs analyze` (อัปเดต index ก่อน)
- [ ] เรียก `detect_changes({scope: "compare", base_ref: "main"})` ตรวจว่าไม่มี symbol ที่ไม่คาดคิดถูกกระทบ

### Step 4: Migration ขึ้น staging

- [ ] Run: `make migrate-stag`
- [ ] Expected: push schema สำเร็จ

---

## Self-Review Notes

**ความครอบคลุมของ spec** — ตรวจแล้วทุกหัวข้อใน spec มี task รองรับ:
- ส่วนที่ 1 (baseSalary/startDate) → Task 2
- ส่วนที่ 2 (เมนูสรุปงาน) → Task 3, 4, 5, 6
- ส่วนที่ 3 (bug ค้นหา) → Task 1
- Testing → E2E ใน Task 1, 2, 6 + ตรวจมือใน Task 7

**จุดที่ต้องระวังระหว่างทำ**
1. **`buildMonthSummaries` export จาก route file** — Next.js อาจไม่ยอมให้ export ฟังก์ชันที่ไม่ใช่ HTTP method จาก route handler Task 4 Step 5 มีแผนสำรองย้ายไป `lib/utils/summaryQuery.ts`
2. **unit test runner** — โปรเจกต์อาจไม่มี vitest/jest Task 3 Step 1 มีทางแยกให้ข้ามไปพึ่ง E2E แทน
3. **DatePicker พ.ศ. ใน E2E** — การ `fill()` วันที่รูปแบบ พ.ศ. อาจไม่ทำงาน Task 2 Step 10 มีทางแก้เป็นคลิกเลือกจากปฏิทิน
