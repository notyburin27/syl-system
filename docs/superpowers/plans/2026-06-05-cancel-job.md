# Cancel Job (ยกเลิกใบงาน) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted `isCancelled` flag on Job, exposed as a "ยกเลิกใบงาน" checkbox in the job modal footer, that voids the driver's closing fees in the ส่วนต่าง (difference) calculation so cancelled jobs show ส่วนต่าง = −(completed transfers).

**Architecture:** One boolean column on `Job`. The difference formula is duplicated in three places (modal, table, Excel export); each gets the same one-line substitution: when `isCancelled`, treat driver-overall as `0` for difference only. รวมยอดโอน and the driver summary stay untouched. The PATCH API whitelists the new field; cancelled rows render with a red row class; the export adds a "ยกเลิก" `✓` column.

**Tech Stack:** Next.js 15, Prisma 6 (PostgreSQL), Ant Design v5, TypeScript.

**Verification gate (no unit-test framework wired in):** every task verifies with `npx tsc --noEmit` and, where UI/lint matters, `npm run lint`. The spec's behavior is verified by reasoning about the exact formula in each task plus a final manual smoke test.

**Spec:** `docs/superpowers/specs/2026-06-05-cancel-job-design.md`

---

### Task 1: Add `isCancelled` to the Prisma schema and push

**Files:**
- Modify: `prisma/schema.prisma:271` (Status fields group, next to `clearStatus`)

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, inside `model Job`, find the "Status fields" block:

```prisma
  // Status fields
  clearStatus       Boolean   @default(false)
  statementVerified Boolean   @default(false)
```

Change it to:

```prisma
  // Status fields
  clearStatus       Boolean   @default(false)
  statementVerified Boolean   @default(false)
  isCancelled       Boolean   @default(false)
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" success message.

- [ ] **Step 3: Push the schema to staging DB**

Run: `make migrate-stag`
Expected: Prisma reports the `Job` table altered with the new `isCancelled` column, no data loss warning beyond the added column.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The generated client now knows `isCancelled`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma app/generated/prisma
git commit -m "feat: add isCancelled column to Job model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add `isCancelled` to the TypeScript Job type and table RowData

**Files:**
- Modify: `types/job.ts:119` (Job interface, near `clearStatus`)
- Modify: `components/jobs/EditableJobTable.tsx:67` (RowData fields, near `clearStatus`)

- [ ] **Step 1: Add to the `Job` interface**

In `types/job.ts`, find:

```ts
  clearStatus: boolean;
  statementVerified: boolean;
```

Change to:

```ts
  clearStatus: boolean;
  statementVerified: boolean;
  isCancelled: boolean;
```

- [ ] **Step 2: Add to `RowData` in the table**

In `components/jobs/EditableJobTable.tsx`, find:

```ts
  clearStatus: boolean
  statementVerified: boolean
}
```

Change to:

```ts
  clearStatus: boolean
  statementVerified: boolean
  isCancelled: boolean
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add types/job.ts components/jobs/EditableJobTable.tsx
git commit -m "feat: add isCancelled to Job type and table RowData

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Whitelist `isCancelled` in the PATCH API

**Files:**
- Modify: `app/api/jobs/[id]/route.ts:102` (allowedFields array)

- [ ] **Step 1: Add the field to `allowedFields`**

In `app/api/jobs/[id]/route.ts`, find the end of the `allowedFields` array:

```ts
      "remarks",
      "carryOverToJobId",
    ];
```

Change to:

```ts
      "remarks",
      "carryOverToJobId",
      "isCancelled",
    ];
```

The existing loop copies it straight through (plain boolean, no special parsing needed).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/jobs/[id]/route.ts
git commit -m "feat: allow patching isCancelled on job

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Apply the cancel rule to the table's difference computation + red row

**Files:**
- Modify: `components/jobs/EditableJobTable.tsx:481-487` (`computeDifference`)
- Modify: `components/jobs/EditableJobTable.tsx:1049-1056` (`rowClassName`)
- Modify: `components/jobs/EditableJobTable.tsx:1152` (style block, add `.cancelled-row` rules)

**Note on the `null` nuance:** `computeDriverOverall` returns `null` when a job has no fees. A cancelled job may have a transfer but no fees, and we still want ส่วนต่าง = −completed. So when `isCancelled` we must NOT early-return on a `null` overall — we substitute `0`.

- [ ] **Step 1: Rewrite `computeDifference` to honor `isCancelled`**

In `components/jobs/EditableJobTable.tsx`, find:

```ts
  const computeDifference = (row: RowData) => {
    const overall = computeDriverOverall(row)
    if (overall === null) return null
    const prev = Number(row.actualTransferPrev || 0)
    const completed = computeCompletedTransferSum(row)
    return overall - prev - completed
  }
```

