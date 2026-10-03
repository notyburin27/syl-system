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
- **ตาราง**: `<Table>` ทุกตัวต้องใส่ `size="small"` เสมอ

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

### Test database (Docker)
E2E รันบน Postgres ใน docker ไม่ใช่ DB บนคลาวด์ — `global-setup` ทำ
`prisma db push --accept-data-loss` + seed ทุกครั้งที่รัน

```bash
# สร้าง container (ครั้งแรก หรือหลังลบทิ้ง) — restart เองหลัง reboot
docker run -d --name syl-e2e-db --restart unless-stopped \
  -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2epass -e POSTGRES_DB=syl_e2e \
  -p 5442:5432 postgres:16-alpine

npx playwright test --workers=1        # ต้อง workers=1 (spec ใช้ชื่อ driver ซ้ำกัน)
```

`.env.test` (gitignore) ต้องมี `DATABASE_URL="postgresql://e2e:e2epass@localhost:5442/syl_e2e"`
— `lib/prisma.ts` ปิด SSL อัตโนมัติเมื่อ host เป็น localhost/127.0.0.1

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

This project is indexed by GitNexus as **syl-system**.

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/syl-system/context` | Codebase overview, check index freshness |
| `gitnexus://repo/syl-system/clusters` | All functional areas |
| `gitnexus://repo/syl-system/processes` | All execution flows |
| `gitnexus://repo/syl-system/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
