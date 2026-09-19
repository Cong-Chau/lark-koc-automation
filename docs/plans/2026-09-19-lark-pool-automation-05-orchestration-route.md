# Lark Pool Automation Subplan 5: Orchestration and HTTP Route

> **For agentic workers:** Execute this subplan with `.agents/skills/executing-plans/SKILL.md` after Subplans 2, 3, and 4.

**Goal:** Connect the Google reader, pure append planner, and Lark target adapter behind a non-cached public POST route with one-write orchestration and sanitized responses.

**Architecture:** `lib/append-koc.ts` owns dependency construction, provider call order, result logging, and the single batch-write boundary. `app/api/append-koc/route.ts` owns Node runtime configuration, `runId`, HTTP status mapping, and method handling only.

**Tech Stack:** TypeScript, Next.js 16 App Router Route Handler, Vercel Node.js runtime, `crypto.randomUUID`.

**Spec:** `lark_pool_automation_spec.md`

**Technical design:** `docs/specs/TECH.md`

## Constraints

- Exact call order: Google read → empty check → Lark read → append plan → one Lark write.
- Empty Pool returns `200` with `{ status: "skipped", reason: "POOL_EMPTY" }` and does not read Lark.
- Success returns `200` with count and physical start/end rows.
- Configuration/provider/planning/write errors return generic `500 { status: "error" }`.
- Unsupported methods return `405`; the route does not parse a request body.
- Do not add route caching, signature verification, shared-secret authentication, retry, lock, deduplication, or compensating writes.
- Logs contain only sanitized metadata and never raw Pool values, secrets, tokens, or provider bodies.

## Task 5: Implement orchestration and route

**Depends on:** Subplans 2, 3, and 4

**Files:**
- Create: `lib/append-koc.ts`
- Create: `app/api/append-koc/route.ts`

**Interfaces:**
- Consumes `PoolReader`, `TargetSheet`, `createAppendPlan`, `getAutomationConfig`, `AutomationError`, and `JobResult`.
- Produces `runAppendKoc(runId: string, dependencies?: AppendKocDependencies): Promise<JobResult>`.
- Produces `POST /api/append-koc` and `405` responses for unsupported methods.

- [ ] **Step 1: Implement the orchestration dependency boundary**

Define:

```ts
export type AppendKocDependencies = {
  poolReader: PoolReader;
  targetSheet: TargetSheet;
};

export async function runAppendKoc(
  runId: string,
  dependencies?: AppendKocDependencies,
): Promise<JobResult>;
```

When dependencies are omitted, load configuration once and construct the Google and Lark adapters. Execute only:

```text
Google read
  -> if values.length === 0, log skipped and return
  -> Lark column-L read
  -> create append plan
  -> one Lark column-L write
  -> log success and return count/startRow/endRow
```

Do not read Lark for an empty Pool. Do not perform a second write, retry, deduplication pass, Pool clear, or compensating action.

- [ ] **Step 2: Add sanitized structured logging**

Create a `runId` with `crypto.randomUUID()` in the route. Log JSON metadata with `runId`, `operation: "append-koc"`, `trigger`, `status`, `poolCount`, `startRow`, `endRow`, and `durationMs`. On failure, log only `provider`, `operation`, `errorCode`, and an optional provider request ID.

- [ ] **Step 3: Implement the POST route**

Before writing route code, read the relevant Next.js App Router Route Handler guide under `node_modules/next/dist/docs/` as required by `AGENTS.md`. Export:

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

Implement `POST` without request-body parsing or cache behavior. Return:

```text
success  -> 200 { status: "success", count, startRow, endRow }
skipped  -> 200 { status: "skipped", reason: "POOL_EMPTY" }
failure  -> 500 { status: "error" }
other method -> 405 { status: "error", code: "METHOD_NOT_ALLOWED" }
```

Catch configuration/provider failures at the route boundary, log sanitized metadata, and never return the underlying message or response body. Keep the endpoint public and do not add QStash signature checks.

- [ ] **Step 4: Verify**

Run `npm run typecheck && npm run lint` and inspect the diff for the exact provider call order, one-write guarantee, non-cached Node runtime, 405 behavior, and sanitized response/log boundaries.

- [ ] **Step 5: Commit**

```bash
git add lib/append-koc.ts app/api/append-koc/route.ts
git diff --cached --check
git commit -m "feat: add append KOC route"
```