Change to:

```ts
  const computeDifference = (row: RowData) => {
    const cancelled = !isDraft(row) && (row as Job).isCancelled
    const overall = computeDriverOverall(row)
    // Cancelled jobs void the driver's closing fees: difference = −(prev + completed transfers).
    if (overall === null && !cancelled) return null
    const prev = Number(row.actualTransferPrev || 0)
    const completed = computeCompletedTransferSum(row)
    return (cancelled ? 0 : (overall ?? 0)) - prev - completed
  }
```

- [ ] **Step 2: Add the red row class**

In `components/jobs/EditableJobTable.tsx`, find the `rowClassName` callback:

```tsx
        rowClassName={(row) => {
          const r = row as RowData
          if (isDraft(r)) return 'draft-row'
          if (r.jobType === 'advance') return 'advance-row'
          if (r.clearStatus) return 'locked-row'
          if (modalEditMode) return 'clickable-row'
          return ''
        }}
```

Change to (locked takes precedence, then cancelled):

```tsx
        rowClassName={(row) => {
          const r = row as RowData
          if (isDraft(r)) return 'draft-row'
          if (r.jobType === 'advance') return 'advance-row'
          if (r.clearStatus) return 'locked-row'
          if (!isDraft(r) && (r as Job).isCancelled) return 'cancelled-row'
          if (modalEditMode) return 'clickable-row'
          return ''
        }}
```

- [ ] **Step 3: Add the `.cancelled-row` style**

In `components/jobs/EditableJobTable.tsx`, find the start of the global style block:

```tsx
      <style jsx global>{`
        .draft-row {
          background-color: #fafafa !important;
        }
```

Insert the cancelled-row rules right after the `.draft-row` block (before `.locked-row td`):

```tsx
        .cancelled-row td {
          background-color: #fff1f0 !important;
        }
        .cancelled-row:hover td {
          background-color: #ffccc7 !important;
        }
        .cancelled-row td.ant-table-cell-fix-left,
        .cancelled-row td.ant-table-cell-fix-right {
          background-color: #fff1f0 !important;
        }
        .cancelled-row:hover td.ant-table-cell-fix-left,
        .cancelled-row:hover td.ant-table-cell-fix-right {
          background-color: #ffccc7 !important;
        }
```

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS (no type errors, no new lint errors).

- [ ] **Step 5: Commit**

```bash
git add components/jobs/EditableJobTable.tsx
git commit -m "feat: void driver fees in table difference for cancelled jobs, red row

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Apply the cancel rule to the Excel export + add ยกเลิก column

**Files:**
- Modify: `lib/utils/jobsExcelGenerator.ts:39-45` (`computeDifference`)
- Modify: `lib/utils/jobsExcelGenerator.ts:94` (header row — add 'ยกเลิก')
- Modify: `lib/utils/jobsExcelGenerator.ts:137` (data row — add cancelled cell)

The export's `JobWithRelations = Job & {...}` already inherits `isCancelled` from `Job` (added in Task 2). The export route uses Prisma `include` (full model), so the value is fetched automatically — no route change needed.

- [ ] **Step 1: Rewrite the export `computeDifference`**

In `lib/utils/jobsExcelGenerator.ts`, find:

```ts
function computeDifference(job: JobWithRelations): number | null {
  const overall = computeDriverOverall(job)
  if (overall === null) return null
  const prev = Number(job.actualTransferPrev || 0)
  const completed = (job.transfers ?? []).filter((t) => t.isCompleted).reduce((s, t) => s + Number(t.amount), 0)
  return overall - prev - completed
}
```

Change to:

```ts
function computeDifference(job: JobWithRelations): number | null {
  const overall = computeDriverOverall(job)
  // Cancelled jobs void the driver's closing fees: difference = −(prev + completed transfers).
  if (overall === null && !job.isCancelled) return null
  const prev = Number(job.actualTransferPrev || 0)
  const completed = (job.transfers ?? []).filter((t) => t.isCompleted).reduce((s, t) => s + Number(t.amount), 0)
  return (job.isCancelled ? 0 : (overall ?? 0)) - prev - completed
}
```

- [ ] **Step 2: Add the 'ยกเลิก' header**

In `lib/utils/jobsExcelGenerator.ts`, find the end of the header array:

```ts
    'ไมล์รถ', 'น้ำมัน OFF (ลิตร)', 'น้ำมันสด (ลิตร)', 'น้ำมันสด (฿)', 'น้ำมันเครดิต (ลิตร)', 'น้ำมันเครดิต (฿)',
    'เคลียร์',
  ]
```

