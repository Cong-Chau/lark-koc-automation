# Lark Pool Automation Subplan 3: Lark Client and Target Adapter

> **For agentic workers:** Execute this subplan with `.agents/skills/executing-plans/SKILL.md` after Subplan 1. It can run in parallel with Subplans 2 and 4.

**Goal:** Implement the Lark SDK client and a target-sheet adapter that reads column L with physical row metadata and performs one bounded column-L values write.

**Architecture:** Keep app credentials and SDK construction in `lib/lark-client.ts`. Keep Sheets v2 values request construction, A1 parsing, response validation, and write payload construction in `lib/lark-sheets.ts`.

**Tech Stack:** TypeScript, `@larksuiteoapi/node-sdk`, Lark Sheets v2 values API.

**Spec:** `lark_pool_automation_spec.md`

**Technical design:** `docs/specs/TECH.md`

## Constraints

- Target spreadsheet and sheet ID come from configuration; do not hard-code the row or tab name.
- Read `<sheet-id>!L1:L`, reserving `L1` for the header.
- URL-encode the complete A1 range path segment in raw SDK requests.
- Validate transport success, HTTP success, JSON shape, and Lark `code === 0`.
- If open-ended `L1:L` is rejected, obtain row count from sheet metadata and request a bounded range; never use a hard-coded maximum.
- Write one `valueRange` with `values.map((value) => [value])` and never touch another column.
- Do not retry after a read, shape, timeout, or write failure.

## Task 3: Implement Lark client and target adapter

**Depends on:** Subplan 1

**Files:**
- Create: `lib/lark-client.ts`
- Create: `lib/lark-sheets.ts`

**Interfaces:**
- Consumes `AutomationConfig` from `lib/config.ts`.
- Produces `createLarkClient(config: AutomationConfig)`.
- Produces `createLarkTargetSheet(config: AutomationConfig): TargetSheet`.

- [ ] **Step 1: Initialize the Lark SDK client**

Construct the installed `@larksuiteoapi/node-sdk` client from `LARK_APP_ID`, `LARK_APP_SECRET`, and `LARK_DOMAIN`. Before coding against the SDK, inspect its installed declarations for the exact `Client`, `Domain`, and typed `request` names. Keep credential handling inside this module and do not pass tokens into business logic.

- [ ] **Step 2: Implement the column-L read**

Call:

```text
GET /open-apis/sheets/v2/spreadsheets/{spreadsheetToken}/values/{range}
```

Start with `<sheetId>!L1:L`, URL-encoding the complete range path segment. If the provider rejects the open-ended range, retrieve the target sheet row count from metadata and request `<sheetId>!L1:L{rowCount}` once. Validate transport, HTTP status, response shape, and `code === 0`.

Extract `valueRange.range` and `valueRange.values`. Parse the first physical row from the returned A1 range and return:

```ts
{
  sheetId: config.larkTargetSheetId,
  range: valueRange.range,
  startRow,
  values: valueRange.values,
}
```

Map authentication, range, read, and malformed-response failures to the error codes from Subplan 1.

- [ ] **Step 3: Implement the one-column batch write**

Call:

```text
PUT /open-apis/sheets/v2/spreadsheets/{spreadsheetToken}/values
```

with exactly:

```json
{
  "valueRange": {
    "range": "<sheet-id>!L103:L105",
    "values": [["account_D"], ["account_E"], ["account_F"]]
  }
}
```

Validate transport status, HTTP status, and `code === 0`. When updated range/cell metadata is returned, validate that it refers to the requested L range. Throw `LARK_WRITE_FAILED` or `PROVIDER_RESPONSE_INVALID` without retrying.

- [ ] **Step 4: Verify**

Run `npm run typecheck && npm run lint` and inspect that every Lark range is URL-encoded, every write is one-column-only, and no provider response or credential is logged verbatim.

- [ ] **Step 5: Commit**

```bash
git add lib/lark-client.ts lib/lark-sheets.ts
git diff --cached --check
git commit -m "feat: add Lark column adapter"
```
