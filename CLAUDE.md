# SYL System - Project Conventions

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **UI**: Ant Design (antd) v5 with Thai locale (th_TH), Font: Kanit
- **Database**: PostgreSQL via Prisma ORM v6
- **Auth**: NextAuth v5 (JWT, 24hr expiry, Credentials provider)
- **Language**: TypeScript

## Project Structure
```
app/
  (auth)/           # Login page (public)
  (protected)/      # All authenticated pages
  api/              # REST API routes
components/         # Reusable React components
hooks/              # Custom React hooks
lib/                # Core utilities (auth, prisma, etc.)
types/              # TypeScript interfaces
prisma/             # Database schema
```

## Coding Patterns

### Pages
- Client components use `'use client'` directive
- State management: `useState`, `useEffect` (no external state library)
- Form state: `Form.useForm()` from antd
- Notifications: `App.useApp().message` from antd

### API Routes
- Auth check: `const session = await auth(); if (!session?.user) return 401`
- Response: `NextResponse.json(data)` or `NextResponse.json({ error: '...' }, { status: 4xx })`
- Error messages in Thai
- Prisma for all DB operations

### Database
- Models use `@@map("table_name")` for table names
- IDs: `@id @default(cuid())`
- Timestamps: `createdAt @default(now())`, `updatedAt @updatedAt`
- Soft delete pattern: `isActive Boolean @default(true)`

### Auth Roles
- `ADMIN`: Full access including user management
- `STAFF`: Standard access

## Commands
```bash
make dev              # Copy .env.stag → .env.local แล้วรัน dev server
make dev-prod         # Copy .env.prod → .env.local แล้วรัน dev server
make migrate-stag     # Push Prisma schema ไป staging DB
make migrate-prod     # Push Prisma schema ไป production DB
npx prisma generate   # Generate Prisma client
npm run build         # Production build
```

## Environment Files
- `.env.stag` — Staging environment (ใช้กับ `make dev`)
- `.env.prod` — Production environment (ใช้กับ `make dev-prod`)
- `.env.local` — Auto-generated จาก make commands (ห้าม commit)

## E2E Testing (Playwright)

### data-testid กับ antd components
- **Button, Input**: ใส่ `data-testid` โดยตรงได้ → `<Button data-testid="...">`
- **Modal**: อย่าใส่ `data-testid` บน `<Modal>` เพราะ antd render root div อยู่ตลอดแม้ `open={false}` ทำให้ `toBeVisible()` fail ให้ใช้ `page.getByRole('dialog')` แทน
- **DatePicker**: ใส่ `id` prop → `<DatePicker id="my-picker">` แล้ว test ใช้ `page.locator('#my-picker')` (antd render `id` ลงบน input โดยตรง)
- **Select**: ใส่ `id` prop → `<Select id="my-select">` แล้ว test ใช้ `page.locator('#my-select')` (antd render `id` ลงบน hidden input โดยตรง, click ที่ selector ได้เลย)
- **อย่าครอบ DatePicker/Select ด้วย `<div data-testid>`** เพราะ click บน div ไม่ส่ง focus ไปยัง antd form store ทำให้ validation fail เงียบๆ

### แนวทางทั่วไป
- ใช้ `getByTestId` สำหรับ elements ที่ role/text ไม่ unique หรือ selector เปราะ (antd class)
- ใช้ `getByRole` + `name` สำหรับปุ่มที่มีข้อความชัดเจน
- ใช้ `getByPlaceholder` สำหรับ input ที่มี placeholder

## LINE Bot
- Webhook: `POST /api/line/webhook` (ไม่ต้อง session auth ใช้ LINE signature แทน)
- รูปภาพถูก upload ขึ้น DigitalOcean Spaces folder `line-images/YYYY-MM/`
- DB เก็บแค่ URL + metadata (sender, group, timestamp)
- UI เรียกดูได้ที่ `/line-images` (ทั้ง ADMIN และ STAFF เข้าได้)