Change to:

```ts
    'ไมล์รถ', 'น้ำมัน OFF (ลิตร)', 'น้ำมันสด (ลิตร)', 'น้ำมันสด (฿)', 'น้ำมันเครดิต (ลิตร)', 'น้ำมันเครดิต (฿)',
    'เคลียร์', 'ยกเลิก',
  ]
```

- [ ] **Step 3: Add the cancelled cell to each data row**

In `lib/utils/jobsExcelGenerator.ts`, find the end of the data-row array (last cell before the closing bracket):

```ts
    job.clearStatus ? '✓' : '',
    ]
```

Change to:

```ts
    job.clearStatus ? '✓' : '',
    job.isCancelled ? '✓' : '',
    ]
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/jobsExcelGenerator.ts
git commit -m "feat: void driver fees in export difference, add ยกเลิก column

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Modal — cancel state, difference formula, carry-over guard

**Files:**
- Modify: `components/jobs/JobFormModal.tsx` (state init ~line 158-225, computed difference ~line 138-156, carry-over condition ~line 1216 & 1242)

This task wires the cancel state into the modal's logic. The footer checkbox UI is Task 7. We split them so the logic compiles and is reviewable before touching the footer JSX.

- [ ] **Step 1: Add `isCancelled` state**

In `components/jobs/JobFormModal.tsx`, find:

```tsx
  const [transfers, setTransfers] = useState<JobTransfer[]>([]);
```

Add right after it:

```tsx
  const [isCancelled, setIsCancelled] = useState(false);
```

- [ ] **Step 2: Initialize `isCancelled` when the modal opens**

In the `useEffect` that runs on `open`, find:

```tsx
      setClearStatus(mode === "edit" && job ? !!job.clearStatus : false);
```

Add right after it:

```tsx
      setIsCancelled(mode === "edit" && job ? !!job.isCancelled : false);
```

- [ ] **Step 3: Void driver fees in the `difference` calc when cancelled**

Find:

```tsx
  const difference =
    driverOverall - Number(watchActualTransfer) - completedTransferSum;
  const totalTransfer = completedTransferSum;
```

Change to (totalTransfer / รวมยอดโอน stays the same — only difference changes):

```tsx
  const difference =
    (isCancelled ? 0 : driverOverall) - Number(watchActualTransfer) - completedTransferSum;
  const totalTransfer = completedTransferSum;
```

- [ ] **Step 4: Make the ส่วนต่าง field show the value when cancelled (not "-")**

The ส่วนต่าง display currently shows "-" when `!driverOverall`. A cancelled job with no fees has `driverOverall === 0`, so it would wrongly show "-". Find:

```tsx
                    <Input
                      disabled
                      styles={{ input: { textAlign: "right" } }}
                      value={
                        !driverOverall
                          ? "-"
                          : difference > 0
                            ? `+${Math.round(difference)}`
                            : String(Math.round(difference))
                      }
                    />
```

Change the condition to also render when cancelled:

```tsx
                    <Input
                      disabled
                      styles={{ input: { textAlign: "right" } }}
                      value={
                        !driverOverall && !isCancelled
                          ? "-"
                          : difference > 0
                            ? `+${Math.round(difference)}`
                            : String(Math.round(difference))
                      }
                    />
