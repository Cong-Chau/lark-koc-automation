# Lark Pool Automation Subplan 4: Pure Append Planner

> **For agentic workers:** Execute this subplan with `.agents/skills/executing-plans/SKILL.md` after Subplan 1. It can run in parallel with Subplan 3; Subplan 2 consumes its filtering helper.

**Goal:** Implement pure functions that filter Google Pool rows, map Lark values to physical rows, preserve gaps, and calculate the exact bounded column-L range for one append.

**Architecture:** Keep all planning logic network-free in `lib/append-plan.ts`. The planner receives provider output and returns either `null` for an empty Pool or an `AppendPlan` containing the ordered values and bounded Lark A1 range.

**Tech Stack:** TypeScript only; no provider SDK calls.

**Spec:** `lark_pool_automation_spec.md`

**Technical design:** `docs/specs/TECH.md`

## Constraints

- Filter only `null`, `undefined`, and the empty string from Pool rows.
- Preserve order, duplicates, numbers, booleans, and whitespace-only strings.
- Treat `0`, `false`, and whitespace-only strings in Lark as occupied.
- Never fill a gap between existing Lark values.
- Never generate a target range containing `L1`; data starts at row 2.
- Do not call Google, Lark, QStash, or any other external service.

## Task 4: Implement pure append planning

**Depends on:** Subplan 1

**Files:**
- Create: `lib/append-plan.ts`

**Interfaces:**
- Consumes `PoolCellValue`, `AppendPlan`, and `LarkColumnRead` from `types/automation.ts`.
- Produces `filterPoolValues(rows: unknown[][]): PoolCellValue[]`.
- Produces `findLastOccupiedRow(target: LarkColumnRead, headerRow?: number): number`.
- Produces `createAppendPlan(values: PoolCellValue[], target: LarkColumnRead, headerRow?: number): AppendPlan | null`.

- [ ] **Step 1: Implement Pool scalar filtering**

Implement `filterPoolValues` to inspect only the first cell of each Google row and apply:

```ts
cell !== null && cell !== undefined && cell !== ""
```

Preserve order, duplicates, numbers, booleans, and whitespace-only strings. Throw for unsupported non-scalar values instead of converting them. Do not mutate the input or call a provider.

- [ ] **Step 2: Map Lark values to physical rows**

Implement `findLastOccupiedRow` using `target.startRow` plus the zero-based row index. A cell is occupied when it is not `null`, `undefined`, or `""`; `0`, `false`, and whitespace-only strings are occupied. Ignore rows before `headerRow + 1` and return `headerRow` when no data row is occupied.

For a read beginning at row 1 with values `[header, account_A, "", account_C]`, return `lastOccupiedRow === 4`; the next append starts at row 5 and does not fill row 3.

- [ ] **Step 3: Build the bounded Lark range**

Implement `createAppendPlan` with this exact calculation:

```ts
if (values.length === 0) return null;
const firstInsertRow = Math.max(headerRow + 1, findLastOccupiedRow(target, headerRow) + 1);
const endRow = firstInsertRow + values.length - 1;
return {
  values,
  startRow: firstInsertRow,
  endRow,
  targetRange: `${target.sheetId}!L${firstInsertRow}:L${endRow}`,
};
```

Use the default `headerRow = 1`, never generate row 1, and return `null` only for an already-filtered empty Pool.

- [ ] **Step 4: Verify**

Run `npm run typecheck && npm run lint` and inspect the diff to confirm this module is pure, preserves gaps and order, and contains no provider calls or retry behavior.

- [ ] **Step 5: Commit**

```bash
git add lib/append-plan.ts
git diff --cached --check
git commit -m "feat: add column L append planner"
```
