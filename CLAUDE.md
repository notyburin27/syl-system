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
npx prisma migrate dev    # Apply schema changes
npx prisma generate       # Generate Prisma client
npm run dev               # Start dev server
npm run build             # Production build
```
