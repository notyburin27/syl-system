# SYL System - Project Conventions

## Communication
- **ตอบกลับผู้ใช้เป็นภาษาไทยเสมอ** (อธิบาย, ถามคำถาม, สรุปงาน ใช้ภาษาไทยทั้งหมด)

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
- Confirm การลบ/action สำคัญ: ใช้ `App.useApp().modal` → `modal.confirm({...})` (ไม่ใช้ `Popconfirm`)

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
- `ADMIN`: Full access — user management, stock, all jobs settings (incl. rates/fuel)
- `MANAGER`: Same as ADMIN minus user management and stock
- `SENIOR_STAFF`: Jobs (list + customers/drivers/locations/transfer-rates), LINE images, work orders
- `STAFF`: LINE images, work orders only

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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **syl-system**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/syl-system/context` | Codebase overview, check index freshness |
| `gitnexus://repo/syl-system/clusters` | All functional areas |
| `gitnexus://repo/syl-system/processes` | All execution flows |
| `gitnexus://repo/syl-system/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