```

- [ ] **Step 5: Hide the "ยกยอดไปงานอื่น" trigger when cancelled**

The carry-over button fires when `difference < 0`, which is always true for a cancelled job. Find the column condition:

```tsx
                {(carryOverDone || (driverOverall > 0 && difference < 0 && !isCleared && !watchActualTransfer)) && <Col span={3}>
```

Change to:

```tsx
                {(carryOverDone || (driverOverall > 0 && difference < 0 && !isCleared && !watchActualTransfer && !isCancelled)) && <Col span={3}>
```

And the inner branch a few lines below:

```tsx
                    ) : driverOverall > 0 && difference < 0 && !isCleared && !watchActualTransfer ? (
```

Change to:

```tsx
                    ) : driverOverall > 0 && difference < 0 && !isCleared && !watchActualTransfer && !isCancelled ? (
```

- [ ] **Step 6: Allow clearing a cancelled job despite non-zero difference**

Find the clear button's `disabled` prop:

```tsx
                  disabled={clearing || (!isAdmin && clearStatus) || (!clearStatus && Math.round(difference) !== 0 && !carryOverDone)}
```

Change to (cancelled bypasses the difference-must-be-zero gate):

```tsx
                  disabled={clearing || (!isAdmin && clearStatus) || (!clearStatus && Math.round(difference) !== 0 && !carryOverDone && !isCancelled)}
```

- [ ] **Step 7: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. (`isCancelled` state is set but the checkbox isn't rendered yet — that's Task 7. No unused-var error because it's read in steps 3–6.)

- [ ] **Step 8: Commit**

```bash
git add components/jobs/JobFormModal.tsx
git commit -m "feat: cancel-job logic in modal — void fees in difference, guard carry-over and clear

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Modal — the "ยกเลิกใบงาน" checkbox in the footer

**Files:**
- Modify: `components/jobs/JobFormModal.tsx:1` (import `Checkbox` + `Tooltip`)
- Modify: `components/jobs/JobFormModal.tsx:947-1000` (footer `<div>`)

Placement: same row as the บันทึก button (the footer), per the user. Enabled only when there's a completed transfer and the job isn't cleared. Toggling persists via the existing `onFieldSave` path and updates local state so `difference` recomputes immediately.

- [ ] **Step 1: Import `Checkbox` and `Tooltip`**

In `components/jobs/JobFormModal.tsx`, find the antd import:

```tsx
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Divider,
  Button,
  App,
  Row,
  Col,
  Space,
} from "antd";
```

Change to:

```tsx
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Divider,
  Button,
  App,
  Row,
  Col,
  Space,
  Checkbox,
  Tooltip,
} from "antd";
```

- [ ] **Step 2: Add the checkbox to the footer**

In `components/jobs/JobFormModal.tsx`, find the start of the footer's flex `<div>` and the save-status spans:

```tsx
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
              {saveStatus === "saving" && (
```

Insert the checkbox as the FIRST child inside that `<div>`, before the `saveStatus` spans. Since the row is right-justified, render the checkbox pinned left via `marginRight: "auto"`:

```tsx
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
              {!isAdvance && activeJob && (
                <Tooltip title={completedTransferSum > 0 ? "" : "ต้องมียอดโอนก่อน"}>
                  <Checkbox
                    data-testid="job-cancel-checkbox"
                    style={{ marginRight: "auto" }}
                    checked={isCancelled}
                    disabled={isCleared || completedTransferSum === 0}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setIsCancelled(next);
                      handleSaveStatus("saving");
                      const ok = await onFieldSave(activeJob.id, "isCancelled", next);
                      handleSaveStatus(ok ? "saved" : "error");
                      if (!ok) setIsCancelled(!next);
                    }}
                  >
                    ยกเลิกใบงาน
                  </Checkbox>
                </Tooltip>
              )}
              {saveStatus === "saving" && (
```

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/jobs/JobFormModal.tsx
git commit -m "feat: add ยกเลิกใบงาน checkbox to job modal footer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full build + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: Build completes with no type or compile errors.

- [ ] **Step 2: Manual smoke test**

Run `make dev`, open a driver's month, and verify:

1. Open a job with **no** completed transfer → "ยกเลิกใบงาน" checkbox is **disabled**, tooltip "ต้องมียอดโอนก่อน".
2. Add and complete a transfer (e.g. 3230) → checkbox becomes **enabled**.
3. Tick it → ส่วนต่าง flips to **−3230**; รวมยอดโอน stays **3230**; "ยกยอดไปงานอื่น" button disappears.
4. The เคลียร์ button is **enabled** even though ส่วนต่าง = −3230; clearing locks the job.
5. Untick (on a non-cleared job) → ส่วนต่าง returns to its normal value.
6. In the jobs table, the cancelled job's row is **red**; ส่วนต่าง column shows −3230.
7. Export to Excel → there's a **ยกเลิก** column with `✓` for the cancelled job, and its ส่วนต่าง column shows −3230.

- [ ] **Step 3: Final confirmation**

Report the build result and which smoke-test items passed. No commit (verification only).

---

## Self-Review Notes

- **Spec coverage:** data model (T1–T2), API whitelist (T3), table difference + red row (T4), export difference + ยกเลิก column (T5), modal difference/carry-over/clear gates (T6), footer checkbox enabled-on-transfer (T7), verification (T8). All spec sections covered.
- **`null` nuance:** both `computeDifference` functions (table T4, export T5) and the modal display (T6 step 4) explicitly handle the no-fees-but-cancelled case so ส่วนต่าง shows −completed instead of "-".
- **Totals untouched:** `computeTotal` / `completedTransferSum` and the summary route are never modified — confirmed in T4, T5, T6.
- **Naming consistency:** field is `isCancelled` everywhere (schema, type, RowData, API, modal state, export). Row class `cancelled-row`. Test id `job-cancel-checkbox`.
- **Precedence:** locked (`locked-row`) checked before cancelled (`cancelled-row`) in rowClassName (T4 step 2).
