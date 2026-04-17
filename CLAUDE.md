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

## LINE Bot
- Webhook: `POST /api/line/webhook` (ไม่ต้อง session auth ใช้ LINE signature แทน)
- รูปภาพถูก upload ขึ้น DigitalOcean Spaces folder `line-images/YYYY-MM/`
- DB เก็บแค่ URL + metadata (sender, group, timestamp)
- UI เรียกดูได้ที่ `/line-images` (ทั้ง ADMIN และ STAFF เข้าได้)
