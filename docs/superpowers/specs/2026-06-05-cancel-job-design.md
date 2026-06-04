# Cancel Job (ยกเลิกใบงาน) — Design

**Date:** 2026-06-05
**Status:** Approved (design)

## Goal

Let an operator mark a job as **cancelled (ยกเลิกใบงาน)**. The control is enabled only when the job already has at least one *completed* transfer (มียอดโอนแล้ว). Once cancelled, the money already transferred out is reflected as a negative **ส่วนต่าง (difference)** instead of being offset by the driver's closing fees.

Example from the current UI: a job with one completed transfer of 3,230 and no driver fees, when cancelled, shows **ส่วนต่าง = −3,230**.

## Behavior (confirmed with user)

1. **Difference formula when cancelled:** driver fees (`driverOverall`) are treated as **0** for the difference calculation only. So
   `difference = 0 − actualTransferPrev − completedTransferSum`.
   With no `actualTransferPrev`, this is `−completedTransferSum` (e.g. −3,230).
2. **Totals stay normal:** รวมยอดโอน (`completedTransferSum` / `computeTotal`) and the driver summary route are **NOT** changed — the transferred money is real and still counted.
3. **Clearing is allowed:** a cancelled job can still be cleared/locked even though ส่วนต่าง ≠ 0. The existing "difference must be 0" gate on the clear button is bypassed when the job is cancelled.

## Data Model

Add one persisted boolean to the `Job` model in [prisma/schema.prisma](../../../prisma/schema.prisma), in the "Status fields" group next to `clearStatus`:

```prisma
isCancelled       Boolean   @default(false)
```

Apply with `make migrate-stag` (and `make migrate-prod` at deploy).

Add `isCancelled: boolean` to:
- `Job` interface in [types/job.ts](../../../types/job.ts)
- `RowData` in [components/jobs/EditableJobTable.tsx](../../../components/jobs/EditableJobTable.tsx)
- The `JobWithRelations` shape used by [lib/utils/jobsExcelGenerator.ts](../../../lib/utils/jobsExcelGenerator.ts) (ensure the Prisma select/include carries the field).

## Core Rule (single source of behavior)

The difference computation is duplicated in three places, all of the form
`difference = driverOverall − actualTransferPrev − completedTransferSum`.

The one change applied in each place:

> When `isCancelled` is true, substitute `driverOverall = 0` **in the difference calc only**.

`completedTransferSum` / `computeTotal` (รวมยอดโอน) and the summary aggregation are left untouched.

### Touch points

1. **[components/jobs/JobFormModal.tsx](../../../components/jobs/JobFormModal.tsx)**
   - `difference` uses `(isCancelled ? 0 : driverOverall)`.
   - `totalTransfer` / รวมยอดโอน unchanged.
2. **[components/jobs/EditableJobTable.tsx](../../../components/jobs/EditableJobTable.tsx)** — `computeDifference` returns `(row.isCancelled ? 0 : overall) − prev − completed`. `computeTotal` unchanged.
3. **[lib/utils/jobsExcelGenerator.ts](../../../lib/utils/jobsExcelGenerator.ts)** — same substitution in its `computeDifference`.

## UI — Modal ([JobFormModal.tsx](../../../components/jobs/JobFormModal.tsx))

- A **"ยกเลิกใบงาน"** checkbox in the ส่วนต่าง / clear-status area (footer or near the summary row).
- `disabled` unless `completedTransferSum > 0` and not while `isCleared` (matches other locked-field behavior). Tooltip when disabled: "ต้องมียอดโอนก่อน".
- On toggle → persist via the existing field-save path: `onFieldSave(activeJob.id, "isCancelled", value)`, with local state update so `difference` recomputes immediately.
- **Clear button gate:** change `(!clearStatus && Math.round(difference) !== 0 && !carryOverDone)` to also allow when cancelled — i.e. `&& !isCancelled`. A cancelled job can be cleared despite negative ส่วนต่าง.
- **Carry-over:** when `isCancelled`, do not show the "ยกยอดไปงานอื่น" button (its trigger condition `difference < 0` would otherwise fire). Add `&& !isCancelled` to that condition.

## UI — Table ([EditableJobTable.tsx](../../../components/jobs/EditableJobTable.tsx))

- Cancelled rows render with a **full-row red highlight**, following the existing `locked-row` class pattern in `rowClassName` + the inline `<style>` block. New class `cancelled-row` with a light red background (e.g. `#fff1f0`) and matching fixed-cell + hover rules.
- `clearStatus` (locked) takes visual precedence if both are true — keep the existing `if (r.clearStatus) return 'locked-row'` first, then `if (r.isCancelled) return 'cancelled-row'`.

## API ([app/api/jobs/[id]/route.ts](../../../app/api/jobs/[id]/route.ts))

- Add `"isCancelled"` to `allowedFields` in the PATCH handler. No special parsing needed (plain boolean).

## Excel Export ([lib/utils/jobsExcelGenerator.ts](../../../lib/utils/jobsExcelGenerator.ts))

- Apply the difference substitution (above).
- Add a **"ยกเลิก"** column showing `✓` when `job.isCancelled`, mirroring how `clearStatus` is exported as `✓`. Place it adjacent to the existing clear-status column.

## Out of Scope (YAGNI)

- No separate cancellation reason/timestamp field.
- No change to the summary route — transfers remain counted as confirmed.
- No bulk-cancel action.

## Test Notes

- Modal: checkbox disabled with no completed transfer; enabled after a transfer is completed; toggling flips ส่วนต่าง to `−completedTransferSum` while รวมยอดโอน stays the same.
- Clear button becomes enabled on a cancelled job even though ส่วนต่าง ≠ 0.
- Table shows red row; Excel shows `✓` in ยกเลิก column and the negative ส่วนต่าง matches the modal.
