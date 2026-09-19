# Lark Pool Automation Master Plan

> **For agentic workers:** Execute the six linked subplans in dependency order with `.agents/skills/executing-plans/SKILL.md`. Each subplan has checkbox (`- [ ]`) steps, its own file list, interfaces, static verification, and commit boundary.

**Goal:** At 09:00 Asia/Ho_Chi_Minh, read the current values from the Google Pool Sheet and append them, in order, below the last occupied cell in column L of the Lark `KOC List Official` sheet.

**Architecture:** A Next.js App Router `POST /api/append-koc` route orchestrates one read from Google Sheets, one read from the Lark target, one pure append-range calculation, and one Lark batch write. Upstash QStash invokes the route on a timezone-aware daily schedule. The application has no database, lock, deduplication, application retry, or Pool mutation.

**Tech Stack:** TypeScript, Next.js 16 App Router, Vercel, `googleapis` Google Sheets API v4, `@larksuiteoapi/node-sdk`, Zod, Upstash QStash.

**Spec:** `lark_pool_automation_spec.md`

**Technical design:** `docs/specs/TECH.md`

## How to execute

Implement the subplans in the order defined by the graph. Subplans 3 and 4 can be worked on in parallel after Subplan 1; Subplan 2 waits for the pure filtering helper in Subplan 4. Do not execute the implementation steps from this master file twice: the detailed steps live in the linked subplans.

## Global Constraints

- The Pool source is Google Sheets, column A, with a header in row 1 and data read from `A2:A`; the latest explicit user decision and `docs/specs/TECH.md` resolve the older generic wording in the business spec.
- The destination is the Lark spreadsheet `KOC List Official`, column L only; `L1` is reserved for the header and new values start at row 2 or below.
- Preserve Pool order and values. Drop only `null`, `undefined`, and the empty string; do not trim whitespace, validate usernames, stringify unsupported values, or deduplicate.
- Preserve existing Lark values and gaps. Find the last occupied physical row from the returned Lark range and write immediately below it; never fill an earlier gap.
- A non-empty Pool produces exactly one Lark values write containing one value per row. An empty Pool returns `200` with `POOL_EMPTY` and does not read or write the target.
- Any configuration, provider, range, shape, timeout, or write failure stops the job. Do not retry in application code, do not call the route recursively, and provision QStash with `retries: 0`.
- The endpoint is public in this MVP. Do not add signature verification, shared-secret authentication, idempotency, or a distributed lock.
- Do not write to or clear the Google Pool, do not mark rows as processed, and do not write to any Lark column other than L.
- Keep the implementation at the repository root (`app/`, `lib/`, `types/`); do not introduce `src/`, a database, or another queue.
- Use a Node.js runtime for provider SDKs, avoid caching for the route, and log only sanitized structured metadata (`runId`, counts, rows, durations, provider error codes, and request IDs).
- Plans use static validation and diff inspection only; they do not add or execute a runtime verification runner.

## Subplan graph

| Subplan | Depends on | Parallel-safe with | File |
| --- | --- | --- | --- |
| 1. Foundation and contracts | none | none | [01-foundation.md](2026-09-19-lark-pool-automation-01-foundation.md) |
| 2. Google Pool adapter | 1, 4 | 3 | [02-google-pool.md](2026-09-19-lark-pool-automation-02-google-pool.md) |
| 3. Lark client and target adapter | 1 | 2, 4 | [03-lark-target.md](2026-09-19-lark-pool-automation-03-lark-target.md) |
| 4. Pure append planner | 1 | 3 | [04-append-planner.md](2026-09-19-lark-pool-automation-04-append-planner.md) |
| 5. Orchestration and HTTP route | 2, 3, 4 | none | [05-orchestration-route.md](2026-09-19-lark-pool-automation-05-orchestration-route.md) |
| 6. Runtime environment and QStash schedule | 5 | none | [06-runtime-qstash.md](2026-09-19-lark-pool-automation-06-runtime-qstash.md) |

## Shared interface contract

The six subplans use these shared types and boundaries. Subplan 1 creates the types; later subplans must keep the names and signatures unchanged unless the master plan is amended first.

```ts
export type PoolCellValue = string | number | boolean;

export type AppendPlan = {
  values: PoolCellValue[];
  startRow: number;
  endRow: number;
  targetRange: string;
};

export type JobResult =
  | { status: "success"; count: number; startRow: number; endRow: number }
  | { status: "skipped"; reason: "POOL_EMPTY" };

export type LarkColumnRead = {
  sheetId: string;
  range: string;
  startRow: number;
  values: unknown[][];
};

export interface PoolReader {
  readValues(): Promise<PoolCellValue[]>;
}

export interface TargetSheet {
  readColumnL(): Promise<LarkColumnRead>;
  writeColumnL(range: string, values: PoolCellValue[]): Promise<void>;
}
```

## Final static handoff

After Subplan 6 is complete, run `npm run typecheck && npm run lint`, inspect `git diff --check`, and review that the implementation still satisfies the global constraints above. The final implementation must not expose credentials or Pool values in logs or HTTP error bodies.
