# Lark Pool Automation Subplan 2: Google Pool Adapter

> **For agentic workers:** Execute this subplan with `.agents/skills/executing-plans/SKILL.md` after Subplans 1 and 4.

**Goal:** Implement a read-only Google Sheets adapter that returns the current supported scalar values from the configured Pool tab in column A.

**Architecture:** Use a Google service account with the read-only Sheets scope. The adapter reads `<escaped tab name>!A2:A`, delegates cell filtering to the pure helper from Subplan 4, and exposes only the `PoolReader` interface.

**Tech Stack:** TypeScript, `googleapis` Google Sheets API v4, service-account OAuth.

**Spec:** `lark_pool_automation_spec.md`

**Technical design:** `docs/specs/TECH.md`

## Constraints

- The Pool has a header at row 1 and data starts at `A2:A`.
- Use `valueRenderOption: "UNFORMATTED_VALUE"` and read rows in source order.
- Use `https://www.googleapis.com/auth/spreadsheets.readonly`; never request a write-capable scope.
- Drop only `null`, `undefined`, and `""`; preserve duplicates, numbers, booleans, ordinary strings, and whitespace-only strings.
- Reject unsupported cell values instead of silently stringifying them.
- Do not expose a write, clear, or processed-marker operation.

## Task 2: Implement Google Pool adapter

**Depends on:** Subplans 1 and 4

**Files:**
- Create: `lib/google-sheets.ts`

**Interfaces:**
- Consumes `AutomationConfig` from `lib/config.ts`.
- Consumes `PoolReader` and `PoolCellValue` from `types/automation.ts`.
- Consumes `filterPoolValues(rows: unknown[][]): PoolCellValue[]` from `lib/append-plan.ts`.
- Produces `createGooglePoolReader(config: AutomationConfig): PoolReader`.

- [ ] **Step 1: Create the read-only Google client**

Use `googleapis` with service-account credentials and:

```text
https://www.googleapis.com/auth/spreadsheets.readonly
```

Construct the Sheets v4 client from the configured service-account email and normalized private key. Keep the client private to this module and do not expose write-capable methods.

- [ ] **Step 2: Escape the configured tab name and read the Pool**

Escape the configured tab name for A1 notation by wrapping it in single quotes and replacing each internal `'` with `''`. Build `<escaped tab name>!A2:A` and call `spreadsheets.values.get` with the configured spreadsheet ID, `majorDimension: "ROWS"`, and `valueRenderOption: "UNFORMATTED_VALUE"`.

Pass `response.data.values ?? []` to `filterPoolValues`. Preserve the returned order; Google may omit trailing empty rows.

- [ ] **Step 3: Map provider failures and unsupported values**

Return the filtered `PoolCellValue[]`. Preserve duplicate values and whitespace-only strings. If the first cell of a row is an object, array, or unsupported value, throw `AutomationError` with `PROVIDER_RESPONSE_INVALID` instead of converting it.

Map authentication failures to `GOOGLE_AUTH_FAILED` and read/API failures to `GOOGLE_READ_FAILED`. Include only safe provider metadata.

- [ ] **Step 4: Verify**

Run `npm run typecheck && npm run lint` and inspect that this adapter has one Google read path, no Pool mutation path, no retry loop, and no secret logging.

- [ ] **Step 5: Commit**

```bash
git add lib/google-sheets.ts
git diff --cached --check
git commit -m "feat: add read-only Google Pool adapter"
```
